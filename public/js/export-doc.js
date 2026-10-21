// Exportar a Word (.docx) y Markdown (.md), como "Exportar a Microsoft Word" de MindManager:
// el tema central es el título del documento, cada nivel de temas un nivel de título y
// debajo de cada tema van sus marcadores, su información de tarea, sus vínculos, sus notas y
// sus llamadas. Se exporta todo el mapa, también las ramas contraídas.
//
// Las dos salidas salen del mismo modelo de documento (mapDocument), que es una función pura.
// El .docx se genera aquí sin librerías: es un ZIP (sin comprimir) con el XML mínimo de Word.
// La librería trae un exportador a Markdown, pero no escapa el texto, convierte todos los
// niveles en títulos y no incluye marcadores ni tareas.

// ---- Modelo del documento ----
// Qué se incluye al exportar (diálogo "Opciones de exportación"); `extras` = adjuntos y resúmenes
const DOC_EXPORT_DEFAULTS = { markers: true, task: true, links: true, notes: true, callouts: true, extras: true, images: true, numbering: false }
function normalizeDocOptions(raw) {
  const options = { ...DOC_EXPORT_DEFAULTS }
  for (const key of Object.keys(DOC_EXPORT_DEFAULTS)) if (raw && typeof raw[key] === 'boolean') options[key] = raw[key]
  return options
}
// Las opciones se recuerdan en este navegador
const EXPORT_OPTIONS_STORAGE_KEY = 'mindmap.exportOptions'
function loadExportOptions() {
  try {
    return normalizeDocOptions(JSON.parse(localStorage.getItem(EXPORT_OPTIONS_STORAGE_KEY) || 'null'))
  } catch {
    return normalizeDocOptions(null)
  }
}
const EMPTY_DOC_TASK ={ priority: 0, progress: 0, start: '', due: '', resources: [], milestone: false }

// Imagen de un tema como data URL (puede estar como clave en root.data.imgMap) con su tamaño
function documentImage(data, imgMap) {
  const url = imgMap && imgMap[data.image] ? imgMap[data.image] : data.image
  const size = data.imageSize || {}
  if (!/^data:image\/[\w.+-]+;base64,/i.test(String(url || '')) || !(size.width > 0) || !(size.height > 0)) return null
  return { url, width: Number(size.width), height: Number(size.height) }
}

// Temas en orden de lectura: { depth, number, lines, markers, task, link, attachment, note,
// noteHtml, callouts, summaries, image } con lo que pidan las opciones
function mapDocument(root, { iconLabel = id => id, options } = {}) {
  const opts = normalizeDocOptions(options)
  const imgMap = root && root.data && root.data.imgMap
  const topics = []
  // Numeración de los títulos: "1.", "1.1."… (el tema central no se numera)
  const counters = []
  const numberFor = depth => {
    if (!opts.numbering || depth === 0) return ''
    counters.length = depth
    counters[depth - 1] = (counters[depth - 1] || 0) + 1
    return counters.slice(0, depth).map(n => n || 1).join('.') + '.'
  }
  const walk = (node, depth) => {
    if (!node || !node.data) return
    const data = node.data
    const icons = Array.isArray(data.icon) ? data.icon : []
    const task = normalizeTask(data[TASK_KEY]) || {}
    // Los vínculos a otro tema o a otro mapa (internos) no son direcciones: se exporta su texto
    const link = typeof data.hyperlink === 'string' && isSafeHyperlink(data.hyperlink)
      ? { url: data.hyperlink, title: unescapeXml(data.hyperlinkTitle || ''), internal: !!internalLinkOf(data.hyperlink) }
      : null
    const generalization = [].concat(data.generalization || []).filter(g => g && g.text)
    topics.push({
      depth,
      number: numberFor(depth),
      lines: topicPlainText(data).split('\n').map(l => l.trim()).filter(Boolean),
      markers: opts.markers ? [
        ...icons.filter(id => !['priority', 'progress'].includes(iconGroupOf(id))).map(iconLabel),
        ...(Array.isArray(data.tag) ? data.tag : []).map(tagText).filter(Boolean)
      ] : [],
      task: opts.task ? {
        priority: priorityOf(icons),
        progress: progressOf(icons),
        start: task.start || '',
        due: task.due || '',
        resources: task.resources || [],
        milestone: !!task.milestone
      } : EMPTY_DOC_TASK,
      link: opts.links ? link : null,
      attachment: opts.extras && data.attachmentName ? unescapeXml(data.attachmentName) : '',
      note: opts.notes && typeof data.note === 'string' ? data.note.replace(/\r\n?/g, '\n').trim() : '',
      // Nota con formato (rich-notes.js): Markdown la conserva; Word usa el texto plano
      noteHtml: opts.notes && typeof data.note === 'string' && data.note && typeof data[NOTE_HTML_KEY] === 'string' ? data[NOTE_HTML_KEY] : '',
      callouts: opts.callouts ? (normalizeCallouts(data[CALLOUTS_KEY]) || []).map(c => c.text) : [],
      summaries: opts.extras ? generalization.map(g => topicPlainText(g)).filter(Boolean) : [],
      image: opts.images ? documentImage(data, imgMap) : null
    })
    ;(node.children || []).forEach(child => walk(child, depth + 1))
  }
  walk(root, 0)
  return topics
}

// Información de tarea en una línea: "Prioridad 1 · 50 % completado · Inicio: …"
function documentTaskLine(task) {
  const parts = []
  if (task.priority) parts.push(`Prioridad ${task.priority}`)
  if (task.progress) parts.push(`${task.progress} % completado`)
  if (task.start) parts.push(`Inicio: ${formatShortDate(task.start)}`)
  if (task.due) parts.push(`Vencimiento: ${formatShortDate(task.due)}`)
  if (task.milestone) parts.push('Hito')
  if (task.resources.length) parts.push(`Recursos: ${task.resources.join(', ')}`)
  return parts.join(' · ')
}

// ---- Markdown ----
// Escapa lo que tiene significado en Markdown (CommonMark admite \ delante de cualquier
// signo de puntuación ASCII), para que el texto se vea tal cual y no se cuele HTML: los
// signos de formato y de HTML siempre; los que abren un bloque (título, lista, cita,
// lista numerada) solo al principio de la línea. Así el .md sigue siendo legible en bruto.
const escapeMarkdown = text => String(text)
  .replace(/[\\`*_[\]<>|~&]/g, '\\$&')
  .replace(/^(\s*)([#+\-=])/, '$1\\$2')
  .replace(/^(\s*\d+)([.)])/, '$1\\$2')
const MD_MAX_HEADING = 6

function buildMarkdown(topics) {
  const out = []
  topics.forEach(t => {
    const text = (t.number ? `${t.number} ` : '') + (t.lines.map(escapeMarkdown).join(' ') || '\\(sin texto\\)')
    // Títulos hasta el nivel 6 de Markdown; más abajo, listas con sangría
    const level = t.depth + 1
    const indent = level > MD_MAX_HEADING ? '  '.repeat(level - MD_MAX_HEADING - 1) : ''
    out.push(level <= MD_MAX_HEADING ? `${'#'.repeat(level)} ${text}` : `${indent}- **${text}**`)
    const body = []
    if (t.markers.length) body.push(`*${t.markers.map(escapeMarkdown).join(' · ')}*`)
    const task = documentTaskLine(t.task)
    if (task) body.push(`*${escapeMarkdown(task)}*`)
    if (t.link && t.link.internal) body.push(`→ ${escapeMarkdown(t.link.title || 'Vínculo interno')}`)
    else if (t.link) body.push(`[${escapeMarkdown(t.link.title || t.link.url)}](<${t.link.url.replace(/[<>\s]/g, encodeURIComponent)}>)`)
    if (t.attachment) body.push(`Adjunto: ${escapeMarkdown(t.attachment)}`)
    if (t.summaries.length) body.push(`Resumen: ${t.summaries.map(escapeMarkdown).join(' · ')}`)
    // Notas: con formato, su Markdown; sin él, un párrafo por bloque de líneas (con los saltos)
    const noteMd = t.noteHtml ? noteHtmlToMarkdown(t.noteHtml, escapeMarkdown) : ''
    if (noteMd) body.push(noteMd)
    else if (t.note) t.note.split(/\n{2,}/).forEach(p => body.push(p.split('\n').map(escapeMarkdown).join('  \n')))
    t.callouts.forEach(c => body.push(`> **Llamada:** ${escapeMarkdown(c)}`))
    body.forEach(b => out.push(indent && level > MD_MAX_HEADING ? b.split('\n').map(l => `${indent}  ${l}`).join('\n') : b))
  })
  return out.join('\n\n') + '\n'
}

// ---- Word (.docx) ----
// Texto para XML: escapado y sin los caracteres de control que XML 1.0 no admite
const xmlText = text => escapeXml(String(text).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, ''))

const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
const DOCX_MAX_HEADING = 9

// Un párrafo con su estilo; `runs` son trozos de texto (los saltos de línea pasan a <w:br/>)
function docxParagraph(style, runs) {
  const runXml = runs.map(run => {
    const props = [run.bold ? '<w:b/>' : '', run.link ? '<w:rStyle w:val="Hyperlink"/>' : ''].join('')
    const pieces = String(run.text).split('\n').map(piece => `<w:t xml:space="preserve">${xmlText(piece)}</w:t>`)
    const r = `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}${pieces.join('<w:br/>')}</w:r>`
    return run.link ? `<w:hyperlink r:id="${run.link}">${r}</w:hyperlink>` : r
  }).join('')
  return `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr>${runXml}</w:p>`
}

// Imagen en línea (DrawingML). Tamaño en EMU: 9525 por píxel
const DOCX_EMU_PER_PX = 9525
const DOCX_MAX_IMAGE_PX = 600 // ancho útil de la página A4 con sus márgenes
function docxImageParagraph(image, n) {
  const scale = Math.min(1, DOCX_MAX_IMAGE_PX / image.width)
  const cx = Math.round(image.width * scale) * DOCX_EMU_PER_PX
  const cy = Math.round(image.height * scale) * DOCX_EMU_PER_PX
  return `<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/>` +
    `<wp:docPr id="${n}" name="Imagen ${n}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    `<pic:nvPicPr><pic:cNvPr id="${n}" name="${image.name}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="rIdImg${n}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>'
}

// document.xml, los vínculos externos (cada hipervínculo es una relación del documento) y las
// imágenes que haya preparado prepareDocxImages (t.docxImage)
function buildDocxDocument(topics) {
  const links = []
  const images = []
  const paragraphs = []
  topics.forEach(t => {
    const text = (t.number ? `${t.number} ` : '') + (t.lines.join('\n') || '(sin texto)')
    paragraphs.push(docxParagraph(t.depth === 0 ? 'Title' : `Heading${Math.min(t.depth, DOCX_MAX_HEADING)}`, [{ text }]))
    if (t.docxImage) {
      images.push({ ...t.docxImage, name: `image${images.length + 1}.${t.docxImage.ext}` })
      paragraphs.push(docxImageParagraph(images[images.length - 1], images.length))
    }
    if (t.markers.length) paragraphs.push(docxParagraph('TopicMeta', [{ text: t.markers.join(' · ') }]))
    const task = documentTaskLine(t.task)
    if (task) paragraphs.push(docxParagraph('TopicMeta', [{ text: task }]))
    if (t.link && t.link.internal) {
      paragraphs.push(docxParagraph('TopicMeta', [{ text: `→ ${t.link.title || 'Vínculo interno'}` }]))
    } else if (t.link) {
      links.push(t.link.url)
      paragraphs.push(docxParagraph('TopicMeta', [{ text: t.link.title || t.link.url, link: `rIdLink${links.length}` }]))
    }
    if (t.attachment) paragraphs.push(docxParagraph('TopicMeta', [{ text: `Adjunto: ${t.attachment}` }]))
    if (t.summaries.length) paragraphs.push(docxParagraph('TopicMeta', [{ text: `Resumen: ${t.summaries.join(' · ')}` }]))
    if (t.note) t.note.split(/\n{2,}/).forEach(p => paragraphs.push(docxParagraph('Normal', [{ text: p }])))
    t.callouts.forEach(c => paragraphs.push(docxParagraph('Callout', [{ text: 'Llamada: ', bold: true }, { text: c }])))
  })
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W_NS} xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${paragraphs.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1418" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>`
  return { xml, links, images }
}

// Bytes de cada imagen para Word: PNG, JPEG y GIF tal cual; el resto (WebP…) se convierte a
// PNG con un canvas, porque Word no lo abre. Deja { ext, bytes, width, height } en t.docxImage.
const DOCX_IMAGE_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/gif': 'gif' }
async function prepareDocxImages(topics) {
  const decode = url => Uint8Array.from(atob(url.split(',')[1]), ch => ch.charCodeAt(0))
  for (const t of topics) {
    if (!t.image) continue
    const mime = (t.image.url.match(/^data:([\w/.+-]+);/i) || [])[1].toLowerCase()
    let ext = DOCX_IMAGE_TYPES[mime]
    let url = t.image.url
    if (!ext) {
      try {
        url = await convertImageToPng(url)
        ext = 'png'
      } catch {
        continue // una imagen que el navegador no sabe pintar se queda fuera
      }
    }
    t.docxImage = { ext, bytes: decode(url), width: t.image.width, height: t.image.height }
  }
  return topics
}

function convertImageToPng(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      canvas.getContext('2d').drawImage(img, 0, 0)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => reject(new Error('imagen no válida'))
    img.src = url
  })
}

// Estilos con los nombres de Word (Title, Heading1…): así el índice y el panel de
// navegación de Word reconocen los títulos. Colores del tema de la app.
function buildDocxStyles() {
  const heading = level => {
    const size = [32, 28, 26, 24, 22, 22, 21, 21, 21][level - 1]
    const color = level === 1 ? '2B6FBD' : level === 2 ? '57962A' : '1E2A3A'
    return `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/>` +
      `<w:pPr><w:keepNext/><w:spacing w:before="${level <= 2 ? 240 : 160}" w:after="60"/><w:ind w:left="${Math.max(0, level - 3) * 360}"/><w:outlineLvl w:val="${level - 1}"/></w:pPr>` +
      `<w:rPr><w:b/><w:color w:val="${color}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></w:style>`
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W_NS}>` +
    '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI" w:cs="Segoe UI" w:eastAsia="Segoe UI"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="es-ES"/></w:rPr></w:rPrDefault>' +
    '<w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>' +
    '<w:pPr><w:spacing w:after="240"/><w:pBdr><w:bottom w:val="single" w:sz="8" w:space="4" w:color="3D8FD8"/></w:pBdr></w:pPr>' +
    '<w:rPr><w:b/><w:color w:val="1D4F8A"/><w:sz w:val="44"/><w:szCs w:val="44"/></w:rPr></w:style>' +
    Array.from({ length: DOCX_MAX_HEADING }, (_, i) => heading(i + 1)).join('') +
    '<w:style w:type="paragraph" w:customStyle="1" w:styleId="TopicMeta"><w:name w:val="Datos del tema"/><w:basedOn w:val="Normal"/>' +
    '<w:pPr><w:spacing w:after="40"/></w:pPr><w:rPr><w:i/><w:color w:val="5B6B80"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:customStyle="1" w:styleId="Callout"><w:name w:val="Llamada"/><w:basedOn w:val="Normal"/>' +
    '<w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="6" w:color="E3B33B"/></w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="FFF6D6"/><w:ind w:left="240"/></w:pPr></w:style>' +
    '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>' +
    '</w:styles>'
}

// Archivos del paquete .docx: [{ name, text }]
function buildDocxFiles(topics, { title = '' } = {}) {
  const { xml, links, images } = buildDocxDocument(topics)
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
  const imageTypes = [...new Set(images.map(i => i.ext))]
  return [
    { name: '[Content_Types].xml', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      imageTypes.map(ext => `<Default Extension="${ext}" ContentType="image/${ext}"/>`).join('') +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>' },
    { name: '_rels/.rels', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>' },
    { name: 'docProps/core.xml', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      `<dc:title>${xmlText(title)}</dc:title><dc:language>es-ES</dc:language>` +
      `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>` },
    { name: 'word/_rels/document.xml.rels', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      links.map((url, i) => `<Relationship Id="rIdLink${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xmlText(url)}" TargetMode="External"/>`).join('') +
      images.map((img, i) => `<Relationship Id="rIdImg${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${img.name}"/>`).join('') +
      '</Relationships>' },
    { name: 'word/document.xml', text: xml },
    { name: 'word/styles.xml', text: buildDocxStyles() },
    ...images.map(img => ({ name: `word/media/${img.name}`, data: img.bytes }))
  ]
}

// ---- ZIP sin compresión (lo que necesita un .docx) ----
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes) {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

// Devuelve el ZIP como Uint8Array. `files`: [{ name, text }] o [{ name, data: Uint8Array }]
function buildZip(files, now = new Date()) {
  const enc = new TextEncoder()
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()
  const chunks = []
  const central = []
  let offset = 0
  files.forEach(file => {
    const name = enc.encode(file.name)
    // ArrayBuffer.isView y no instanceof: los bytes pueden venir de otro contexto (iframe, worker)
    const data = ArrayBuffer.isView(file.data) ? new Uint8Array(file.data.buffer, file.data.byteOffset, file.data.byteLength) : enc.encode(file.text)
    const crc = crc32(data)
    // Cabecera local: firma, versión 2.0, bit 11 (nombres en UTF-8), sin compresión
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(6, 0x0800, true)
    local.setUint16(8, 0, true)
    local.setUint16(10, dosTime, true)
    local.setUint16(12, dosDate, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, data.length, true)
    local.setUint32(22, data.length, true)
    local.setUint16(26, name.length, true)
    local.setUint16(28, 0, true)
    chunks.push(new Uint8Array(local.buffer), name, data)
    const entry = new DataView(new ArrayBuffer(46))
    entry.setUint32(0, 0x02014b50, true)
    entry.setUint16(4, 20, true)
    entry.setUint16(6, 20, true)
    entry.setUint16(8, 0x0800, true)
    entry.setUint16(10, 0, true)
    entry.setUint16(12, dosTime, true)
    entry.setUint16(14, dosDate, true)
    entry.setUint32(16, crc, true)
    entry.setUint32(20, data.length, true)
    entry.setUint32(24, data.length, true)
    entry.setUint16(28, name.length, true)
    entry.setUint32(42, offset, true)
    central.push(new Uint8Array(entry.buffer), name)
    offset += 30 + name.length + data.length
  })
  const centralSize = central.reduce((n, c) => n + c.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, files.length, true)
  end.setUint16(10, files.length, true)
  end.setUint32(12, centralSize, true)
  end.setUint32(16, offset, true)
  const parts = [...chunks, ...central, new Uint8Array(end.buffer)]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  parts.forEach(p => { out.set(p, at); at += p.length })
  return out
}

// ---- Descarga ----
const DOC_FORMATS = {
  docx: { ext: 'docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  md: { ext: 'md', type: 'text/markdown;charset=utf-8' }
}

// Genera el documento del mapa y lo descarga. Devuelve el tamaño en bytes
async function exportDocument(mindMap, format, { title, iconLabel, options } = {}) {
  const spec = DOC_FORMATS[format]
  if (!spec) throw new Error(`Formato desconocido: ${format}`)
  const topics = mapDocument(mindMap.getData(false), { iconLabel, options })
  // Markdown no lleva imágenes (serían enormes como texto); Word sí
  if (format === 'docx') await prepareDocxImages(topics)
  const content = format === 'docx'
    ? buildZip(buildDocxFiles(topics, { title: title || (topics[0] && topics[0].lines.join(' ')) || '' }))
    : buildMarkdown(topics)
  const blob = new Blob([content], { type: spec.type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = exportFileName(title).replace(/\.html$/, `.${spec.ext}`)
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
  return blob.size
}
