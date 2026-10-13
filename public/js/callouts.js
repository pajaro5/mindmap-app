// Llamadas (callouts) de MindManager: notas flotantes ancladas a un tema, con un conector.
//
// Modelo: node.data._callouts = [{ id, text, dx, dy }]
//   dx, dy  desplazamiento de la esquina inferior izquierda del globo respecto a la esquina
//           superior derecha del tema (coordenadas del mapa, sin zoom)
//   Con "_" delante: simple-mind-map trata como estilo cualquier campo que no conozca.
// Las llamadas no forman parte del diseño del mapa (flotan, como en MindManager): se pintan
// en una capa propia dentro del lienzo, que se redibuja tras cada render, así acompañan al
// zoom y al desplazamiento y salen en las exportaciones.

const CALLOUTS_KEY = '_callouts'
const CALLOUT_MAX_PER_TOPIC = 10
const CALLOUT_MAX_TEXT = 500
const CALLOUT_MAX_OFFSET = 3000
const CALLOUT_DEFAULT_OFFSET = { dx: 24, dy: -14 }
const CALLOUT_WRAP_CHARS = 28
const CALLOUT_STYLE = {
  fill: '#fff8d6', stroke: '#c99a00', activeStroke: '#3d8fd8', text: '#3b2f00',
  fontSize: 12, lineHeight: 16, padX: 10, padY: 7, radius: 6
}

const clampOffset = v => Math.max(-CALLOUT_MAX_OFFSET, Math.min(CALLOUT_MAX_OFFSET, Math.round(v)))

function cleanCalloutText(text) {
  if (typeof text !== 'string') return ''
  return text.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').trim().slice(0, CALLOUT_MAX_TEXT)
}

// Lista limpia de llamadas de un tema, o undefined si no queda ninguna
function normalizeCallouts(list) {
  if (!Array.isArray(list)) return undefined
  const seen = new Set()
  const result = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const text = cleanCalloutText(item.text)
    if (!text) continue
    let id = typeof item.id === 'string' && /^[\w-]{1,64}$/.test(item.id) ? item.id : crypto.randomUUID()
    if (seen.has(id)) id = crypto.randomUUID()
    seen.add(id)
    const dx = Number.isFinite(item.dx) ? clampOffset(item.dx) : CALLOUT_DEFAULT_OFFSET.dx
    const dy = Number.isFinite(item.dy) ? clampOffset(item.dy) : CALLOUT_DEFAULT_OFFSET.dy
    result.push({ id, text, dx, dy })
    if (result.length >= CALLOUT_MAX_PER_TOPIC) break
  }
  return result.length ? result : undefined
}

// Ajuste de línea aproximado por número de caracteres (el texto se pinta en SVG, que no
// hace ajuste automático); respeta los saltos de línea del usuario
function wrapCalloutText(text, width = CALLOUT_WRAP_CHARS) {
  return cleanCalloutText(text).split('\n').flatMap(paragraph => {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (!words.length) return ['']
    const lines = []
    let line = ''
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (candidate.length > width && line) {
        lines.push(line)
        line = word
      } else {
        line = candidate
      }
      while (line.length > width * 1.5) {   // palabras larguísimas: se cortan
        lines.push(line.slice(0, width))
        line = line.slice(width)
      }
    }
    lines.push(line)
    return lines
  })
}

// Punto del borde de un rectángulo más cercano a (px, py)
function nearestPointOnRect(rect, px, py) {
  return {
    x: Math.max(rect.x, Math.min(px, rect.x + rect.width)),
    y: Math.max(rect.y, Math.min(py, rect.y + rect.height))
  }
}

// ---- Capa de dibujo ----
// `handlers`: { isActive(uid, id), onPointerDown(event, node, callout, group), onDoubleClick(node, callout) }
function renderCallouts(mindMap, handlers) {
  const draw = mindMap.draw
  if (!draw) return
  let layer = mindMap.__calloutLayer
  const fresh = !layer || !layer.node.isConnected
  if (fresh) {
    layer = draw.group().addClass('smm-callouts')
    mindMap.__calloutLayer = layer
  }
  const items = []
  visibleNodes(mindMap).forEach(node => {
    const callouts = normalizeCallouts(node.getData(CALLOUTS_KEY))
    if (callouts) callouts.forEach(callout => items.push({ node, callout }))
  })
  layer.front()
  // Solo se reconstruye si cambió algo (texto, posición o geometría del tema): rehacer los
  // globos en cada render cambiaría el elemento bajo el ratón y rompería el doble clic
  const signature = JSON.stringify(items.map(({ node, callout }) =>
    [node.uid, node.left, node.top, node.width, node.height, callout]))
  if (!fresh && signature === mindMap.__calloutSignature) {
    highlightCallouts(mindMap, handlers.isActive)
    return
  }
  mindMap.__calloutSignature = signature
  layer.clear()
  items.forEach(({ node, callout }) => drawCallout(layer, node, callout, handlers))
}

function drawCallout(layer, node, callout, handlers) {
  const s = CALLOUT_STYLE
  const lines = wrapCalloutText(callout.text)
  const g = layer.group().addClass('smm-callout')
    .attr({ 'data-callout-id': callout.id, 'data-node-uid': node.uid, cursor: 'move' })
  const text = g.text(add => lines.forEach(l => add.tspan(l || ' ').newLine()))
    .font({ size: s.fontSize, family: 'Segoe UI, Tahoma, Arial, sans-serif', leading: s.lineHeight / s.fontSize })
    .fill(s.text)
  const box = text.bbox()
  const width = Math.ceil(box.width) + s.padX * 2
  const height = lines.length * s.lineHeight + s.padY * 2
  const x = node.left + node.width + callout.dx
  const y = node.top + callout.dy - height
  const active = handlers.isActive(node.uid, callout.id)

  // Conector: del centro del globo al borde del tema
  const cx = x + width / 2
  const cy = y + height / 2
  const p = nearestPointOnRect({ x: node.left, y: node.top, width: node.width, height: node.height }, cx, cy)
  g.line(cx, cy, p.x, p.y).stroke({ color: s.stroke, width: 1.5, dasharray: '4,3' })
  g.circle(6).center(p.x, p.y).fill(s.stroke)
  g.rect(width, height).move(x, y).radius(s.radius).fill(s.fill).addClass('smm-callout-box')
  text.front().move(x + s.padX, y + s.padY)
  setCalloutHighlight(g, active)

  // Los eventos no deben llegar al lienzo: desplazaría el mapa o quitaría la selección
  g.on('mousedown', e => {
    e.stopPropagation()
    handlers.onPointerDown(e, node, callout, g)
  })
  g.on('click', e => e.stopPropagation())
  g.on('dblclick', e => {
    e.stopPropagation()
    handlers.onDoubleClick(node, callout)
  })
}

function setCalloutHighlight(g, active) {
  const s = CALLOUT_STYLE
  const box = g.findOne('.smm-callout-box')
  if (box) box.stroke({ color: active ? s.activeStroke : s.stroke, width: active ? 2 : 1 })
  if (active) g.addClass('active')
  else g.removeClass('active')
}

// Cambia solo el resaltado, sin volver a crear los globos: si se recrearan al hacer clic, el
// elemento bajo el ratón cambiaría y el navegador no dispararía el doble clic
function highlightCallouts(mindMap, isActive) {
  const layer = mindMap.__calloutLayer
  if (!layer || !layer.node.isConnected) return
  layer.find('.smm-callout').forEach(g => {
    setCalloutHighlight(g, isActive(g.attr('data-node-uid'), g.attr('data-callout-id')))
  })
}

// ---- Cambios (comando SET_CALLOUTS: una entrada de historial aunque sean varios temas) ----
// `change(list, node)` recibe la lista actual de cada tema y devuelve la nueva
function setCallouts(mindMap, uids, change) {
  const renderer = mindMap.renderer
  ;[].concat(uids).forEach(uid => {
    const node = renderer.findNodeByUid(uid)
    if (!node) return
    const next = normalizeCallouts(change(normalizeCallouts(node.getData(CALLOUTS_KEY)) || [], node))
    renderer.setNodeData(node, { [CALLOUTS_KEY]: next })
  })
  // Las llamadas no cambian el tamaño del tema: basta con redibujar la capa
  mindMap.emit('node_tree_render_end')
}

// Posición de una llamada nueva: escalonada hacia arriba si el tema ya tiene otras
function newCalloutOffset(existing) {
  return { dx: CALLOUT_DEFAULT_OFFSET.dx, dy: CALLOUT_DEFAULT_OFFSET.dy - 44 * existing.length }
}
