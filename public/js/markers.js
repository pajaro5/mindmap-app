// Marcadores del mapa: iconos (prioridad, progreso…) y marcadores de texto con categorías.
//
// Modelo de datos de los marcadores de texto:
//   - Definiciones (fuente de verdad), en el tema central: root.data.textMarkers =
//       [{ id, name, color, markers: [{ id, name }] }]
//     Van dentro del árbol para que deshacer/rehacer y el autoguardado las incluyan.
//   - En cada tema: data.tag = [{ text, style: { fill } }], el formato nativo de
//     simple-mind-map (lo pinta sin configuración). El color se copia de la categoría;
//     renombrar, recolorear o borrar en las definiciones actualiza todos los temas a la vez.
// Los nombres de marcador son únicos en el mapa (sin distinguir mayúsculas).

const TEXT_MARKER_COLORS = ['#2b6fbd', '#57962a', '#c55a11', '#7030a0', '#c00000', '#1f7f7f', '#7f6000', '#595959']
const TEXT_MARKER_MAX_LENGTH = 40
const UNCATEGORIZED_COLOR = '#7f7f7f'
// Prioridad y progreso son excluyentes: un tema tiene una sola prioridad y un solo progreso
const EXCLUSIVE_ICON_GROUPS = ['priority', 'progress']

const isHexColor = c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)
const markerKey = name => String(name).trim().toLowerCase()
// Solo texto o números: un objeto se convertiría en "[object Object]"
const cleanName = name => (typeof name === 'string' || Number.isFinite(name) ? String(name) : '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, TEXT_MARKER_MAX_LENGTH)
const newId = () => crypto.randomUUID()

// ---- Iconos ----
const iconGroupOf = iconId => String(iconId).split('_')[0]
const isIconId = id => typeof id === 'string' && /^[a-z]+_[\w-]+$/i.test(id)

// Iconos de un tema tras alternar `iconId`. `on` = añadir; al añadir un icono de un grupo
// excluyente se quita el que hubiera del mismo grupo
function toggleIconList(icons, iconId, on) {
  const list = (icons || []).filter(id => id !== iconId)
  if (!on) return list
  const group = iconGroupOf(iconId)
  const kept = EXCLUSIVE_ICON_GROUPS.includes(group) ? list.filter(id => iconGroupOf(id) !== group) : list
  return [...kept, iconId]
}

// ---- Marcadores de texto: definiciones ----

// Normaliza las definiciones leídas del mapa (pueden venir de fuera de la app): descarta
// lo inválido, recorta nombres, quita duplicados y asigna ids que falten
function normalizeMarkerDefs(defs) {
  if (!Array.isArray(defs)) return []
  const seenCats = new Set()
  const seenMarkers = new Set()
  const result = []
  defs.forEach((cat, i) => {
    if (!cat || typeof cat !== 'object') return
    const name = cleanName(cat.name)
    if (!name || seenCats.has(markerKey(name))) return
    seenCats.add(markerKey(name))
    const markers = []
    ;(Array.isArray(cat.markers) ? cat.markers : []).forEach(m => {
      const markerName = cleanName(m && typeof m === 'object' ? m.name : m)
      if (!markerName || seenMarkers.has(markerKey(markerName))) return
      seenMarkers.add(markerKey(markerName))
      markers.push({ id: typeof m.id === 'string' && m.id ? m.id : newId(), name: markerName })
    })
    result.push({
      id: typeof cat.id === 'string' && cat.id ? cat.id : newId(),
      name,
      color: isHexColor(cat.color) ? cat.color.toLowerCase() : TEXT_MARKER_COLORS[i % TEXT_MARKER_COLORS.length],
      markers
    })
  })
  return result
}

// Valida una categoría editada en el diálogo frente al resto de definiciones.
// Devuelve un mensaje de error o '' si es válida
function validateCategory(defs, category) {
  const name = cleanName(category.name)
  if (!name) return 'Escribe un nombre para la categoría.'
  if (defs.some(c => c.id !== category.id && markerKey(c.name) === markerKey(name))) {
    return `Ya existe una categoría "${name}".`
  }
  const others = new Set(defs.filter(c => c.id !== category.id).flatMap(c => c.markers.map(m => markerKey(m.name))))
  const own = new Set()
  for (const m of category.markers) {
    const markerName = cleanName(m.name)
    if (!markerName) continue
    const key = markerKey(markerName)
    if (others.has(key) || own.has(key)) return `El marcador "${markerName}" está repetido.`
    own.add(key)
  }
  return ''
}

// Busca la definición (marcador + categoría) de un nombre de marcador
function findMarker(defs, name) {
  const key = markerKey(name)
  for (const cat of defs) {
    const marker = cat.markers.find(m => markerKey(m.name) === key)
    if (marker) return { category: cat, marker }
  }
  return null
}

// ---- Marcadores de texto: en los temas ----
const tagText = item => (typeof item === 'string' ? item : item && item.text) || ''

// Normaliza la lista de un tema al formato { text, style: { fill } }; descarta lo inválido
function normalizeTags(tags) {
  if (!Array.isArray(tags)) return []
  const seen = new Set()
  const result = []
  tags.forEach(item => {
    const text = cleanName(tagText(item))
    if (!text || seen.has(markerKey(text))) return
    seen.add(markerKey(text))
    const fill = item && item.style && isHexColor(item.style.fill) ? item.style.fill : UNCATEGORIZED_COLOR
    result.push({ text, style: { fill } })
  })
  return result
}

const hasTag = (tags, name) => (tags || []).some(item => markerKey(tagText(item)) === markerKey(name))

// Etiqueta de un tema para el marcador `name`, con el color de su categoría
function tagFor(defs, name) {
  const found = findMarker(defs, name)
  return found
    ? { text: found.marker.name, style: { fill: found.category.color } }
    : { text: cleanName(name), style: { fill: UNCATEGORIZED_COLOR } }
}

function toggleTagList(tags, defs, name, on) {
  const list = (tags || []).filter(item => markerKey(tagText(item)) !== markerKey(name))
  return on ? [...list, tagFor(defs, name)] : list
}

// Cambios de las definiciones que hay que llevar a los temas: renombrados (por id),
// borrados y colores. Devuelve una función que transforma la lista de un tema
function tagMigration(oldDefs, newDefs) {
  const newById = new Map(newDefs.flatMap(c => c.markers.map(m => [m.id, { name: m.name, color: c.color }])))
  const changes = new Map()   // nombre anterior (clave) → { name, color } o null si se borró
  oldDefs.forEach(c => c.markers.forEach(m => changes.set(markerKey(m.name), newById.get(m.id) || null)))
  newDefs.forEach(c => c.markers.forEach(m => {
    if (!changes.has(markerKey(m.name))) changes.set(markerKey(m.name), { name: m.name, color: c.color })
  }))
  return tags => {
    const seen = new Set()
    const result = []
    ;(tags || []).forEach(item => {
      const key = markerKey(tagText(item))
      if (!changes.has(key)) { result.push(item); return }
      const next = changes.get(key)
      if (!next || seen.has(markerKey(next.name))) return
      seen.add(markerKey(next.name))
      result.push({ text: next.name, style: { fill: next.color } })
    })
    return result
  }
}

const sameTags = (a, b) => JSON.stringify(a || []) === JSON.stringify(b || [])

// Marcadores usados en los temas que no tienen definición (p. ej. mapas importados)
function undefinedTagsInTree(root, defs) {
  const defined = new Set(defs.flatMap(c => c.markers.map(m => markerKey(m.name))))
  const found = new Map()
  const walk = node => {
    if (!node) return
    ;(node.data && node.data.tag || []).forEach(item => {
      const text = tagText(item)
      if (text && !defined.has(markerKey(text)) && !found.has(markerKey(text))) found.set(markerKey(text), text)
    })
    ;(node.children || []).forEach(walk)
  }
  walk(root)
  return [...found.values()].sort((a, b) => a.localeCompare(b))
}
