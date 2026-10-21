// Importar mapas de otras aplicaciones: MindManager (.mmap) y FreeMind / Freeplane (.mm).
//
// Cada conversor traduce el XML original a los datos de un mapa de esta app y devuelve
// { title, data, warnings }. Las imágenes y adjuntos del .mmap se dejan como rutas dentro del
// zip (imageFile / attachmentFile): luego los resuelve resolveMapFiles (map-file.js), igual que
// al abrir la carpeta comprimida de un tutorial. Todo lo que llega se sanea al abrir el mapa.
//
// Lo que no tiene equivalente (límites, temas flotantes, atributos…) se cuenta y se avisa.
// Los .mmap de MindManager X5 y anteriores son binarios (no XML): se detectan y se explica
// cómo convertirlos.

const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]
const IMPORT_TEXT_MAX = 2000

// ---- Utilidades de XML (por nombre local: los prefijos de espacio de nombres varían) ----
function parseXml(text, label) {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  const error = doc.getElementsByTagName('parsererror')[0]
  if (error) throw new MapFileError(`${label} no es un XML válido.`)
  return doc
}

const childrenNamed = (el, name) => el ? [...el.children].filter(c => c.localName === name) : []
const childNamed = (el, name) => childrenNamed(el, name)[0] || null
const pathNamed = (el, ...names) => names.reduce((cur, name) => childNamed(cur, name), el)
const cleanText = text => String(text || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\s*\n\s*/g, ' ').trim().slice(0, IMPORT_TEXT_MAX)
// Una fecha ISO ("2009-05-01T08:00:00") → "2009-05-01"
const isoDay = value => (String(value || '').match(/^(\d{4}-\d{2}-\d{2})/) || [])[1]

// Decodifica un XML respetando la codificación de su declaración (FreeMind antiguo usaba ISO-8859-1)
function decodeXml(bytes) {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 200))
  const declared = (head.match(/<\?xml[^>]*encoding=["']([\w-]+)["']/i) || [])[1]
  let encoding = 'utf-8'
  if (declared && /^(iso-8859-1|latin1|windows-1252|cp1252)$/i.test(declared)) encoding = 'windows-1252'
  return new TextDecoder(encoding).decode(bytes).replace(/^﻿/, '')
}

// Nota a partir de HTML (o texto): { note, _noteHtml } con el formato permitido (rich-notes.js)
function importNote(html, plainFallback) {
  if (html) {
    const data = noteDataFromHtml(html)
    if (data.note) return data
  }
  const text = String(plainFallback || '').replace(/\r\n?/g, '\n').trim()
  return text ? { note: text } : {}
}

// Contador de lo que no se pudo importar → avisos legibles ("Límites (no se importaron): 2.")
function createSkipped() {
  const counts = new Map()
  return {
    add(what, n = 1) { counts.set(what, (counts.get(what) || 0) + n) },
    warnings() { return [...counts].map(([what, n]) => `${what}: ${n}.`) }
  }
}

// Añade un icono respetando los grupos excluyentes (gana el primero)
function addImportedIcon(icons, id) {
  if (!id || icons.includes(id)) return icons
  const group = iconGroupOf(id)
  if (EXCLUSIVE_ICON_GROUPS.includes(group) && icons.some(i => iconGroupOf(i) === group)) return icons
  return [...icons, id]
}

// ---- FreeMind / Freeplane (.mm) ----
// Nombres de los iconos de FreeMind → iconos de esta app
const FREEMIND_ICONS = {
  'full-1': 'priority_1', 'full-2': 'priority_2', 'full-3': 'priority_3', 'full-4': 'priority_4', 'full-5': 'priority_5',
  'full-6': 'priority_6', 'full-7': 'priority_7', 'full-8': 'priority_8', 'full-9': 'priority_9',
  idea: 'symbol_idea', help: 'symbol_question', messagebox_warning: 'symbol_warning', yes: 'symbol_warning',
  info: 'symbol_info', button_ok: 'symbol_check', button_cancel: 'symbol_cross', 'stop-sign': 'symbol_stop',
  bookmark: 'symbol_star', clock: 'symbol_clock', calendar: 'symbol_calendar', Mail: 'symbol_mail', kmail: 'symbol_mail',
  password: 'symbol_lock', gohome: 'symbol_home', home: 'symbol_home', xmag: 'symbol_search', list: 'symbol_document',
  pencil: 'symbol_document', male1: 'people_person', female1: 'people_person', male2: 'people_person', female2: 'people_person',
  family: 'people_team', group: 'people_team', go: 'traffic_green', prepare: 'traffic_amber', stop: 'traffic_red',
  flag: 'flag_red', 'flag-green': 'flag_green', 'flag-yellow': 'flag_yellow', 'flag-orange': 'flag_orange',
  'flag-blue': 'flag_blue', 'flag-pink': 'flag_purple', 'flag-black': 'flag_black',
  ksmiletris: 'face_happy', 'smiley-neutral': 'face_neutral', smily_bad: 'face_sad', 'smiley-angry': 'face_angry', 'smiley-oh': 'face_surprised',
  up: 'arrow_up', down: 'arrow_down', forward: 'arrow_right', back: 'arrow_left'
}

function convertFreeMind(text, fileName) {
  const doc = parseXml(text, 'El archivo .mm')
  const map = doc.documentElement
  const rootEl = map && map.localName === 'map' ? childNamed(map, 'node') : null
  if (!rootEl) throw new MapFileError('El archivo .mm no contiene un mapa de FreeMind.')
  const skipped = createSkipped()
  const uidById = new Map()
  const links = []    // { data, destId }
  const arrows = []   // { data, destIds }

  const richText = (el, type) => {
    const rc = childrenNamed(el, 'richcontent').find(r => (r.getAttribute('TYPE') || '').toUpperCase() === type)
    if (!rc) return null
    const body = rc.getElementsByTagName('body')[0] || rc.querySelector('body')
    return { html: body ? body.innerHTML : '', text: rc.textContent }
  }

  const convert = el => {
    const data = { text: cleanText(el.getAttribute('TEXT') || (richText(el, 'NODE') || {}).text) || '(sin texto)' }
    const uid = createUid()
    data.uid = uid
    if (el.getAttribute('ID')) uidById.set(el.getAttribute('ID'), uid)
    if (el.getAttribute('FOLDED') === 'true') data.expand = false
    const note = richText(el, 'NOTE')
    if (note) Object.assign(data, importNote(note.html, note.text))
    const link = el.getAttribute('LINK')
    if (link) {
      if (link.startsWith('#')) links.push({ data, destId: link.slice(1) })
      else if (isSafeHyperlink(link)) data.hyperlink = link
      else skipped.add('Vínculos a archivos locales (no se importaron)')
    }
    let icons = []
    for (const icon of childrenNamed(el, 'icon')) {
      const id = FREEMIND_ICONS[icon.getAttribute('BUILTIN')]
      if (id) icons = addImportedIcon(icons, id)
      else skipped.add('Iconos sin equivalente aquí (no se importaron)')
    }
    if (icons.length) data.icon = icons
    const dests = childrenNamed(el, 'arrowlink').map(a => a.getAttribute('DESTINATION')).filter(Boolean)
    if (dests.length) arrows.push({ data, destIds: dests })
    if (childrenNamed(el, 'attribute').length) skipped.add('Atributos (no se importaron)', childrenNamed(el, 'attribute').length)
    return { data, children: childrenNamed(el, 'node').map(convert) }
  }
  const root = convert(rootEl)

  // Vínculos y flechas entre temas: ya se conocen todos los uid
  for (const { data, destId } of links) {
    if (uidById.has(destId)) data.hyperlink = topicLinkUrl(uidById.get(destId))
  }
  for (const { data, destIds } of arrows) {
    const targets = destIds.map(id => uidById.get(id)).filter(Boolean)
    if (targets.length) data.associativeLineTargets = targets
  }
  return {
    title: root.data.text !== '(sin texto)' ? root.data.text : titleFromFileName(fileName),
    data: { schemaVersion: SCHEMA_VERSION, layout: 'mindMap', root },
    warnings: skipped.warnings()
  }
}

// ---- MindManager (.mmap, versiones 6 en adelante: zip con Document.xml) ----
// Iconos por palabras clave de su IconType ("urn:mindjet:Priority1", "urn:mindjet:FlagRed"…)
const MINDMANAGER_ICON_RULES = [
  [/priority([1-9])/i, m => `priority_${m[1]}`],
  [/flag[-_]?(red|orange|yellow|green|blue|purple|gray|grey|black)/i, m => `flag_${m[1].toLowerCase().replace('grey', 'gray')}`],
  [/smiley[-_]?(happy|neutral|sad|angry|screaming|surprised)/i, m => `face_${{ happy: 'happy', neutral: 'neutral', sad: 'sad', angry: 'angry', screaming: 'surprised', surprised: 'surprised' }[m[1].toLowerCase()]}`],
  [/(question)/i, () => 'symbol_question'],
  [/(exclamation|warning|attention)/i, () => 'symbol_warning'],
  [/(check|tick|done)/i, () => 'symbol_check'],
  [/(cross|cancel|delete)/i, () => 'symbol_cross'],
  [/stop/i, () => 'symbol_stop'],
  [/(idea|bulb)/i, () => 'symbol_idea'],
  [/star/i, () => 'symbol_star'],
  [/heart/i, () => 'symbol_heart'],
  [/info/i, () => 'symbol_info'],
  [/(clock|time|deadline)/i, () => 'symbol_clock'],
  [/calendar/i, () => 'symbol_calendar'],
  [/(mail|letter)/i, () => 'symbol_mail'],
  [/phone/i, () => 'symbol_phone'],
  [/(lock|secret|confidential)/i, () => 'symbol_lock'],
  [/(money|dollar|euro|cost)/i, () => 'symbol_money'],
  [/(home|house)/i, () => 'symbol_home'],
  [/(people|group|team)/i, () => 'people_team'],
  [/(person|resource|user)/i, () => 'people_person'],
  [/arrow[-_]?up/i, () => 'arrow_up'],
  [/arrow[-_]?down/i, () => 'arrow_down'],
  [/arrow[-_]?left/i, () => 'arrow_left'],
  [/arrow[-_]?right/i, () => 'arrow_right']
]
const mindManagerIcon = type => {
  for (const [re, id] of MINDMANAGER_ICON_RULES) {
    const m = re.exec(String(type || ''))
    if (m) return id(m)
  }
  return null
}

// "mmarch://bin/abc.png" → "bin/abc.png" (archivo dentro del .mmap)
const mmarchPath = uri => (String(uri || '').match(/^mmarch:\/\/(.+)$/) || [])[1] || null

function convertMindManager(text, fileName) {
  const doc = parseXml(text, 'El Document.xml del .mmap')
  const mapEl = doc.documentElement
  const rootEl = mapEl && mapEl.localName === 'Map' ? pathNamed(mapEl, 'OneTopic', 'Topic') : null
  if (!rootEl) throw new MapFileError('El .mmap no contiene un mapa de MindManager reconocible.')
  const skipped = createSkipped()
  const uidByOid = new Map()
  const labels = new Set()

  const topicText = el => {
    const t = childNamed(el, 'Text')
    return cleanText(t ? (t.getAttribute('PlainText') || t.textContent) : '')
  }

  const convert = (el, isRoot) => {
    const data = { text: topicText(el) || '(sin texto)' }
    const uid = createUid()
    data.uid = uid
    if (el.getAttribute('OId')) uidByOid.set(el.getAttribute('OId'), uid)

    // Plegado
    const collapsed = pathNamed(el, 'TopicViewGroup', 'Collapsed')
    if (collapsed && collapsed.getAttribute('Collapsed') === 'true') data.expand = false

    // Notas: XHTML (MindManager 7+) o, si no, su vista previa en texto
    const notes = childNamed(el, 'NotesGroup')
    if (notes) {
      const xhtml = childNamed(notes, 'NotesXhtmlData')
      const htmlRoot = xhtml && [...xhtml.children].find(c => c.localName === 'html')
      const body = htmlRoot && ([...htmlRoot.children].find(c => c.localName === 'body') || htmlRoot)
      const html = body ? [...body.childNodes].map(n => new XMLSerializer().serializeToString(n)).join('') : ''
      Object.assign(data, importNote(html.replace(/\sxmlns(:\w+)?="[^"]*"/g, '').replace(/<(\/?)\w+:/g, '<$1'),
        xhtml ? xhtml.getAttribute('PreviewPlainText') : ''))
    }

    // Vínculo
    const link = childNamed(el, 'Hyperlink')
    if (link) {
      const url = link.getAttribute('Url') || ''
      if (isSafeHyperlink(url)) data.hyperlink = url
      else skipped.add('Vínculos a archivos u otros mapas de MindManager (no se importaron)')
    }

    // Iconos y tarea (prioridad y % completado son iconos aquí)
    let icons = []
    for (const icon of childrenNamed(pathNamed(el, 'IconsGroup', 'Icons'), 'Icon')) {
      const id = mindManagerIcon(icon.getAttribute('IconType'))
      if (id) icons = addImportedIcon(icons, id)
      else skipped.add('Iconos sin equivalente aquí (no se importaron)')
    }
    const task = childNamed(el, 'Task')
    if (task) {
      const prio = (task.getAttribute('TaskPriority') || '').match(/prio(?:rity)?([1-9])/i)
      if (prio) icons = withPriority(icons, Number(prio[1]))
      if (task.getAttribute('TaskPercentage')) icons = withProgress(icons, Number(task.getAttribute('TaskPercentage')))
      const info = normalizeTask({
        start: isoDay(task.getAttribute('StartDate')),
        due: isoDay(task.getAttribute('DueDate')),
        milestone: task.getAttribute('Milestone') === 'true',
        resources: String(task.getAttribute('Resources') || '').split(/[;,]/).map(s => s.trim()).filter(Boolean)
      })
      if (info) data[TASK_KEY] = info
    }
    if (icons.length) data.icon = icons

    // Marcadores de texto
    const names = childrenNamed(childNamed(el, 'TextLabels'), 'TextLabel').map(l => cleanName(l.getAttribute('TextLabelName'))).filter(Boolean)
    if (names.length) {
      names.forEach(n => labels.add(n))
      data.tag = [...new Set(names)].map(n => ({ text: n, style: { fill: UNCATEGORIZED_COLOR } }))
    }

    // Imagen y adjuntos: rutas dentro del .mmap
    const imageUri = (pathNamed(el, 'Image', 'ImageData', 'Uri') || {}).textContent
    if (mmarchPath(imageUri)) data.imageFile = mmarchPath(imageUri)
    else if (childNamed(el, 'Image')) skipped.add('Imágenes enlazadas fuera del archivo (no se importaron)')
    const attachments = childrenNamed(childNamed(el, 'Attachments'), 'Attachment')
    if (attachments.length) {
      const first = attachments[0]
      const uri = (pathNamed(first, 'AttachmentData', 'Uri') || {}).textContent || first.getAttribute('Uri')
      if (mmarchPath(uri)) {
        data.attachmentFile = mmarchPath(uri)
        if (first.getAttribute('FileName')) data.attachmentName = first.getAttribute('FileName')
      } else skipped.add('Adjuntos enlazados fuera del archivo (no se importaron)')
      if (attachments.length > 1) skipped.add('Adjuntos adicionales (solo se importa uno por tema)', attachments.length - 1)
    }

    // Llamadas: temas anclados a este (aquí, texto en un globo)
    const callouts = childrenNamed(childNamed(el, 'Callouts'), 'Topic').map(topicText).filter(Boolean)
    if (callouts.length) data[CALLOUTS_KEY] = callouts.map(text => ({ text }))

    if (childNamed(el, 'Boundary')) skipped.add('Límites (no se importaron)')
    const children = childrenNamed(childNamed(el, 'SubTopics'), 'Topic').map(child => convert(child, false))
    // Temas flotantes: se añaden como temas principales (aquí no hay temas sueltos)
    const floating = childrenNamed(childNamed(el, 'FloatingTopics'), 'Topic')
    if (floating.length) {
      if (isRoot) children.push(...floating.map(child => convert(child, false)))
      skipped.add('Temas flotantes (se añadieron como temas principales)', floating.length)
    }
    return { data, children }
  }
  const root = convert(rootEl, true)

  // Relaciones entre temas: dos conexiones (índice 0 = origen, 1 = destino)
  const byUid = new Map()
  const index = node => { byUid.set(node.data.uid, node.data); node.children.forEach(index) }
  index(root)
  for (const rel of childrenNamed(childNamed(mapEl, 'Relationships'), 'Relationship')) {
    const ends = childrenNamed(rel, 'ConnectionGroup')
      .sort((a, b) => Number(a.getAttribute('Index')) - Number(b.getAttribute('Index')))
      .map(g => uidByOid.get((pathNamed(g, 'Connection', 'ObjectReference') || { getAttribute: () => null }).getAttribute('OIdRef')))
    if (ends.length === 2 && ends[0] && ends[1]) {
      const source = byUid.get(ends[0])
      source.associativeLineTargets = [...(source.associativeLineTargets || []), ends[1]]
    } else skipped.add('Relaciones con temas que no existen (no se importaron)')
  }

  if (labels.size) {
    root.data[TEXT_MARKERS_KEY] = [{ id: createUid(), name: 'Importados', color: TEXT_MARKER_COLORS[0], markers: [...labels].map(name => ({ id: createUid(), name })) }]
  }
  return {
    title: root.data.text !== '(sin texto)' ? root.data.text : titleFromFileName(fileName),
    data: { schemaVersion: SCHEMA_VERSION, layout: 'mindMap', root },
    warnings: skipped.warnings()
  }
}

// ¿Qué es este archivo? 'zip' | 'mm' | 'mmap-legacy' | 'json' | null
function detectMapFile(bytes, name) {
  const starts = sig => sig.every((b, i) => bytes[i] === b)
  if (starts([0x50, 0x4b, 0x03, 0x04])) return 'zip'
  if (starts(OLE_SIGNATURE)) return 'mmap-legacy'
  if (/\.mm$/i.test(name)) return 'mm'
  if (/\.json$/i.test(name)) return 'json'
  return null
}

// Busca el Document.xml de un .mmap (en la raíz del zip)
const mindManagerDocument = files => [...files.keys()].find(n => /^document\.xml$/i.test(n)) || null
