// Importa un mapa escrito a mano (formato de howToCreateAMindmap.md) en la app.
//
//   node scripts/import-map.js <mapa.json> [--server http://localhost:3001] [--out salida.json]
//
// Además de los campos normales de un tema, acepta dos campos "de autor" que la app no
// guarda tal cual y que este script resuelve:
//   imageFile        ruta (relativa al JSON) de una imagen PNG, JPEG, GIF o WebP: se incrusta
//                    como data URL en `image`, con `imageSize` y `imageTitle`
//   imageWidth       (opcional) ancho en px con el que se muestra la imagen; sin él, la app
//                    la reduce para que quepa en 200×100
//   attachmentFile   ruta de un archivo cualquiera: se sube como adjunto del mapa
//   attachmentName   (opcional) nombre que se muestra del adjunto
// Con --out solo escribe el JSON con las imágenes incrustadas (no sube nada ni crea el mapa;
// los adjuntos se descartan con un aviso).
const fs = require('fs')
const path = require('path')

const IMAGE_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' }
const IMAGE_MAX_BYTES = 10 * 1024 * 1024
const IMAGE_WARN_SIDE = 1024        // la app reduce a 1024 px las imágenes que inserta el usuario
const BODY_MAX_BYTES = 20 * 1024 * 1024   // límite de express.json en el servidor

const escapeXml = text => String(text ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

// Ancho y alto leyendo la cabecera de la imagen (sin dependencias)
function imageDimensions(buf, mime) {
  if (mime === 'image/png') {
    if (buf.toString('ascii', 1, 4) !== 'PNG') throw new Error('no es un PNG válido')
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
  }
  if (mime === 'image/gif') {
    if (buf.toString('ascii', 0, 3) !== 'GIF') throw new Error('no es un GIF válido')
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) }
  }
  if (mime === 'image/webp') {
    if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') throw new Error('no es un WebP válido')
    const chunk = buf.toString('ascii', 12, 16)
    if (chunk === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) }
    if (chunk === 'VP8L') {
      const bits = buf.readUInt32LE(21)
      return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) }
    }
    if (chunk === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff }
    throw new Error('WebP con un formato desconocido')
  }
  // JPEG: buscar el marcador SOFn
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('no es un JPEG válido')
  let i = 2
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue }
    const marker = buf[i + 1]
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) }
    }
    i += 2 + buf.readUInt16BE(i + 2)
  }
  throw new Error('JPEG sin dimensiones')
}

function embedImage(data, baseDir, where) {
  const file = path.resolve(baseDir, String(data.imageFile))
  const mime = IMAGE_TYPES[path.extname(file).toLowerCase()]
  if (!mime) throw new Error(`${where}: imageFile "${data.imageFile}" no es PNG, JPEG, GIF ni WebP`)
  if (!fs.existsSync(file)) throw new Error(`${where}: no existe la imagen "${data.imageFile}"`)
  const buf = fs.readFileSync(file)
  if (buf.length > IMAGE_MAX_BYTES) throw new Error(`${where}: "${data.imageFile}" supera 10 MB`)
  let size
  try {
    size = imageDimensions(buf, mime)
  } catch (err) {
    throw new Error(`${where}: "${data.imageFile}" ${err.message}`)
  }
  if (Math.max(size.width, size.height) > IMAGE_WARN_SIDE) {
    console.warn(`Aviso: ${where}: "${data.imageFile}" mide ${size.width}×${size.height}; conviene reducirla a ${IMAGE_WARN_SIDE} px de lado`)
  }
  data.image = `data:${mime};base64,${buf.toString('base64')}`
  data.imageTitle = escapeXml(data.imageTitle || path.basename(file))
  const width = Number(data.imageWidth)
  data.imageSize = Number.isFinite(width) && width > 0
    ? { width: Math.round(width), height: Math.round(width * size.height / size.width), custom: true }
    : { width: size.width, height: size.height, custom: false }
  delete data.imageFile
  delete data.imageWidth
}

// Recorre los temas: incrusta imágenes y devuelve los adjuntos pendientes de subir
function prepare(root, baseDir) {
  const attachments = []
  const walk = (node, where) => {
    if (!node || typeof node !== 'object' || !node.data || typeof node.data !== 'object') {
      throw new Error(`${where}: cada tema necesita un objeto "data"`)
    }
    const data = node.data
    const label = `${where} "${String(data.text || '').slice(0, 40)}"`
    if (data.imageFile !== undefined) embedImage(data, baseDir, label)
    if (data.attachmentFile !== undefined) {
      const file = path.resolve(baseDir, String(data.attachmentFile))
      if (!fs.existsSync(file)) throw new Error(`${label}: no existe el adjunto "${data.attachmentFile}"`)
      attachments.push({ data, file, name: data.attachmentName || path.basename(file) })
      delete data.attachmentFile
      delete data.attachmentName
    }
    if (node.children !== undefined && !Array.isArray(node.children)) throw new Error(`${label}: "children" debe ser un array`)
    ;(node.children || []).forEach((child, i) => walk(child, `${where}.${i + 1}`))
  }
  walk(root, 'tema')
  return attachments
}

async function request(url, options) {
  const res = await fetch(url, options)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${options.method} ${url}: HTTP ${res.status} ${body.error || ''}`.trim())
  return body
}

async function main() {
  const args = process.argv.slice(2)
  const option = name => {
    const i = args.indexOf(name)
    if (i === -1) return undefined
    const [, value] = args.splice(i, 2)
    return value
  }
  const server = (option('--server') || 'http://localhost:3001').replace(/\/+$/, '')
  const out = option('--out')
  const input = args[0]
  if (!input) {
    console.error('Uso: node scripts/import-map.js <mapa.json> [--server http://localhost:3001] [--out salida.json]')
    process.exit(2)
  }

  const map = JSON.parse(fs.readFileSync(input, 'utf8').replace(/^﻿/, ''))
  if (!map || !map.data || !map.data.root) throw new Error('El archivo necesita "data.root" (ver howToCreateAMindmap.md)')
  const attachments = prepare(map.data.root, path.dirname(path.resolve(input)))

  const body = JSON.stringify({ title: map.title, data: map.data })
  if (Buffer.byteLength(body) > BODY_MAX_BYTES) {
    throw new Error(`El mapa ocupa ${(Buffer.byteLength(body) / 1024 / 1024).toFixed(1)} MB con las imágenes; el máximo es 20 MB. Reduce o comprime las capturas.`)
  }

  if (out) {
    if (attachments.length) console.warn(`Aviso: con --out no se suben adjuntos; se descartan ${attachments.length}`)
    fs.writeFileSync(out, JSON.stringify(map, null, 2))
    console.log(`Escrito ${out}`)
    return
  }

  const created = await request(`${server}/api/maps`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
  if (attachments.length) {
    // Los adjuntos pertenecen a un mapa: se suben después de crearlo y se guarda el mapa otra vez
    for (const a of attachments) {
      const file = await request(`${server}/api/maps/${created.id}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(a.name) },
        body: fs.readFileSync(a.file)
      })
      a.data.attachmentUrl = file.url
      a.data.attachmentName = escapeXml(file.name)
    }
    await request(`${server}/api/maps/${created.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: map.data })
    })
  }
  console.log(`Mapa "${created.title}" creado (id ${created.id}) con ${attachments.length} adjunto(s). Ábrelo desde la lista de mapas.`)
}

main().catch(err => {
  console.error(`Error: ${err.message}`)
  process.exit(1)
})
