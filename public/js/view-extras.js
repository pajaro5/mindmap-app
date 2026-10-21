// Vista: mostrar hasta un nivel, enfoque en un tema y filtros guardados con nombre.

// Niveles que ofrece "Mostrar nivel" (1 = solo los temas principales)
const SHOW_LEVELS = [1, 2, 3, 4]

// ---- Enfoque en el tema (como "Focus on Topic" de MindManager) ----
// Contrae todas las ramas salvo el camino hasta el tema y el propio tema con todos sus
// subtemas desplegados. Cambia el estado desplegado del mapa: un paso de deshacer.
function focusTopic(mindMap, uid) {
  const tree = mindMap.renderer.renderTree
  const path = []
  const findPath = node => {
    if (!node || !node.data) return false
    path.push(node.data.uid)
    if (node.data.uid === uid) return true
    if ((node.children || []).some(findPath)) return true
    path.pop()
    return false
  }
  if (!findPath(tree)) return
  const ancestors = new Set(path)
  const walk = (node, inside) => {
    const isTarget = node.data.uid === uid
    const within = inside || isTarget
    if ((node.children || []).length) node.data.expand = within || ancestors.has(node.data.uid)
    ;(node.children || []).forEach(child => walk(child, within))
  }
  walk(tree, false)
  mindMap.render()
}

// ---- Filtros guardados (en el tema central, así viajan con el mapa) ----
const SAVED_FILTERS_KEY = '_savedFilters'
const SAVED_FILTERS_MAX = 30
const FILTER_NAME_MAX = 60

// Filtro válido a partir de lo guardado (puede venir de fuera de la app)
function normalizeFilter(raw) {
  const f = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const strings = (list, max = 50) => (Array.isArray(list) ? list : [])
    .filter(v => typeof v === 'string' && v.trim()).map(v => v.trim().slice(0, 100)).slice(0, max)
  return {
    mode: f.mode === 'any' ? 'any' : 'all',
    text: typeof f.text === 'string' ? f.text.slice(0, 200) : '',
    icons: strings(f.icons).filter(isIconId),
    tags: strings(f.tags),
    resources: strings(f.resources),
    status: FILTER_STATUSES.some(s => s.value === f.status) ? f.status : '',
    withSubtopics: f.withSubtopics === true
  }
}

function normalizeSavedFilters(raw) {
  const seen = new Set()
  return (Array.isArray(raw) ? raw : [])
    .filter(item => item && typeof item === 'object' && typeof item.name === 'string' && item.name.trim())
    .map(item => ({ name: item.name.trim().slice(0, FILTER_NAME_MAX), filter: normalizeFilter(item.filter) }))
    .filter(item => isFilterActive(item.filter) && !seen.has(item.name.toLowerCase()) && seen.add(item.name.toLowerCase()))
    .slice(0, SAVED_FILTERS_MAX)
}

// Añade (o sustituye, si ya hay uno con ese nombre) un filtro guardado
function withSavedFilter(list, name, filter) {
  const clean = name.trim().slice(0, FILTER_NAME_MAX)
  const rest = list.filter(item => item.name.toLowerCase() !== clean.toLowerCase())
  return normalizeSavedFilters([...rest, { name: clean, filter }])
}

// Comando SET_SAVED_FILTERS: guarda la lista en el tema central (un paso de deshacer)
function setSavedFilters(mindMap, list) {
  const root = mindMap.renderer.root
  if (!root) return
  const clean = normalizeSavedFilters(list)
  mindMap.renderer.setNodeData(root, { [SAVED_FILTERS_KEY]: clean.length ? clean : undefined })
  mindMap.render()
}

// Registra los comandos de esta vista (execCommand los mete en el historial)
function installViewExtras(mindMap) {
  mindMap.command.add('FOCUS_TOPIC', uid => focusTopic(mindMap, uid))
  mindMap.command.add('SET_SAVED_FILTERS', list => setSavedFilters(mindMap, list))
}
