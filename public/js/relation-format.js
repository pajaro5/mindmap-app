// Formato de relaciones y límites (Formato › Relación y Límite). Lo comparten la app y el
// visor del HTML interactivo exportado.
//
// Relaciones: la librería ya guarda un estilo por relación en el tema de origen
// (data.associativeLineStyle[uid del destino]: color, grosor y trazo). Aquí se añade
// `arrows` (dónde van las flechas), que la librería no tiene: siempre pinta una al final.
// Límites: el estilo va en data.outerFrame de los temas que rodea (color, relleno, trazo,
// radio). Aquí se añade `shape: 'cloud'`, una forma de nube que la librería no tiene.

const RELATIONSHIP_WIDTHS = [
  { value: 1, label: 'Línea fina' },
  { value: 2, label: 'Línea normal' },
  { value: 4, label: 'Línea gruesa' }
]
// Trazos (stroke-dasharray). La librería pinta "6,4" si no hay ninguno
const DASH_STYLES = [
  { value: 'none', label: 'Continua' },
  { value: '6,4', label: 'Discontinua' },
  { value: '2,3', label: 'Punteada' }
]
const ARROW_STYLES = [
  { value: 'end', label: 'Flecha al final' },
  { value: 'both', label: 'Flechas en ambos lados' },
  { value: 'start', label: 'Flecha al principio' },
  { value: 'none', label: 'Sin flechas' }
]
const BOUNDARY_SHAPES = [
  { value: 'rect', label: 'Rectángulo' },
  { value: 'rounded', label: 'Redondeado' },
  { value: 'cloud', label: 'Nube' }
]
const ROUNDED_BOUNDARY_RADIUS = 14

// ---- Relaciones ----
// Estilo propio de la relación node → toNode (lo que guarda la librería más `arrows`)
function relationshipOwnStyle(node, toNode) {
  const all = node && node.getData('associativeLineStyle')
  const own = all && toNode && all[toNode.getData('uid')]
  return own && typeof own === 'object' ? own : {}
}

function relationshipArrows(node, toNode) {
  const arrows = relationshipOwnStyle(node, toNode).arrows
  return ARROW_STYLES.some(a => a.value === arrows) ? arrows : 'end'
}

// Valores efectivos de una relación, para la cinta
function describeRelationship(plugin, node, toNode) {
  const style = plugin.getStyleConfig(node, toNode)
  const dash = style.associativeLineDasharray || '6,4'
  return {
    color: style.associativeLineColor,
    width: Number(style.associativeLineWidth),
    dash: DASH_STYLES.some(d => d.value === dash) ? dash : '6,4',
    arrows: relationshipArrows(node, toNode)
  }
}

// Pone las flechas en el trazo de una relación. La librería crea un marcador por relación
// (orient="auto-start-reverse", así sirve también al principio) y lo pone al final.
function applyRelationshipArrows(path, arrows) {
  const el = path && path.node
  if (!el) return
  const marker = el.getAttribute('marker-end') || el.getAttribute('marker-start') || el.dataset.mmMarker
  if (!marker) return
  el.dataset.mmMarker = marker
  const set = (attr, on) => on ? el.setAttribute(attr, marker) : el.removeAttribute(attr)
  set('marker-end', arrows === 'end' || arrows === 'both')
  set('marker-start', arrows === 'start' || arrows === 'both')
}

// Nueva entrada del estilo de la relación node → toNode; `undefined` quita la propiedad
// (vuelve a la del tema). Devuelve el objeto completo associativeLineStyle del tema origen.
function nextRelationshipStyles(node, toNode, change) {
  const all = { ...(node.getData('associativeLineStyle') || {}) }
  const uid = toNode.getData('uid')
  const own = { ...(all[uid] || {}), ...change }
  Object.keys(own).forEach(key => { if (own[key] === undefined || own[key] === null) delete own[key] })
  if (Object.keys(own).length) all[uid] = own
  else delete all[uid]
  return all
}

// ---- Límites ----
// Contorno de nube que rodea el rectángulo (x, y, w, h): arcos hacia fuera en cada lado
function cloudPath(x, y, w, h) {
  const bumps = (length, size) => Math.max(2, Math.round(length / size))
  const nx = bumps(w, 26)
  const ny = bumps(h, 26)
  const sx = w / nx
  const sy = h / ny
  const r = n => Math.round(n * 100) / 100
  let d = `M${r(x)} ${r(y)}`
  for (let i = 0; i < nx; i++) d += `a${r(sx / 2)} ${r(sx / 3)} 0 0 1 ${r(sx)} 0`
  for (let i = 0; i < ny; i++) d += `a${r(sy / 3)} ${r(sy / 2)} 0 0 1 0 ${r(sy)}`
  for (let i = 0; i < nx; i++) d += `a${r(sx / 2)} ${r(sx / 3)} 0 0 1 ${r(-sx)} 0`
  for (let i = 0; i < ny; i++) d += `a${r(sy / 3)} ${r(sy / 2)} 0 0 1 0 ${r(-sy)}`
  return d + 'z'
}

function boundaryShapeOf(style) {
  if (style.shape === 'cloud') return 'cloud'
  return Number(style.radius) > 0 ? 'rounded' : 'rect'
}

// Cambio de datos de un límite para una forma de la cinta
function boundaryShapeChange(shape) {
  if (shape === 'cloud') return { shape: 'cloud' }
  return { shape: undefined, radius: shape === 'rounded' ? ROUNDED_BOUNDARY_RADIUS : 0 }
}

function describeBoundary(plugin, node) {
  const style = plugin.getStyle(node)
  const dash = style.strokeDasharray || 'none'
  return {
    color: style.strokeColor,
    fill: style.fill,
    shape: boundaryShapeOf(style),
    dash: DASH_STYLES.some(d => d.value === dash) ? dash : '6,4'
  }
}

// ---- Parches sobre los plugins (una vez, antes de crear ningún mapa) ----
function patchRelationFormat(MindMap) {
  const plugin = name => (MindMap.pluginList || []).find(p => p.instanceName === name)

  const AssociativeLine = plugin('associativeLine')
  if (AssociativeLine && !AssociativeLine.prototype.__mmArrows) {
    const drawLine = AssociativeLine.prototype.drawLine
    AssociativeLine.prototype.drawLine = function (startPoint, endPoint, node, toNode) {
      const result = drawLine.apply(this, arguments)
      const entry = this.lineList[this.lineList.length - 1]
      if (entry) applyRelationshipArrows(entry[0], relationshipArrows(node, toNode))
      return result
    }
    AssociativeLine.prototype.__mmArrows = true
  }

  const OuterFrame = plugin('outerFrame')
  if (OuterFrame && !OuterFrame.prototype.__mmShapes) {
    const proto = OuterFrame.prototype
    const createEl = proto.createOuterFrameEl
    const styleEl = proto.styleOuterFrame
    proto.createOuterFrameEl = function (x, y, width, height, style = {}) {
      if (style.shape !== 'cloud') return createEl.apply(this, arguments)
      const el = this.draw.path(cloudPath(x, y, width, height))
      this.styleOuterFrame(el, style)
      el.cacheStyle = { dasharray: style.strokeDasharray }
      this.outerFrameElList.push(el)
      return el
    }
    // Un trazo (nube) no tiene radio
    proto.styleOuterFrame = function (el, style) {
      if (typeof el.radius === 'function') return styleEl.apply(this, arguments)
      el.stroke({ width: style.strokeWidth, color: style.strokeColor, dasharray: style.strokeDasharray }).fill({ color: style.fill })
    }
    proto.__mmShapes = true
  }
}

// Por instancia (la app): cada límite recuerda a qué temas rodea, para volver a
// seleccionarlo después de repintarlo. createText se enlaza en el constructor del plugin,
// así que se envuelve sobre la instancia y no sobre el prototipo.
function installRelationFormat(mindMap) {
  const plugin = mindMap && mindMap.outerFrame
  if (!plugin || plugin.__mmOwners) return
  const createText = plugin.createText
  plugin.createText = function (el, node, range) {
    const text = createText.apply(this, arguments)
    el.mmOwner = { node, range, text }
    return text
  }
  plugin.__mmOwners = true
}
