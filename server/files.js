// API de adjuntos.
//   POST   /api/maps/:id/files   sube un archivo (cuerpo binario; nombre en X-File-Name)
//   GET    /api/files/:fileId    lo descarga
//
// Seguridad:
//  - Los ids los genera el servidor (UUID) y se validan antes de tocar el disco: nunca se
//    usa el nombre del usuario como ruta, así que no hay path traversal.
//  - Se sirven SIEMPRE como descarga (Content-Disposition: attachment), como binario
//    genérico, con nosniff y CSP sandbox: un HTML o SVG malicioso adjunto no se ejecuta
//    dentro de la app.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const express = require('express')
const db = require('./db')

const FILES_DIR = process.env.FILES_DIR || path.join(__dirname, '..', 'data', 'files')
const MAX_FILE_BYTES = Number(process.env.MAX_FILE_BYTES || 25 * 1024 * 1024)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

fs.mkdirSync(FILES_DIR, { recursive: true })

const filePath = id => path.join(FILES_DIR, id)

// Nombre seguro para mostrar y para la cabecera de descarga: sin rutas, sin caracteres de
// control y con longitud acotada
function sanitizeFileName(raw) {
  let name = ''
  try {
    name = decodeURIComponent(String(raw || ''))
  } catch {
    name = String(raw || '')
  }
  name = path.basename(name.replace(/\\/g, '/'))
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 200)
  return name || 'archivo'
}

function sanitizeMime(raw) {
  const mime = String(raw || '').split(';')[0].trim().toLowerCase()
  return /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(mime) ? mime : 'application/octet-stream'
}

function deleteFilesOfMap(mapId) {
  const rows = db.prepare('SELECT id FROM files WHERE map_id = ?').all(mapId)
  for (const { id } of rows) fs.rmSync(filePath(id), { force: true })
  db.prepare('DELETE FROM files WHERE map_id = ?').run(mapId)
}

const router = express.Router()

router.post(
  '/api/maps/:id/files',
  express.raw({ type: () => true, limit: MAX_FILE_BYTES }),
  (req, res) => {
    const map = db.prepare('SELECT id FROM maps WHERE id = ?').get(req.params.id)
    if (!map) return res.status(404).json({ error: 'Mapa no encontrado' })
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: 'El archivo está vacío' })
    }

    const id = crypto.randomUUID()
    const name = sanitizeFileName(req.get('X-File-Name'))
    const mime = sanitizeMime(req.get('Content-Type'))
    fs.writeFileSync(filePath(id), req.body)
    db.prepare('INSERT INTO files (id, map_id, name, mime, size) VALUES (?, ?, ?, ?, ?)')
      .run(id, map.id, name, mime, req.body.length)

    res.status(201).json({ id, name, mime, size: req.body.length, url: `/api/files/${id}` })
  }
)

router.get('/api/files/:fileId', (req, res) => {
  const { fileId } = req.params
  if (!UUID_RE.test(fileId)) return res.status(404).json({ error: 'Archivo no encontrado' })
  const row = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId)
  if (!row || !fs.existsSync(filePath(fileId))) return res.status(404).json({ error: 'Archivo no encontrado' })

  res.set({
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${row.name.replace(/[^\x20-\x7e]|["\\]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(row.name)}`,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "sandbox; default-src 'none'"
  })
  res.sendFile(filePath(fileId))
})

// Errores del cuerpo binario (p. ej. archivo demasiado grande) como JSON legible
router.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: `El archivo supera el máximo de ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB` })
  }
  next(err)
})

module.exports = { router, deleteFilesOfMap, sanitizeFileName }
