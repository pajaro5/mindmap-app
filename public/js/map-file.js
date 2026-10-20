// Abrir y guardar mapas como archivo (Archivo › Abrir / Guardar como archivo).
//
// Formato (el de howToCreateAMindmap.md):
//   .json  { format: 'mindmap-app', version: 1, title, data: { layout, root, theme, view } }
//          También se acepta sin `format`/`version` ({ title, data }) o solo los datos
//          ({ root, … }), que es lo que escribe una persona o una IA a mano.
//   .zip   el .json (mapa.json, o el único .json) más los archivos que referencian sus temas:
//            imageFile       imagen del tema (se incrusta como al insertarla en la app)
//            imageWidth      ancho con el que se muestra (opcional)
//            attachmentFile  adjunto (se sube a la API de archivos del mapa nuevo)
//          Las rutas son relativas al .json; vale comprimir la carpeta entera.
// Al guardar, las imágenes van incrustadas en el .json y los adjuntos van en adjuntos/ del
// .zip; sin adjuntos se guarda un .json suelto.
// Abrir un archivo siempre crea un mapa nuevo: nunca sobrescribe otro.

const MAP_FILE_FORMAT = 'mindmap-app'
const MAP_FILE_VERSION = 1
const MAP_FILE_MAX_BYTES = 200 * 1024 * 1024
const MAP_JSON_MAX_BYTES = 20 * 1024 * 1024   // límite del cuerpo JSON en el servidor
const MAP_FILE_ATTACHMENT_DIR = 'adjuntos'
const IMAGE_FILE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }

// Error con un mensaje para el usuario
class MapFileError extends Error {}

// ---- Lectura de ZIP (sin compresión o deflate; sin ZIP64 ni cifrado) ----
async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

// Devuelve Map(nombre → Uint8Array) con los archivos (no las carpetas) del ZIP
async function readZip(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  // Fin del directorio central: está en los últimos 22 bytes + comentario (hasta 64 KB)
  let end = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break }
  }
  if (end < 0) throw new MapFileError('El archivo .zip no es válido o está dañado.')
  const count = view.getUint16(end + 10, true)
  let at = view.getUint32(end + 16, true)
  if (count === 0xffff || at === 0xffffffff) throw new MapFileError('El .zip usa el formato ZIP64, que no se admite.')
  const decoder = new TextDecoder()
  const files = new Map()
  for (let n = 0; n < count; n++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50) throw new MapFileError('El archivo .zip no es válido o está dañado.')
    const flags = view.getUint16(at + 8, true)
    const method = view.getUint16(at + 10, true)
    const size = view.getUint32(at + 20, true)
    const nameLen = view.getUint16(at + 28, true)
    const extraLen = view.getUint16(at + 30, true)
    const commentLen = view.getUint16(at + 32, true)
    const offset = view.getUint32(at + 42, true)
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLen))
    at += 46 + nameLen + extraLen + commentLen
    if (name.endsWith('/')) continue
    if (flags & 1) throw new MapFileError(`El .zip está cifrado ("${name}"): guárdalo sin contraseña.`)
    if (offset + 30 > bytes.length || view.getUint32(offset, true) !== 0x04034b50) throw new MapFileError('El archivo .zip no es válido o está dañado.')
    const start = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true)
    const raw = bytes.subarray(start, start + size)
    if (method === 0) files.set(name, raw)
    else if (method === 8) files.set(name, await inflateRaw(raw))
    else throw new MapFileError(`"${name}" usa una compresión que no se admite.`)
  }
  return files
}

// ---- Rutas dentro del ZIP ----
function normalizeZipPath(path) {
  const parts = []
  for (const part of String(path).replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return parts.join('/')
}

const zipDir = path => path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : ''

// Busca `relative` (relativa a la carpeta `baseDir`); si no está tal cual, sin distinguir mayúsculas
function findZipEntry(files, baseDir, relative) {
  const target = normalizeZipPath(baseDir + String(relative))
  if (files.has(target)) return target
  const lower = target.toLowerCase()
  return [...files.keys()].find(name => name.toLowerCase() === lower) || null
}

// El .json del mapa: mapa.json (el menos profundo) o, si no hay, el único .json
function findMapJson(files) {
  const jsons = [...files.keys()]
    .filter(name => /\.json$/i.test(name) && !name.split('/').some(p => p.startsWith('.') || p === '__MACOSX'))
    .sort((a, b) => a.split('/').length - b.split('/').length)
  const main = jsons.find(name => /(^|\/)mapa\.json$/i.test(name))
  if (main) return main
  if (jsons.length === 1) return jsons[0]
  if (!jsons.length) throw new MapFileError('El .zip no contiene ningún archivo .json con el mapa.')
  throw new MapFileError('El .zip tiene varios .json: llama mapa.json al del mapa.')
}

// ---- Contenido del archivo ----
// Misma comprobación de forma que el servidor (validation.js)
function isMapFileData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false
  const isNode = (node, depth) => depth < 200 && !!node && typeof node === 'object' &&
    !!node.data && typeof node.data === 'object' && !Array.isArray(node.data) &&
    (node.children === undefined || (Array.isArray(node.children) && node.children.every(c => isNode(c, depth + 1))))
  return isNode(data.root, 0) &&
    (data.layout === undefined || typeof data.layout === 'string') &&
    (data.theme === undefined || (typeof data.theme === 'object' && data.theme !== null))
}

const titleFromFileName = name => String(name || '').replace(/^.*[\\/]/, '').replace(/\.(json|zip)$/i, '').trim()

// Texto del .json → { title, data }
function parseMapFile(text, fileName) {
  let parsed
  try {
    parsed = JSON.parse(String(text).replace(/^﻿/, ''))
  } catch (err) {
    throw new MapFileError(`El archivo no es un JSON válido: ${err.message}`)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new MapFileError('El archivo no contiene un mapa.')
  if (parsed.format !== undefined && parsed.format !== MAP_FILE_FORMAT) throw new MapFileError('El archivo no es un mapa de esta aplicación.')
  if (Number(parsed.version) > MAP_FILE_VERSION) throw new MapFileError('El mapa se guardó con una versión más nueva de la aplicación.')
  const data = parsed.data !== undefined ? parsed.data : parsed.root !== undefined ? parsed : null
  if (!isMapFileData(data)) throw new MapFileError('El archivo no tiene la estructura de un mapa (falta data.root o un tema no tiene "data").')
  const title = typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : titleFromFileName(fileName) || 'Mapa importado'
  return { title, data }
}

const topicLabel = data => `"${String(data.text || '').replace(/<[^>]+>/g, '').trim().slice(0, 40) || 'sin texto'}"`

// Recorre los temas y resuelve los archivos que referencian. Modifica `data` en sitio.
// `files` es el contenido del ZIP (o null para un .json suelto) y `baseDir` la carpeta del
// .json dentro del ZIP. Devuelve { attachments: [{ data, name, bytes }], warnings: [] }.
async function resolveMapFiles(data, files, baseDir = '') {
  const attachments = []
  const warnings = []
  const nodes = []
  const collect = node => {
    nodes.push(node.data)
    ;(node.children || []).forEach(collect)
  }
  collect(data.root)
  for (const d of nodes) {
    // Un adjunto de otro mapa u otra instalación no existe aquí
    if (d.attachmentUrl !== undefined) {
      warnings.push(`Se quitó el adjunto del tema ${topicLabel(d)}: pertenece a otro mapa.`)
      delete d.attachmentUrl
      // El nombre se conserva si el tema trae su propio archivo (attachmentFile)
      if (d.attachmentFile === undefined) delete d.attachmentName
    }
    if (d.imageFile !== undefined) {
      const ref = String(d.imageFile)
      const width = Number(d.imageWidth)
      delete d.imageFile
      delete d.imageWidth
      const entry = files && findZipEntry(files, baseDir, ref)
      const type = IMAGE_FILE_TYPES[(ref.split('.').pop() || '').toLowerCase()]
      if (!files) warnings.push(`Falta la imagen "${ref}" del tema ${topicLabel(d)}: abre el .zip con las imágenes, no el .json.`)
      else if (!entry) warnings.push(`Falta la imagen "${ref}" del tema ${topicLabel(d)}.`)
      else if (!type) warnings.push(`"${ref}" (tema ${topicLabel(d)}) no es una imagen PNG, JPEG, GIF o WebP.`)
      else {
        try {
          const img = await readImageFile(new File([files.get(entry)], entry.split('/').pop(), { type }))
          d.image = img.url
          d.imageTitle = escapeXml(d.imageTitle ? unescapeXml(d.imageTitle) : entry.split('/').pop())
          d.imageSize = Number.isFinite(width) && width > 0
            ? { width: Math.round(width), height: Math.round(width * img.height / img.width), custom: true }
            : { width: img.width, height: img.height, custom: false }
        } catch (err) {
          warnings.push(`No se pudo usar la imagen "${ref}" (tema ${topicLabel(d)}): ${err.message}`)
        }
      }
      if (!d.image) delete d.imageTitle
    }
    if (d.attachmentFile !== undefined) {
      const ref = String(d.attachmentFile)
      const name = typeof d.attachmentName === 'string' && d.attachmentName.trim() ? unescapeXml(d.attachmentName.trim()) : ref.replace(/^.*[\\/]/, '')
      delete d.attachmentFile
      delete d.attachmentName
      const entry = files && findZipEntry(files, baseDir, ref)
      if (!files) warnings.push(`Falta el adjunto "${ref}" del tema ${topicLabel(d)}: abre el .zip con los adjuntos, no el .json.`)
      else if (!entry) warnings.push(`Falta el adjunto "${ref}" del tema ${topicLabel(d)}.`)
      else attachments.push({ data: d, name, bytes: files.get(entry) })
    }
  }
  return { attachments, warnings }
}

// Archivo elegido por el usuario → { title, data, attachments, warnings }
async function readMapFile(file) {
  if (file.size > MAP_FILE_MAX_BYTES) throw new MapFileError(`El archivo supera ${MAP_FILE_MAX_BYTES / 1024 / 1024} MB.`)
  const bytes = new Uint8Array(await file.arrayBuffer())
  const isZip = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
  if (!isZip && !/\.json$/i.test(file.name)) throw new MapFileError('Elige un mapa guardado como .json o .zip.')
  let map
  let resolved
  if (isZip) {
    const files = await readZip(bytes)
    const jsonName = findMapJson(files)
    map = parseMapFile(new TextDecoder().decode(files.get(jsonName)), file.name)
    resolved = await resolveMapFiles(map.data, files, zipDir(jsonName))
  } else {
    map = parseMapFile(new TextDecoder().decode(bytes), file.name)
    resolved = await resolveMapFiles(map.data, null)
  }
  const size = new Blob([JSON.stringify({ title: map.title, data: map.data })]).size
  if (size > MAP_JSON_MAX_BYTES) {
    throw new MapFileError(`El mapa ocupa ${(size / 1024 / 1024).toFixed(1)} MB con sus imágenes; el máximo es ${MAP_JSON_MAX_BYTES / 1024 / 1024} MB. Reduce las imágenes.`)
  }
  return { ...map, ...resolved }
}

// ---- Guardar ----
// Nombre único dentro de adjuntos/ (sin caracteres que no admitan los sistemas de archivos)
function uniqueAttachmentPath(name, used) {
  const clean = String(name || 'archivo').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim().slice(0, 120) || 'archivo'
  const dot = clean.lastIndexOf('.')
  const [base, ext] = dot > 0 ? [clean.slice(0, dot), clean.slice(dot)] : [clean, '']
  let candidate = clean
  for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${base} (${n})${ext}`
  used.add(candidate.toLowerCase())
  return `${MAP_FILE_ATTACHMENT_DIR}/${candidate}`
}

// Datos del mapa → { name, blob }: .json, o .zip si algún tema tiene adjunto.
// `fetchFile(url)` devuelve el contenido de un adjunto (Uint8Array).
async function buildMapFile(mapData, title, fetchFile) {
  const data = JSON.parse(JSON.stringify(mapData))
  const used = new Set()
  const extra = []
  const walk = async node => {
    const d = node.data
    if (d.attachmentUrl !== undefined) {
      const url = d.attachmentUrl
      const name = unescapeXml(d.attachmentName || '') || 'archivo'
      delete d.attachmentUrl
      delete d.attachmentName
      if (isAttachmentUrl(url)) {
        const path = uniqueAttachmentPath(name, used)
        extra.push({ name: path, data: await fetchFile(url) })
        d.attachmentFile = path
        d.attachmentName = name
      }
    }
    for (const child of node.children || []) await walk(child)
  }
  await walk(data.root)
  const json = JSON.stringify({ format: MAP_FILE_FORMAT, version: MAP_FILE_VERSION, title, data }, null, 2)
  const base = exportFileName(title).replace(/\.html$/, '')
  if (!extra.length) return { name: `${base}.json`, blob: new Blob([json], { type: 'application/json' }) }
  const zip = buildZip([{ name: 'mapa.json', text: json }, ...extra])
  return { name: `${base}.zip`, blob: new Blob([zip], { type: 'application/zip' }) }
}

const isMapFileName = name => /\.(json|zip)$/i.test(String(name || ''))
