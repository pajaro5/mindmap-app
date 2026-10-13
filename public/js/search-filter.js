// Vista: Buscar / Reemplazar y Filtro.
//
// Búsqueda propia en lugar del plugin `search` de simple-mind-map, que: distingue
// mayúsculas y tildes, reemplaza DENTRO del HTML del texto enriquecido (buscar "span"
// rompía el tema) e inserta el texto de reemplazo sin escapar (XSS). Aquí se busca en el
// texto plano, sin distinguir mayúsculas ni tildes (opcionalmente sí las mayúsculas), y lo
// que se inserta se escapa.
//
// El filtro es un estado de la vista (no cambia el mapa ni el historial): los temas que no
// cumplen se atenúan; los que cumplen y sus antecesores (para ver el contexto) no.

// ---- Texto de los temas ----
// Texto plano de un tema; cada párrafo o <br> es un salto de línea
function topicPlainText(data) {
  const raw = String((data && data.text) || '')
  if (!(data && data.richText) && !/<[a-z][\s\S]*>/i.test(raw)) return raw
  return topicLines(raw).join('\n')
}

// HTML de texto enriquecido para un texto plano (escapado; una línea por párrafo)
function plainToRichText(text) {
  return String(text).split('\n').map(line => `<p>${line ? escapeXml(line) : '<br>'}</p>`).join('')
}

// Texto plegado (sin tildes; en minúsculas salvo `matchCase`) y, para cada carácter
// plegado, la posición del carácter original: así una coincidencia en el texto plegado se
// traduce a posiciones del original aunque un carácter se pliegue en varios o en ninguno
function foldWithIndex(text, matchCase) {
  const source = String(text).normalize('NFC')
  let folded = ''
  const map = []
  for (let i = 0; i < source.length; i++) {
    let piece = source[i].normalize('NFD').replace(/[̀-ͯ]/g, '')
    if (!matchCase) piece = piece.toLowerCase()
    // Por unidades UTF-16, como indexOf (con emojis los índices seguirían cuadrando)
    for (let k = 0; k < piece.length; k++) {
      folded += piece[k]
      map.push(i)
    }
  }
  return { source, folded, map }
}

// Rangos [inicio, fin) de las coincidencias de `query` en `text`
function findRanges(text, query, { matchCase = false } = {}) {
  const q = foldWithIndex(query, matchCase).folded
  if (!q) return []
  const { source, folded, map } = foldWithIndex(text, matchCase)
  const ranges = []
  let from = 0
  for (;;) {
    const at = folded.indexOf(q, from)
    if (at < 0) break
    const end = at + q.length
    ranges.push([map[at], end < map.length ? map[end] : source.length])
    from = end
  }
  return ranges
}

function replaceInText(text, query, replacement, options) {
  const source = String(text).normalize('NFC')
  const ranges = findRanges(source, query, options)
  if (!ranges.length) return source
  let out = ''
  let last = 0
  for (const [start, end] of ranges) {
    out += source.slice(last, start) + replacement
    last = end
  }
  return out + source.slice(last)
}

function topicMatchesQuery(data, query, { matchCase = false, includeNotes = false } = {}) {
  if (findRanges(topicPlainText(data), query, { matchCase }).length) return true
  return !!(includeNotes && data.note && findRanges(String(data.note), query, { matchCase }).length)
}

// uids de los temas que coinciden, en orden de lectura (también en ramas contraídas)
function searchTopics(renderTree, query, options) {
  const result = []
  const walk = node => {
    if (!node || !node.data) return
    if (topicMatchesQuery(node.data, query, options)) result.push(node.data.uid)
    ;(node.children || []).forEach(walk)
  }
  if (String(query || '').trim()) walk(renderTree)
  return result
}

// Comando REPLACE_TOPIC_TEXT: reemplaza en el texto de los temas indicados (una entrada de
// historial). El resultado se guarda como texto enriquecido escapado.
function replaceTopicText(mindMap, uids, query, replacement, options) {
  const renderer = mindMap.renderer
  const wanted = new Set([].concat(uids))
  const walk = nodeData => {
    if (!nodeData) return
    const data = nodeData.data
    if (wanted.has(data.uid)) {
      const plain = topicPlainText(data)
      const next = replaceInText(plain, query, replacement, options)
      if (next !== plain.normalize('NFC')) {
        const change = data.richText ? { text: plainToRichText(next), richText: true } : { text: next }
        const node = renderer.findNodeByUid(data.uid)
        if (node) {
          renderer.setNodeData(node, change)
          node.reRender()
        } else {
          Object.assign(data, change)
        }
      }
    }
    ;(nodeData.children || []).forEach(walk)
  }
  walk(renderer.renderTree)
  mindMap.render()
}

// ---- Filtro ----
const FILTER_STATUSES = [
  { value: '', label: 'Cualquiera' },
  { value: 'overdue', label: 'Vencidas' },
  { value: 'dueSoon', label: 'Vencen en los próximos 7 días' },
  { value: 'pending', label: 'Sin completar' },
  { value: 'done', label: 'Completadas' },
  { value: 'dated', label: 'Con fechas' }
]

const emptyFilter = () => ({ mode: 'all', text: '', icons: [], tags: [], resources: [], status: '', withSubtopics: false })

function isFilterActive(f) {
  return !!(f && (String(f.text || '').trim() || f.icons.length || f.tags.length || f.resources.length || f.status))
}

function taskStatusMatches(data, status, today) {
  const task = normalizeTask(data[TASK_KEY]) || {}
  const progress = progressOf(data.icon)
  const due = task.due ? dayNumber(task.due) : null
  const now = dayNumber(today)
  switch (status) {
    case 'overdue': return due !== null && due < now && progress < 100
    case 'dueSoon': return due !== null && due >= now && due <= now + 7 && progress < 100
    case 'pending': return progress < 100
    case 'done': return progress >= 100
    case 'dated': return !!(task.start || task.due)
    default: return true
  }
}

// ¿Cumple el tema los criterios? Con mode 'all' todos los criterios activos; con 'any', alguno
function topicMatchesFilter(data, f, today = todayIso()) {
  const checks = []
  if (String(f.text || '').trim()) checks.push(topicMatchesQuery(data, f.text, { includeNotes: true }))
  if (f.icons.length) checks.push((data.icon || []).some(id => f.icons.includes(id)))
  if (f.tags.length) {
    const wanted = new Set(f.tags.map(markerKey))
    checks.push((data.tag || []).some(t => wanted.has(markerKey(tagText(t)))))
  }
  if (f.resources.length) {
    const wanted = new Set(f.resources.map(markerKey))
    const task = normalizeTask(data[TASK_KEY]) || {}
    checks.push((task.resources || []).some(r => wanted.has(markerKey(r))))
  }
  if (f.status) checks.push(taskStatusMatches(data, f.status, today))
  if (!checks.length) return true
  return f.mode === 'any' ? checks.some(Boolean) : checks.every(Boolean)
}

// Recorre el árbol de datos y devuelve { matched, visible } (conjuntos de uids). Visibles:
// los que cumplen, sus antecesores y, con withSubtopics, sus descendientes
function computeFilter(renderTree, f, today = todayIso()) {
  const matched = new Set()
  const visible = new Set()
  const walk = (node, ancestors, insideMatch) => {
    if (!node || !node.data) return
    const uid = node.data.uid
    const isMatch = topicMatchesFilter(node.data, f, today)
    if (isMatch) {
      matched.add(uid)
      visible.add(uid)
      ancestors.forEach(a => visible.add(a))
    } else if (insideMatch) {
      visible.add(uid)
    }
    ;(node.children || []).forEach(child => walk(child, [...ancestors, uid], (insideMatch || isMatch) && f.withSubtopics))
  }
  walk(renderTree, [], false)
  // El tema central siempre se ve (contexto), aunque no cumpla nada
  if (renderTree && renderTree.data) visible.add(renderTree.data.uid)
  return { matched, visible }
}

// Valores usados en el mapa, para ofrecerlos en el panel Filtro
function filterOptionsInTree(renderTree) {
  const icons = new Set()
  const tags = new Map()
  const walk = node => {
    if (!node || !node.data) return
    ;(node.data.icon || []).forEach(id => icons.add(id))
    ;(node.data.tag || []).forEach(t => {
      const text = tagText(t)
      if (text && !tags.has(markerKey(text))) tags.set(markerKey(text), text)
    })
    ;(node.children || []).forEach(walk)
  }
  walk(renderTree)
  return {
    icons: [...icons],
    tags: [...tags.values()].sort((a, b) => a.localeCompare(b)),
    resources: resourcesInTree(renderTree)
  }
}

// ---- Marcas en el lienzo (clases CSS sobre los temas pintados) ----
// Se vuelven a aplicar tras cada render, porque la librería recrea los elementos
function applyViewMarks(mindMap, { searchMatches = [], searchCurrent = null, filter = null }) {
  const matches = new Set(searchMatches)
  visibleNodes(mindMap).forEach(node => {
    const el = node.group && node.group.node
    if (!el) return
    el.classList.toggle('smm-search-match', matches.has(node.uid))
    el.classList.toggle('smm-search-current', node.uid === searchCurrent)
    const dim = !!filter && !filter.visible.has(node.uid)
    el.classList.toggle('smm-filter-dim', dim)
    // La línea que llega al tema desde su padre
    const parent = node.parent
    if (parent && parent._lines && parent.children) {
      const line = parent._lines[parent.children.indexOf(node)]
      if (line && line.node) line.node.classList.toggle('smm-filter-dim', dim)
    }
  })
  // Las llamadas siguen a su tema
  const layer = mindMap.__calloutLayer
  if (layer && layer.node.isConnected) {
    layer.node.querySelectorAll('.smm-callout').forEach(el => {
      el.classList.toggle('smm-filter-dim', !!filter && !filter.visible.has(el.getAttribute('data-node-uid')))
    })
  }
}
