// Elementos del tema: hipervínculos, adjuntos, notas e imágenes.
// Validación y saneado de datos, procesado de imágenes y subida de adjuntos.
//
// simple-mind-map confía en los datos del mapa:
//  - pinta el hipervínculo como <a href> sin mirar el esquema (un "javascript:" se ejecutaría)
//  - mete hyperlinkTitle y attachmentName en el SVG como <title>${texto}</title> SIN escapar
// Por eso todo valor que llega a esos campos pasa por aquí, tanto al editarlo como al abrir
// un mapa (que puede venir importado o modificado fuera de la app).

const SAFE_LINK_SCHEMES = ['http:', 'https:', 'mailto:']
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
const IMAGE_MAX_SIDE = 1024        // px: las imágenes más grandes se reducen antes de guardarlas
const IMAGE_MAX_BYTES = 10 * 1024 * 1024

// Normaliza y valida un hipervínculo. Devuelve { ok, url } o { ok: false, error }
function normalizeHyperlink(raw) {
  let text = String(raw || '').trim()
  if (!text) return { ok: false, error: 'Escribe una dirección.' }
  // "ejemplo.com/x" → "https://ejemplo.com/x"; "a@b.com" → "mailto:a@b.com"
  if (/^[^\s:/@]+@[^\s@]+\.[^\s@]+$/.test(text)) text = `mailto:${text}`
  else if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) text = `https://${text}`
  let url
  try {
    url = new URL(text)
  } catch {
    return { ok: false, error: 'La dirección no es válida.' }
  }
  if (!SAFE_LINK_SCHEMES.includes(url.protocol)) {
    return { ok: false, error: 'Solo se permiten vínculos http, https o mailto.' }
  }
  return { ok: true, url: url.href }
}

function isSafeHyperlink(url) {
  // Vínculos a otro tema o a otro mapa (topic-links.js)
  if (internalLinkOf(url)) return true
  try {
    return SAFE_LINK_SCHEMES.includes(new URL(url).protocol)
  } catch {
    return false
  }
}

// Escapa texto para que la librería pueda insertarlo como markup SVG sin riesgo
function escapeXml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// Inverso de escapeXml, para mostrar en los formularios el texto tal como lo escribió el usuario
function unescapeXml(text) {
  return String(text ?? '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&amp;/g, '&')
}

// Un texto ya escapado no contiene < ni > ni & sueltos
function isEscapedXml(text) {
  return !/[<>"']|&(?!(amp|lt|gt|quot|#39);)/.test(String(text ?? ''))
}

const isAttachmentUrl = url => /^\/api\/files\/[0-9a-f-]{36}$/.test(String(url || ''))
const isImageDataUrl = url => /^data:image\/(png|jpeg|gif|webp);base64,/i.test(String(url || ''))
// El plugin nodeBase64ImageStorage sustituye el data URL del tema por una clave y guarda la
// imagen en root.data.imgMap[clave]; esas claves también son válidas
const isImageKey = url => /^smm_img_key_[0-9a-zA-Z-]+$/.test(String(url || ''))
const isSafeImageUrl = url => isImageDataUrl(url) || isImageKey(url) || isAttachmentUrl(url)

// Sanea en sitio el árbol de datos de un mapa antes de dárselo a la librería.
// Devuelve cuántos valores se corrigieron (para registrarlo).
function sanitizeMapTree(root) {
  let fixed = 0
  // Almacén de imágenes del plugin nodeBase64ImageStorage: solo data URLs de imagen.
  // Se limpia primero para que los temas que apunten a una entrada descartada pierdan la imagen
  const imgMap = root && root.data && root.data.imgMap
  if (imgMap && typeof imgMap === 'object') {
    for (const key of Object.keys(imgMap)) {
      if (!isImageKey(key) || !isImageDataUrl(imgMap[key])) { delete imgMap[key]; fixed++ }
    }
  }
  // Una imagen sin tamaño válido o con una clave que no está en el almacén hace fallar el
  // render de la librería y el mapa entero dejaría de abrirse
  const isValidImage = d => {
    if (!isSafeImageUrl(d.image)) return false
    if (isImageKey(d.image) && !(imgMap && imgMap[d.image])) return false
    const size = d.imageSize
    return !!size && Number.isFinite(Number(size.width)) && Number.isFinite(Number(size.height))
  }
  const walk = node => {
    if (!node || typeof node !== 'object') return
    const d = node.data || {}
    if (d.hyperlink !== undefined && !isSafeHyperlink(d.hyperlink)) { delete d.hyperlink; delete d.hyperlinkTitle; fixed++ }
    for (const key of ['hyperlinkTitle', 'attachmentName', 'imageTitle']) {
      if (d[key] !== undefined && !isEscapedXml(d[key])) { d[key] = escapeXml(d[key]); fixed++ }
    }
    if (d.attachmentUrl !== undefined && !isAttachmentUrl(d.attachmentUrl)) { delete d.attachmentUrl; delete d.attachmentName; fixed++ }
    // Nota con formato: solo la lista blanca de etiquetas (rich-notes.js); sin texto plano no vale
    if (d[NOTE_HTML_KEY] !== undefined) {
      const html = typeof d[NOTE_HTML_KEY] === 'string' && typeof d.note === 'string' && d.note ? sanitizeNoteHtml(d[NOTE_HTML_KEY]) : ''
      if (html !== d[NOTE_HTML_KEY]) {
        if (html) d[NOTE_HTML_KEY] = html
        else delete d[NOTE_HTML_KEY]
        fixed++
      }
    }
    if (d.image !== undefined && !isValidImage(d)) { delete d.image; delete d.imageTitle; delete d.imageSize; fixed++ }
    // Marcadores: un icono o una etiqueta con un tipo inesperado hace fallar el render
    if (d.icon !== undefined) {
      const icons = Array.isArray(d.icon) ? d.icon.filter(isIconId) : []
      if (!Array.isArray(d.icon) || icons.length !== d.icon.length) { d.icon = icons; fixed++ }
    }
    if (d[CALLOUTS_KEY] !== undefined) {
      const callouts = normalizeCallouts(d[CALLOUTS_KEY])
      if (JSON.stringify(callouts) !== JSON.stringify(d[CALLOUTS_KEY])) {
        if (callouts) d[CALLOUTS_KEY] = callouts
        else delete d[CALLOUTS_KEY]
        fixed++
      }
    }
    if (d[TASK_KEY] !== undefined) {
      const task = normalizeTask(d[TASK_KEY])
      if (JSON.stringify(task) !== JSON.stringify(d[TASK_KEY])) {
        if (task) d[TASK_KEY] = task
        else delete d[TASK_KEY]
        fixed++
      }
    }
    if (d.tag !== undefined) {
      const tags = normalizeTags(d.tag)
      if (!sameTags(tags, d.tag)) { d.tag = tags; fixed++ }
    }
    // Posición libre (diagramas): solo números; otra cosa rompe el cálculo del diseño
    for (const key of ['customLeft', 'customTop']) {
      if (d[key] !== undefined && !Number.isFinite(d[key])) { delete d.customLeft; delete d.customTop; fixed++ }
    }
    if (d[DIAGRAM_RULE_KEY] !== undefined) {
      const rule = normalizeDiagramRule(d[DIAGRAM_RULE_KEY])
      if (JSON.stringify(rule) !== JSON.stringify(d[DIAGRAM_RULE_KEY])) {
        if (rule) d[DIAGRAM_RULE_KEY] = rule
        else delete d[DIAGRAM_RULE_KEY]
        fixed++
      }
    }
    ;(node.children || []).forEach(walk)
    ;(d.generalization ? [].concat(d.generalization) : []).forEach(g => walk({ data: g, children: [] }))
  }
  walk(root)
  // Definiciones de los marcadores de texto (solo en el tema central)
  if (root && root.data) {
    const rd = root.data
    // (la clave antigua textMarkers la convierte la migración a la versión 1: migrations.js)
    if (rd[TEXT_MARKERS_KEY] !== undefined) {
      const defs = normalizeMarkerDefs(rd[TEXT_MARKERS_KEY])
      if (JSON.stringify(defs) !== JSON.stringify(rd[TEXT_MARKERS_KEY])) { rd[TEXT_MARKERS_KEY] = defs; fixed++ }
    }
    // Formato del mapa (tema, ramas, fondo…): solo valores conocidos
    if (rd[MAP_FORMAT_KEY] !== undefined) {
      const format = compactMapFormat(normalizeMapFormat(rd[MAP_FORMAT_KEY]))
      if (JSON.stringify(format) !== JSON.stringify(rd[MAP_FORMAT_KEY])) { rd[MAP_FORMAT_KEY] = format; fixed++ }
    }
    // Definición del diagrama (tipo, tamaños, rótulos, colores y reglas)
    if (rd[DIAGRAM_KEY] !== undefined) {
      const diagram = normalizeDiagram(rd[DIAGRAM_KEY])
      if (JSON.stringify(diagram) !== JSON.stringify(rd[DIAGRAM_KEY])) {
        if (diagram) rd[DIAGRAM_KEY] = diagram
        else delete rd[DIAGRAM_KEY]
        fixed++
      }
    }
  }
  return fixed
}

// Lee una imagen del usuario y la devuelve como data URL, reducida si es muy grande.
// Resultado: { url, width, height }
async function readImageFile(file) {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new Error('Formato no admitido. Usa una imagen PNG, JPEG, GIF o WebP.')
  }
  if (file.size > IMAGE_MAX_BYTES) {
    throw new Error(`La imagen supera ${IMAGE_MAX_BYTES / 1024 / 1024} MB.`)
  }
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'))
    reader.readAsDataURL(file)
  })
  const img = await new Promise((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('El archivo no es una imagen válida.'))
    el.src = dataUrl
  })
  const { naturalWidth: w, naturalHeight: h } = img
  const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(w, h))
  // Los GIF se dejan tal cual para no perder la animación
  if (scale === 1 || file.type === 'image/gif') return { url: dataUrl, width: w, height: h }

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round(h * scale)
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
  const type = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png'
  return { url: canvas.toDataURL(type, 0.9), width: canvas.width, height: canvas.height }
}

async function uploadAttachment(mapId, file) {
  const res = await fetch(`/api/maps/${mapId}/files`, {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'X-File-Name': encodeURIComponent(file.name)
    },
    body: file
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `No se pudo subir el archivo (HTTP ${res.status})`)
  return body
}

// Abre un selector de archivos del sistema y devuelve el archivo elegido (o null)
function pickFile(accept) {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    if (accept) input.accept = accept
    input.setAttribute('data-testid', 'file-picker')
    input.style.display = 'none'
    input.addEventListener('change', () => {
      resolve(input.files && input.files[0] ? input.files[0] : null)
      input.remove()
    })
    input.addEventListener('cancel', () => { resolve(null); input.remove() })
    document.body.appendChild(input)
    input.click()
  })
}
