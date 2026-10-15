// Diagramas (Fase 13): matrices, Venn, embudos, cebolla, cuarto de círculo, carriles y mapa
// conceptual, como los diagramas de las plantillas de MindManager.
//
// Modelo: el tema central guarda la definición en `_diagram` y hace de título; sus hijos son
// los temas del diagrama, colocados libremente con la posición propia de la librería
// (customLeft/customTop, coordenadas del lienzo). El dibujo de fondo (zonas, rótulos, ejes) va
// en una capa detrás de los temas y se genera a partir de `_diagram`; no se guarda.
//
// Reglas inteligentes (SmartRules de MindManager): cada zona puede fijar un icono, un color de
// relleno o un tamaño de letra; un tema los recibe según la zona en la que está. Lo aplicado se
// recuerda en `_diagramRule` para poder quitarlo al cambiar de zona.
//
// Coordenadas: el diagrama ocupa (0,0)–(width,height). El tema central se fija encima con la
// opción initRootNodePosition, así nada depende del tamaño de la ventana.

const DIAGRAM_KEY = '_diagram'
const DIAGRAM_RULE_KEY = '_diagramRule'
const DIAGRAM_ROOT_POSITION = [0, -110]
const DIAGRAM_LAYOUT = 'logicalStructure'
const DIAGRAM_TYPES = {
  matrix: { name: 'Matriz', min: 1, max: 25, width: 640, height: 440 },
  venn: { name: 'Venn', min: 2, max: 3, width: 620, height: 460 },
  funnel: { name: 'Embudo', min: 2, max: 8, width: 560, height: 440 },
  onion: { name: 'Cebolla', min: 2, max: 6, width: 520, height: 520 },
  quarter: { name: 'Cuarto de círculo', min: 2, max: 6, width: 560, height: 480 },
  lanes: { name: 'Carriles', min: 2, max: 8, width: 860, height: 480 },
  concept: { name: 'Mapa conceptual', min: 0, max: 0, width: 760, height: 460 }
}
const DIAGRAM_PALETTE = ['#3d8fd8', '#7dc142', '#f0a830', '#e0544b', '#8e6fd8', '#2fb5a6', '#d86fb0', '#8a99ab']
const DIAGRAM_FONT = 'Segoe UI, Tahoma, Arial, sans-serif'
// Tamaño aproximado de un tema nuevo (para centrarlo en su zona antes de conocer su tamaño)
const TOPIC_GUESS = { w: 96, h: 32 }
const LANE_HEADER = 120
const LANE_HEADER_V = 44

const diagramText = (value, max = 80) => (typeof value === 'string' || Number.isFinite(value) ? String(value) : '')
  .replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max)
const clampNumber = (value, min, max, fallback) => {
  const n = Number(value)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}
const isZoneId = id => typeof id === 'string' && /^[a-z0-9_-]{1,24}$/i.test(id)

// ---- Normalización (también es el saneado de datos que vienen de fuera) ----
function normalizeDiagramRule(rule) {
  if (!rule || typeof rule !== 'object') return null
  const out = {}
  if (isIconId(rule.icon)) out.icon = rule.icon
  if (isHexColor(rule.fill)) out.fill = rule.fill.toLowerCase()
  if (rule.fontSize !== undefined && Number.isFinite(Number(rule.fontSize))) out.fontSize = clampNumber(rule.fontSize, 9, 40, 14)
  return Object.keys(out).length ? out : null
}

function normalizeDiagram(value) {
  if (!value || typeof value !== 'object' || !DIAGRAM_TYPES[value.type]) return null
  const spec = DIAGRAM_TYPES[value.type]
  const d = {
    type: value.type,
    width: Math.round(clampNumber(value.width, 200, 3000, spec.width)),
    height: Math.round(clampNumber(value.height, 160, 3000, spec.height))
  }
  if (d.type === 'matrix') {
    d.rows = Math.round(clampNumber(value.rows, 1, 5, 2))
    d.cols = Math.round(clampNumber(value.cols, 1, 5, 2))
    for (const key of ['xLabel', 'xLow', 'xHigh', 'yLabel', 'yLow', 'yHigh']) {
      const text = diagramText(value[key], 40)
      if (text) d[key] = text
    }
  }
  if (d.type === 'lanes') d.orientation = value.orientation === 'vertical' ? 'vertical' : 'horizontal'
  const count = d.type === 'matrix' ? d.rows * d.cols : null
  const seen = new Set()
  const items = []
  ;(Array.isArray(value.items) ? value.items : []).forEach((item, i) => {
    if (!item || typeof item !== 'object') return
    const id = isZoneId(item.id) && !seen.has(item.id) ? item.id : `z${i + 1}`
    if (seen.has(id)) return
    seen.add(id)
    items.push({ id, label: diagramText(item.label), color: isHexColor(item.color) ? item.color.toLowerCase() : DIAGRAM_PALETTE[i % DIAGRAM_PALETTE.length] })
  })
  const max = count || spec.max
  const min = count || spec.min
  while (items.length < min) {
    let n = items.length + 1
    while (seen.has(`z${n}`)) n++
    seen.add(`z${n}`)
    items.push({ id: `z${n}`, label: '', color: DIAGRAM_PALETTE[items.length % DIAGRAM_PALETTE.length] })
  }
  d.items = items.slice(0, max)
  const zones = new Set(diagramZoneIds(d))
  const rules = {}
  if (value.rules && typeof value.rules === 'object') {
    for (const [zone, rule] of Object.entries(value.rules)) {
      const clean = zones.has(zone) && normalizeDiagramRule(rule)
      if (clean) rules[zone] = clean
    }
  }
  if (Object.keys(rules).length) d.rules = rules
  return d
}

// Zonas: una por elemento; en Venn, una por cada combinación de círculos ("a+b")
function diagramZoneIds(d) {
  const ids = d.items.map(i => i.id)
  if (d.type !== 'venn') return ids
  const out = []
  for (let mask = 1; mask < (1 << ids.length); mask++) out.push(ids.filter((_, i) => mask & (1 << i)).join('+'))
  return out
}

function diagramZoneLabel(d, zoneId) {
  if (!zoneId) return ''
  return zoneId.split('+').map(id => (d.items.find(i => i.id === id) || {}).label || id).join(' ∩ ')
}

// ---- Geometría ----
function vennCircles(d) {
  const { width: W, height: H } = d
  const n = d.items.length
  if (n === 2) {
    const r = Math.min(H / 2 - 30, W / 3.3)
    return d.items.map((item, i) => ({ item, cx: W / 2 + (i === 0 ? -0.6 : 0.6) * r, cy: H / 2, r }))
  }
  const r = Math.min(W, H) * 0.29
  const pos = [[-0.58, -0.36], [0.58, -0.36], [0, 0.64]]
  return d.items.map((item, i) => ({ item, cx: W / 2 + pos[i][0] * r, cy: H / 2 + pos[i][1] * r, r }))
}

const ringRadii = (d, rmax) => d.items.map((_, k) => rmax * (k + 1) / d.items.length)
const funnelHalfWidth = (d, y) => d.width / 2 - (d.width / 2 - d.width * 0.15) * (y / d.height)

function laneBands(d) {
  const n = d.items.length
  const vertical = d.orientation === 'vertical'
  const size = (vertical ? d.width : d.height) / n
  return d.items.map((item, k) => vertical
    ? { item, x: k * size, y: 0, w: size, h: d.height }
    : { item, x: 0, y: k * size, w: d.width, h: size })
}

function matrixCells(d) {
  const cw = d.width / d.cols
  const ch = d.height / d.rows
  return d.items.map((item, i) => ({ item, x: (i % d.cols) * cw, y: Math.floor(i / d.cols) * ch, w: cw, h: ch }))
}

// Zona en un punto del lienzo (o null si está fuera de todas)
function diagramZoneAt(d, x, y) {
  if (!d) return null
  switch (d.type) {
    case 'matrix': {
      const cell = matrixCells(d).find(c => x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h)
      return cell ? cell.item.id : null
    }
    case 'venn': {
      const inside = vennCircles(d).filter(c => Math.hypot(x - c.cx, y - c.cy) <= c.r).map(c => c.item.id)
      return inside.length ? inside.join('+') : null
    }
    case 'funnel': {
      if (y < 0 || y >= d.height || Math.abs(x - d.width / 2) > funnelHalfWidth(d, y) + 40) return null
      return d.items[Math.floor(y / (d.height / d.items.length))].id
    }
    case 'onion': {
      const dist = Math.hypot(x - d.width / 2, y - d.height / 2)
      const k = ringRadii(d, Math.min(d.width, d.height) / 2).findIndex(r => dist <= r)
      return k >= 0 ? d.items[k].id : null
    }
    case 'quarter': {
      if (x < 0 || y > d.height) return null
      const dist = Math.hypot(x, d.height - y)
      const k = ringRadii(d, Math.min(d.width, d.height)).findIndex(r => dist <= r)
      return k >= 0 ? d.items[k].id : null
    }
    case 'lanes': {
      const band = laneBands(d).find(b => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h)
      return band ? band.item.id : null
    }
    default:
      return null
  }
}

// Dónde va el primer tema de una zona (esquina superior izquierda del tema)
function diagramZoneAnchor(d, zoneId) {
  const guessAt = (cx, cy) => ({ x: Math.round(cx - TOPIC_GUESS.w / 2), y: Math.round(cy - TOPIC_GUESS.h / 2) })
  switch (d.type) {
    case 'matrix': {
      const cell = matrixCells(d).find(c => c.item.id === zoneId) || matrixCells(d)[0]
      return { x: Math.round(cell.x + 18), y: Math.round(cell.y + 42) }
    }
    case 'funnel': {
      const k = Math.max(0, d.items.findIndex(i => i.id === zoneId))
      const h = d.height / d.items.length
      return guessAt(d.width / 2, k * h + h * 0.62)
    }
    case 'onion': {
      const k = Math.max(0, d.items.findIndex(i => i.id === zoneId))
      const radii = ringRadii(d, Math.min(d.width, d.height) / 2)
      const inner = k ? radii[k - 1] : 0
      return guessAt(d.width / 2, d.height / 2 + (k ? (inner + radii[k]) / 2 : 0))
    }
    case 'quarter': {
      const k = Math.max(0, d.items.findIndex(i => i.id === zoneId))
      const radii = ringRadii(d, Math.min(d.width, d.height))
      const mid = ((k ? radii[k - 1] : 0) + radii[k]) / 2
      return guessAt(mid * Math.cos(Math.PI / 4) + 20, d.height - mid * Math.sin(Math.PI / 4))
    }
    case 'lanes': {
      const band = laneBands(d).find(b => b.item.id === zoneId) || laneBands(d)[0]
      return d.orientation === 'vertical'
        ? guessAt(band.x + band.w / 2, LANE_HEADER_V + 40)
        : { x: Math.round(LANE_HEADER + 24), y: Math.round(band.y + band.h / 2 - TOPIC_GUESS.h / 2) }
    }
    case 'venn': {
      // Centro aproximado de la zona: media de los puntos de una rejilla que caen en ella
      let sx = 0
      let sy = 0
      let n = 0
      for (let x = 0; x <= d.width; x += 8) {
        for (let y = 0; y <= d.height; y += 8) {
          if (diagramZoneAt(d, x, y) === zoneId) { sx += x; sy += y; n++ }
        }
      }
      return n ? guessAt(sx / n, sy / n) : guessAt(d.width / 2, d.height / 2)
    }
    default:
      return { x: 20, y: 20 }
  }
}

// Dibujo como lista de primitivas: la usan la capa del lienzo (svg.js) y la vista previa (texto)
function diagramShapes(d) {
  const out = []
  const label = (x, y, text, opts = {}) => text && out.push({ kind: 'text', x, y, text, size: 15, weight: 600, anchor: 'middle', fill: '#26313d', ...opts })
  switch (d.type) {
    case 'matrix': {
      matrixCells(d).forEach(c => {
        out.push({ kind: 'rect', x: c.x, y: c.y, w: c.w, h: c.h, fill: c.item.color, opacity: 0.16, stroke: '#ffffff', strokeWidth: 4, zone: c.item.id })
        out.push({ kind: 'rect', x: c.x + 2, y: c.y + 2, w: c.w - 4, h: 6, fill: c.item.color, opacity: 0.9 })
        label(c.x + 16, c.y + 30, c.item.label, { anchor: 'start', item: c.item.id })
      })
      const { width: W, height: H } = d
      if (d.xLabel || d.xLow || d.xHigh) {
        out.push({ kind: 'arrow', x1: 0, y1: H + 14, x2: W, y2: H + 14 })
        label(W / 2, H + 36, d.xLabel, { size: 14 })
        label(0, H + 36, d.xLow, { anchor: 'start', size: 12, weight: 400 })
        label(W, H + 36, d.xHigh, { anchor: 'end', size: 12, weight: 400 })
      }
      if (d.yLabel || d.yLow || d.yHigh) {
        out.push({ kind: 'arrow', x1: -14, y1: H, x2: -14, y2: 0 })
        label(-30, H / 2, d.yLabel, { size: 14, rotate: -90 })
        label(-30, H, d.yLow, { anchor: 'start', size: 12, weight: 400, rotate: -90 })
        label(-30, 0, d.yHigh, { anchor: 'end', size: 12, weight: 400, rotate: -90 })
      }
      break
    }
    case 'venn':
      vennCircles(d).forEach(c => out.push({ kind: 'circle', cx: c.cx, cy: c.cy, r: c.r, fill: c.item.color, opacity: 0.2, stroke: c.item.color, strokeWidth: 2.5, zone: c.item.id }))
      vennCircles(d).forEach((c, i) => {
        const below = d.items.length === 3 && i === 2
        label(c.cx + (d.items.length === 2 ? (i ? 0.35 : -0.35) * c.r : 0), below ? c.cy + c.r + 26 : c.cy - c.r - 12, c.item.label, { fill: c.item.color, item: c.item.id })
      })
      break
    case 'funnel': {
      const h = d.height / d.items.length
      d.items.forEach((item, k) => {
        const y0 = k * h + (k ? 3 : 0)
        const y1 = (k + 1) * h - (k < d.items.length - 1 ? 3 : 0)
        const cx = d.width / 2
        const points = [[cx - funnelHalfWidth(d, y0), y0], [cx + funnelHalfWidth(d, y0), y0], [cx + funnelHalfWidth(d, y1), y1], [cx - funnelHalfWidth(d, y1), y1]]
        out.push({ kind: 'polygon', points, fill: item.color, opacity: 0.85, zone: item.id })
        label(cx, y0 + 22, item.label, { fill: '#ffffff', item: item.id })
      })
      break
    }
    case 'onion': {
      const radii = ringRadii(d, Math.min(d.width, d.height) / 2)
      for (let k = d.items.length - 1; k >= 0; k--) {
        out.push({ kind: 'circle', cx: d.width / 2, cy: d.height / 2, r: radii[k], fill: d.items[k].color, opacity: 0.22 + 0.5 * (1 - k / d.items.length), stroke: '#ffffff', strokeWidth: 3, zone: d.items[k].id })
      }
      d.items.forEach((item, k) => label(d.width / 2, d.height / 2 - radii[k] + (k ? 22 : radii[k] / 2 - 18), item.label, { item: item.id }))
      break
    }
    case 'quarter': {
      const radii = ringRadii(d, Math.min(d.width, d.height))
      const H = d.height
      for (let k = d.items.length - 1; k >= 0; k--) {
        const r = radii[k]
        out.push({ kind: 'path', d: `M0 ${H}L${r} ${H}A${r} ${r} 0 0 0 0 ${H - r}Z`, fill: d.items[k].color, opacity: 0.22 + 0.5 * (1 - k / d.items.length), stroke: '#ffffff', strokeWidth: 3, zone: d.items[k].id })
      }
      d.items.forEach((item, k) => label(((k ? radii[k - 1] : 0) + radii[k]) / 2, H + 24, item.label, { item: item.id, size: 13 }))
      break
    }
    case 'lanes': {
      const vertical = d.orientation === 'vertical'
      laneBands(d).forEach((b, k) => {
        out.push({ kind: 'rect', x: b.x, y: b.y, w: b.w, h: b.h, fill: k % 2 ? '#eef3f8' : '#f7f9fc', opacity: 1, stroke: '#c6d2df', strokeWidth: 1.5, zone: b.item.id })
        if (vertical) {
          out.push({ kind: 'rect', x: b.x, y: b.y, w: b.w, h: LANE_HEADER_V, fill: b.item.color, opacity: 0.9, stroke: '#ffffff', strokeWidth: 1.5 })
          label(b.x + b.w / 2, b.y + 28, b.item.label, { fill: '#ffffff', item: b.item.id })
        } else {
          out.push({ kind: 'rect', x: b.x, y: b.y, w: LANE_HEADER, h: b.h, fill: b.item.color, opacity: 0.9, stroke: '#ffffff', strokeWidth: 1.5 })
          label(LANE_HEADER / 2, b.y + b.h / 2 + 5, b.item.label, { fill: '#ffffff', item: b.item.id })
        }
      })
      break
    }
  }
  return out
}

// Opciones del constructor de la librería para un mapa que es un diagrama
function diagramMapOptions(rootData) {
  return rootData && normalizeDiagram(rootData[DIAGRAM_KEY]) ? { initRootNodePosition: DIAGRAM_ROOT_POSITION } : {}
}

// ---- Capa del lienzo ----
function diagramOf(mindMap) {
  const root = mindMap && mindMap.renderer && mindMap.renderer.renderTree
  return root && root.data ? normalizeDiagram(root.data[DIAGRAM_KEY]) : null
}

// Coordenadas del lienzo a partir de un evento del ratón
function diagramPointFromEvent(mindMap, e) {
  const { x, y } = mindMap.toPos(e.clientX, e.clientY)
  const t = mindMap.draw.transform()
  return { x: (x - t.translateX) / t.scaleX, y: (y - t.translateY) / t.scaleY }
}

// handlers: { onZoneDblClick(zoneId, point), onLabelDblClick(itemId) } (solo en el editor)
function renderDiagramLayer(mindMap, handlers = {}) {
  const draw = mindMap.draw
  if (!draw) return
  const d = diagramOf(mindMap)
  let layer = mindMap.__diagramLayer
  const signature = d ? JSON.stringify(d) : ''
  if (layer && layer.node.isConnected && layer.attr('data-signature') === signature) return
  if (layer) layer.remove()
  mindMap.__diagramLayer = null
  if (!d) return
  layer = draw.group().addClass('smm-diagram').attr({ 'data-signature': signature, 'data-type': d.type })
  layer.back()
  mindMap.__diagramLayer = layer
  diagramShapes(d).forEach(s => drawDiagramShape(layer, s))
  if (handlers.onZoneDblClick || handlers.onLabelDblClick) {
    layer.on('dblclick', e => {
      e.stopPropagation()
      const itemId = e.target && e.target.getAttribute && (e.target.closest('[data-item]') || { getAttribute: () => null }).getAttribute('data-item')
      if (itemId && handlers.onLabelDblClick) return handlers.onLabelDblClick(itemId)
      const p = diagramPointFromEvent(mindMap, e)
      const zone = diagramZoneAt(d, p.x, p.y)
      if (handlers.onZoneDblClick) handlers.onZoneDblClick(zone, p)
    })
  }
}

function drawDiagramShape(layer, s) {
  let el
  switch (s.kind) {
    case 'rect': el = layer.rect(s.w, s.h).move(s.x, s.y).radius(4); break
    case 'circle': el = layer.circle(s.r * 2).center(s.cx, s.cy); break
    case 'polygon': el = layer.polygon(s.points.map(p => p.join(',')).join(' ')); break
    case 'path': el = layer.path(s.d); break
    case 'arrow':
      layer.line(s.x1, s.y1, s.x2, s.y2).stroke({ color: '#8a99ab', width: 1.5 })
      layer.path(arrowHead(s)).fill('#8a99ab')
      return
    case 'text': {
      // svg.js asigna el texto como textContent: un rótulo nunca se interpreta como HTML
      el = layer.plain(s.text).font({ family: DIAGRAM_FONT, size: s.size, weight: s.weight, anchor: s.anchor }).fill(s.fill)
      el.attr({ x: s.x, y: s.y })
      if (s.rotate) el.attr('transform', `rotate(${s.rotate} ${s.x} ${s.y})`)
      if (s.item) el.attr({ 'data-item': s.item, cursor: 'text' }).addClass('smm-diagram-label')
      return
    }
  }
  el.fill({ color: s.fill, opacity: s.opacity })
  if (s.stroke) el.stroke({ color: s.stroke, width: s.strokeWidth })
  if (s.zone) el.attr('data-zone', s.zone)
}

function arrowHead({ x1, y1, x2, y2 }) {
  const a = Math.atan2(y2 - y1, x2 - x1)
  const p = (da, len) => `${x2 - len * Math.cos(a + da)} ${y2 - len * Math.sin(a + da)}`
  return `M${x2} ${y2}L${p(0.45, 9)}L${p(-0.45, 9)}Z`
}

// El título (tema central) va centrado encima del diagrama. La librería lo coloca con la opción
// initRootNodePosition en cada render; si cambia su tamaño (se edita el texto) se recoloca.
function centerDiagramTitle(mindMap) {
  const d = diagramOf(mindMap)
  const root = mindMap.renderer && mindMap.renderer.root
  if (!d || !root || !root.width) return false
  const want = [Math.round(d.width / 2 - root.width / 2), Math.round(-root.height - 40)]
  const current = mindMap.opt.initRootNodePosition
  if (Array.isArray(current) && current[0] === want[0] && current[1] === want[1]) return false
  mindMap.opt.initRootNodePosition = want
  return true
}

// En un diagrama, el tema central es el título: sin líneas hacia los temas del diagrama
function hideRootLines(mindMap) {
  const root = mindMap.renderer && mindMap.renderer.root
  if (!root || !diagramOf(mindMap)) return
  ;(root._lines || []).forEach(line => line.hide())
}

// ---- Vista previa de la galería ----
function diagramPreviewSvg(d, topicCount = 0) {
  const pad = d.type === 'matrix' && (d.yLabel || d.xLabel) ? 40 : 10
  const minX = -pad
  const minY = -60
  const w = d.width + pad + 20
  const h = d.height + 60 + (d.type === 'quarter' || (d.type === 'matrix' && d.xLabel) ? 50 : 14)
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  const parts = diagramShapes(d).filter(s => s.kind !== 'text').map(s => {
    const paint = `fill="${s.fill}" fill-opacity="${s.opacity}"${s.stroke ? ` stroke="${s.stroke}" stroke-width="${s.strokeWidth}"` : ''}`
    switch (s.kind) {
      case 'rect': return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="4" ${paint}/>`
      case 'circle': return `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" ${paint}/>`
      case 'polygon': return `<polygon points="${esc(s.points.map(p => p.join(',')).join(' '))}" ${paint}/>`
      case 'path': return `<path d="${esc(s.d)}" ${paint}/>`
      case 'arrow': return `<path d="M${s.x1} ${s.y1}L${s.x2} ${s.y2}" stroke="#8a99ab" stroke-width="3"/>`
      default: return ''
    }
  })
  // Título y unas píldoras que representan los temas
  parts.push(`<rect x="${d.width / 2 - 90}" y="-50" width="180" height="34" rx="8" fill="#3d8fd8"/>`)
  if (d.type === 'concept') {
    const spots = [[80, 60], [420, 40], [250, 200], [560, 220], [100, 330], [430, 360]]
    spots.slice(0, Math.max(4, Math.min(6, topicCount))).forEach(([x, y], i, arr) => {
      if (i) parts.push(`<path d="M${arr[i - 1][0] + 60} ${arr[i - 1][1] + 20}L${x + 60} ${y + 20}" stroke="#b9b9b9" stroke-width="4" stroke-dasharray="10 6"/>`)
    })
    spots.slice(0, Math.max(4, Math.min(6, topicCount))).forEach(([x, y]) => parts.push(`<rect x="${x}" y="${y}" width="120" height="40" rx="8" fill="#7dc142"/>`))
  }
  return `<svg viewBox="${minX} ${minY} ${w} ${h}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" data-diagram="${esc(d.type)}">${parts.join('')}</svg>`
}

// ---- Temas del diagrama: colocación y reglas ----
const hasPosition = data => Number.isFinite(data.customLeft) && Number.isFinite(data.customTop)
// La librería usa `customLeft || left`: un 0 exacto se ignoraría
const nonZero = v => (Math.round(v) === 0 ? 1 : Math.round(v))

function topicBox(mindMap, data) {
  const node = mindMap.renderer.findNodeByUid && data.uid ? mindMap.renderer.findNodeByUid(data.uid) : null
  return {
    x: data.customLeft,
    y: data.customTop,
    w: node && node.width ? node.width : TOPIC_GUESS.w,
    h: node && node.height ? node.height : TOPIC_GUESS.h
  }
}

function zoneOfTopic(mindMap, d, data) {
  if (!hasPosition(data)) return null
  const b = topicBox(mindMap, data)
  return diagramZoneAt(d, b.x + b.w / 2, b.y + b.h / 2)
}

// Posición para un tema nuevo: donde se pidió (doble clic), junto al hermano anterior (en
// carriles horizontales a su derecha; si no, debajo) o en la primera zona
function placementFor(mindMap, d, siblings, index, pending) {
  if (pending) return { x: nonZero(pending.x - TOPIC_GUESS.w / 2), y: nonZero(pending.y - TOPIC_GUESS.h / 2) }
  const prev = siblings.slice(0, index).reverse().find(s => hasPosition(s.data))
  if (prev) {
    const b = topicBox(mindMap, prev.data)
    if (d.type === 'lanes' && d.orientation !== 'vertical') return { x: nonZero(b.x + b.w + 36), y: nonZero(b.y) }
    return { x: nonZero(b.x), y: nonZero(b.y + b.h + 12) }
  }
  const first = d.items[0]
  const anchor = first ? diagramZoneAnchor(d, first.id) : { x: 20, y: 20 }
  return { x: nonZero(anchor.x), y: nonZero(anchor.y) }
}

// Texto legible sobre un relleno: oscuro sobre colores claros y blanco sobre oscuros
function ruleTextColor(fill) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(fill.slice(i, i + 2), 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6 ? '#1e2a3a' : '#ffffff'
}

// Aplica la regla de la zona (o quita la anterior). Devuelve true si cambió algo.
// El relleno es como el de Formato › Color de relleno (sin degradado), con texto legible.
function applyDiagramRule(data, rule) {
  const snapshot = () => JSON.stringify([data.icon, data.fillColor, data.gradientStyle, data.color, data.fontSize, data[DIAGRAM_RULE_KEY]])
  const before = snapshot()
  const prev = normalizeDiagramRule(data[DIAGRAM_RULE_KEY]) || {}
  const next = rule || {}
  let icons = Array.isArray(data.icon) ? data.icon.filter(i => i !== prev.icon || i === next.icon) : []
  if (next.icon && !icons.includes(next.icon)) {
    const group = iconGroupOf(next.icon)
    if (EXCLUSIVE_ICON_GROUPS.includes(group)) icons = icons.filter(i => iconGroupOf(i) !== group)
    icons = [next.icon, ...icons]
  }
  if (icons.length || data.icon !== undefined) data.icon = icons
  if (prev.fill && data.fillColor === prev.fill && next.fill !== prev.fill) {
    delete data.fillColor
    if (data.gradientStyle === false) delete data.gradientStyle
    if (data.color === ruleTextColor(prev.fill)) delete data.color
  }
  if (next.fill) {
    data.fillColor = next.fill
    data.gradientStyle = false
    data.color = ruleTextColor(next.fill)
  }
  if (prev.fontSize && data.fontSize === prev.fontSize && next.fontSize !== prev.fontSize) delete data.fontSize
  if (next.fontSize) data.fontSize = next.fontSize
  if (Object.keys(next).length) data[DIAGRAM_RULE_KEY] = { ...next }
  else delete data[DIAGRAM_RULE_KEY]
  return before !== snapshot()
}

function ruleForZone(d, zone) {
  return (zone && d.rules && d.rules[zone]) || null
}

// Deja los datos coherentes con el diagrama: los hijos del tema central con posición y con la
// regla de su zona; los demás temas, sin posición propia ni reglas. Devuelve si cambió algo.
function normalizeDiagramTopics(mindMap, pending) {
  const tree = mindMap.renderer.renderTree
  const d = diagramOf(mindMap)
  if (!tree || !d) return false
  let changed = false
  const children = tree.children || []
  children.forEach((child, i) => {
    const data = child.data
    if (!hasPosition(data)) {
      const p = placementFor(mindMap, d, children, i, pending)
      pending = null
      data.customLeft = p.x
      data.customTop = p.y
      changed = true
    }
    if (applyDiagramRule(data, ruleForZone(d, zoneOfTopic(mindMap, d, data)))) changed = true
  })
  const strip = node => (node.children || []).forEach(child => {
    const data = child.data
    if (data.customLeft !== undefined || data.customTop !== undefined) {
      delete data.customLeft
      delete data.customTop
      changed = true
    }
    if (data[DIAGRAM_RULE_KEY] && applyDiagramRule(data, null)) changed = true
    strip(child)
  })
  children.forEach(strip)
  return changed
}

// Mover temas del diagrama (arrastre): posición y reglas en una sola entrada del historial
function setDiagramPositions(mindMap, moves) {
  const d = diagramOf(mindMap)
  if (!d) return
  moves.forEach(({ node, x, y }) => {
    const data = node.nodeData.data
    data.customLeft = nonZero(x)
    data.customTop = nonZero(y)
    node.customLeft = data.customLeft
    node.customTop = data.customTop
  })
  normalizeDiagramTopics(mindMap)
  mindMap.render()
}

// Cambiar la definición del diagrama (rótulos, colores…) y volver a aplicar las reglas
function setDiagramDefinition(mindMap, change) {
  const tree = mindMap.renderer.renderTree
  const current = diagramOf(mindMap)
  if (!tree || !current) return
  const next = normalizeDiagram(change(JSON.parse(JSON.stringify(current))))
  if (!next) return
  tree.data[DIAGRAM_KEY] = next
  normalizeDiagramTopics(mindMap)
  mindMap.render()
}

const DIAGRAM_SKIP_COMMANDS = ['BACK', 'FORWARD', 'SET_NODE_ACTIVE', 'CLEAR_ACTIVE_NODE', 'SET_DIAGRAM_POSITIONS', 'SET_DIAGRAM']

// Conecta el diagrama a una instancia del mapa. editable: comandos, colocación y reglas.
function attachDiagram(mindMap, { editable = false, handlers = {} } = {}) {
  const refresh = () => {
    if (centerDiagramTitle(mindMap)) {
      mindMap.render()
      return
    }
    hideRootLines(mindMap)
    renderDiagramLayer(mindMap, editable ? handlers : {})
  }
  mindMap.on('node_tree_render_end', refresh)
  refresh()
  if (!editable) return
  // Un mapa que llega con temas sin posición (importado, editado a mano) se coloca al abrirlo
  if (normalizeDiagramTopics(mindMap)) mindMap.render()
  mindMap.command.add('SET_DIAGRAM_POSITIONS', moves => setDiagramPositions(mindMap, moves))
  mindMap.command.add('SET_DIAGRAM', change => setDiagramDefinition(mindMap, change))
  // Tras insertar, pegar, mover de nivel, limpiar formato…: colocar y aplicar reglas en el
  // mismo paso (el historial se guarda después, así queda una sola entrada)
  mindMap.on('afterExecCommand', name => {
    if (DIAGRAM_SKIP_COMMANDS.includes(name) || !diagramOf(mindMap)) return
    const pending = mindMap.__diagramPendingPoint
    mindMap.__diagramPendingPoint = null
    if (normalizeDiagramTopics(mindMap, pending)) mindMap.render()
  })
}

// Tema visible bajo un punto del lienzo, sin contar los que se arrastran ni sus descendientes
function diagramNodeAt(mindMap, x, y, exclude) {
  const isExcluded = node => {
    for (let n = node; n; n = n.parent) if (exclude.includes(n)) return true
    return false
  }
  let found = null
  const walk = node => {
    if (!node || isExcluded(node)) return
    if (x >= node.left && x <= node.left + node.width && y >= node.top && y <= node.top + node.height) found = node
    if (node.getData('expand') !== false) (node.children || []).forEach(walk)
  }
  walk(mindMap.renderer.root)
  return found
}

// Opción beforeDragEnd de la librería. En un diagrama la librería no sirve para decidir dónde
// cae un tema (calcula los huecos según el diseño automático), así que se decide aquí:
//  - sobre otro tema: pasa a ser su subtema;
//  - en un hueco: queda ahí como tema del diagrama (también un subtema que se saca de su rama);
//  - un subtema que se reordena entre sus hermanos: lo hace la librería, como en un mapa.
function diagramBeforeDragEnd(mindMap, { prevNodeUid, nextNodeUid, beingDragNodeList }) {
  if (!mindMap || !diagramOf(mindMap)) return false
  const list = beingDragNodeList || []
  const clone = mindMap.drag && mindMap.drag.clone
  if (!list.length || !clone) return false
  // La librería ya quitó el clon del lienzo, pero su transformación sigue siendo la posición
  // final (con varios temas el clon es un rectángulo: se mueven juntos, con el primero ahí)
  const first = list[0]
  const t = clone.transform()
  const dx = t.translateX - first.left
  const dy = t.translateY - first.top
  const target = diagramNodeAt(mindMap, t.translateX + first.width / 2, t.translateY + first.height / 2, list)
  const root = mindMap.renderer.root
  if (target && !target.isRoot) {
    mindMap.execCommand('MOVE_NODE_TO', list, target)
    return true
  }
  const allFree = list.every(n => n.parent && n.parent.isRoot)
  if (!allFree && (prevNodeUid || nextNodeUid)) return false
  const moves = list.map(node => ({ node, x: node.left + dx, y: node.top + dy }))
  if (!allFree) mindMap.execCommand('MOVE_NODE_TO', list.filter(n => !(n.parent && n.parent.isRoot)), root)
  mindMap.execCommand('SET_DIAGRAM_POSITIONS', moves)
  return true
}
