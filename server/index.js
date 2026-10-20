const express = require('express')
const crypto = require('crypto')
const db = require('./db')
const files = require('./files')
const { cleanTitle, cleanDescription, isValidMapData, isValidThemeFormat } = require('./validation')

const app = express()
const PORT = process.env.PORT || 3001

// Adjuntos: van antes de express.json porque su cuerpo es binario
app.use(files.router)
app.use(express.json({ limit: '20mb' }))
app.use(express.static(require('path').join(__dirname, '..', 'public')))

const defaultMapData = () => ({
  layout: 'mindMap',
  root: {
    data: { text: 'Tema central', expand: true },
    children: []
  },
  theme: { template: 'mindmanager', config: {} },
  view: {}
})

// Listar mapas (sin el contenido completo, solo metadata)
app.get('/api/maps', (req, res) => {
  const rows = db
    .prepare('SELECT id, title, created_at, updated_at FROM maps ORDER BY updated_at DESC')
    .all()
  res.json(rows)
})

// Crear mapa nuevo. Con `data` (p. ej. desde una plantilla) se usa ese contenido
app.post('/api/maps', (req, res) => {
  const body = req.body || {}
  const title = cleanTitle(body.title, 'Mapa sin título')
  if (!title.ok) return res.status(400).json({ error: title.error })
  if (body.data !== undefined && !isValidMapData(body.data)) {
    return res.status(400).json({ error: 'Datos de mapa no válidos' })
  }
  const id = crypto.randomUUID()
  const data = JSON.stringify(body.data !== undefined ? body.data : defaultMapData())
  db.prepare('INSERT INTO maps (id, title, data) VALUES (?, ?, ?)').run(id, title.value, data)
  const row = db.prepare('SELECT * FROM maps WHERE id = ?').get(id)
  res.status(201).json({ ...row, data: JSON.parse(row.data) })
})

// Obtener un mapa completo
app.get('/api/maps/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM maps WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'Mapa no encontrado' })
  res.json({ ...row, data: JSON.parse(row.data) })
})

// Actualizar título y/o contenido del mapa
app.put('/api/maps/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM maps WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'Mapa no encontrado' })

  const body = req.body || {}
  const title = cleanTitle(body.title, row.title)
  if (!title.ok) return res.status(400).json({ error: title.error })
  if (body.data !== undefined && !isValidMapData(body.data)) {
    return res.status(400).json({ error: 'Datos de mapa no válidos' })
  }
  const data = body.data !== undefined ? JSON.stringify(body.data) : row.data

  db.prepare(
    `UPDATE maps SET title = ?, data = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(title.value, data, req.params.id)

  const updated = db.prepare('SELECT * FROM maps WHERE id = ?').get(req.params.id)
  res.json({ ...updated, data: JSON.parse(updated.data) })
})

// Borrar mapa
app.delete('/api/maps/:id', (req, res) => {
  db.prepare('DELETE FROM maps WHERE id = ?').run(req.params.id)
  files.deleteFilesOfMap(req.params.id)
  res.status(204).end()
})

// ---- Plantillas del usuario ----
const templateRow = row => ({ id: row.id, title: row.title, description: row.description, created_at: row.created_at, data: JSON.parse(row.data) })

app.get('/api/templates', (req, res) => {
  const rows = db.prepare('SELECT * FROM templates ORDER BY created_at DESC, title').all()
  res.json(rows.map(templateRow))
})

app.post('/api/templates', (req, res) => {
  const body = req.body || {}
  const title = cleanTitle(body.title, '')
  if (!title.ok || !title.value) return res.status(400).json({ error: title.error || 'La plantilla necesita un nombre' })
  if (!isValidMapData(body.data)) return res.status(400).json({ error: 'Datos de mapa no válidos' })
  const id = crypto.randomUUID()
  db.prepare('INSERT INTO templates (id, title, description, data) VALUES (?, ?, ?, ?)')
    .run(id, title.value, cleanDescription(body.description), JSON.stringify(body.data))
  res.status(201).json(templateRow(db.prepare('SELECT * FROM templates WHERE id = ?').get(id)))
})

app.delete('/api/templates/:id', (req, res) => {
  const result = db.prepare('DELETE FROM templates WHERE id = ?').run(req.params.id)
  if (!result.changes) return res.status(404).json({ error: 'Plantilla no encontrada' })
  res.status(204).end()
})

// ---- Temas propios (formato de mapa con nombre) ----
const themeRow = row => ({ id: row.id, title: row.title, created_at: row.created_at, format: JSON.parse(row.data) })

app.get('/api/themes', (req, res) => {
  const rows = db.prepare('SELECT * FROM themes ORDER BY created_at, title').all()
  res.json(rows.map(themeRow))
})

app.post('/api/themes', (req, res) => {
  const body = req.body || {}
  const title = cleanTitle(body.title, '')
  if (!title.ok || !title.value) return res.status(400).json({ error: title.error || 'El tema necesita un nombre' })
  if (!isValidThemeFormat(body.format)) return res.status(400).json({ error: 'Formato de tema no válido' })
  const id = crypto.randomUUID()
  db.prepare('INSERT INTO themes (id, title, data) VALUES (?, ?, ?)').run(id, title.value.slice(0, 60), JSON.stringify(body.format))
  res.status(201).json(themeRow(db.prepare('SELECT * FROM themes WHERE id = ?').get(id)))
})

app.delete('/api/themes/:id', (req, res) => {
  const result = db.prepare('DELETE FROM themes WHERE id = ?').run(req.params.id)
  if (!result.changes) return res.status(404).json({ error: 'Tema no encontrado' })
  res.status(204).end()
})

const server = app.listen(PORT, () => {
  console.log(`Mindmap app corriendo en http://localhost:${PORT}`)
})

// Node cierra las conexiones keep-alive inactivas a los 5 s. Un cliente que reutiliza una
// conexión justo cuando el servidor la cierra recibe ECONNRESET. Se amplía el margen para
// que siempre cierre antes el cliente que el servidor.
server.keepAliveTimeout = 65_000
server.headersTimeout = 66_000
