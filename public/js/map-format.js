// Formato del mapa (pestaña Formato): tema visual, ramas, espaciado, fondo y sombras.
// Lo comparten la app y el visor del HTML interactivo exportado.
//
// Fuente de verdad: root.data._mapFormat. Al vivir en el árbol entra en el historial
// (Deshacer/Rehacer), se guarda con el mapa, viaja en las plantillas y llega al HTML
// exportado. La librería no guarda en el historial ni setTheme ni setThemeConfig, así que
// aquí nunca se llaman: antes de cada render (installMapFormat) las opciones de tema de la
// librería se derivan de _mapFormat. Deshacer devuelve así también el aspecto del mapa.
//
// Formato guardado (todo opcional; lo que falta es "lo que diga el tema"):
//   { theme, lineStyle, lineWidth, lineColor, rainbow, spacing, background, shadow,
//     backgroundImage, backgroundFit }
// backgroundImage es un archivo del mapa (/api/files/…) y backgroundFit, cómo se ajusta
// ('cover' por defecto, 'repeat' o 'center'). La imagen es del mapa, no del tema: cambiar de
// tema la conserva y los temas propios no la guardan.

const MAP_FORMAT_KEY = '_mapFormat'
// Valor del render de la librería que obliga a volver a pintar los estilos de todos los temas
const CHANGE_THEME_SOURCE = 'changeTheme'

// Forma de las ramas (valores de lineStyle de la librería)
const LINE_STYLES = [
  { value: 'curve', label: 'Ramas curvas' },
  { value: 'straight', label: 'Ramas en ángulo' },
  { value: 'direct', label: 'Ramas rectas' }
]
// Grosor de las ramas: factor sobre el grosor del tema
const LINE_WIDTHS = [
  { value: 'thin', label: 'Ramas finas', factor: 0.5 },
  { value: 'normal', label: 'Ramas normales', factor: 1 },
  { value: 'thick', label: 'Ramas gruesas', factor: 2 }
]
// Separación entre temas: factor sobre los márgenes del tema
const SPACINGS = [
  { value: 'compact', label: 'Espaciado compacto', factor: 0.6 },
  { value: 'normal', label: 'Espaciado normal', factor: 1 },
  { value: 'wide', label: 'Espaciado amplio', factor: 1.5 }
]
// Márgenes de la librería para los niveles que un tema no defina
const LIBRARY_MARGINS = { second: { marginX: 100, marginY: 40 }, node: { marginX: 50, marginY: 0 } }
const SHADOW_LEVELS = ['root', 'second', 'node', 'generalization']

// ---- Temas visuales ----
// Cada tema parte del predeterminado (theme.js) y cambia colores y detalles
function deriveTheme(overrides) {
  const base = JSON.parse(JSON.stringify(MINDMANAGER_THEME))
  for (const [key, value] of Object.entries(overrides)) {
    base[key] = value && typeof value === 'object' && !Array.isArray(value) ? { ...base[key], ...value } : value
  }
  return base
}

// Relleno plano (sin el degradado del tema predeterminado)
const flatFill = (fillColor, color, borderColor = fillColor) => ({ gradientStyle: false, fillColor, color, borderColor })

const MAP_THEMES = [
  { id: THEME_NAME, label: 'Predeterminado', config: MINDMANAGER_THEME },
  { id: 'mm-relief', label: 'Relieve', config: deriveTheme({ root: { shadow: true }, second: { shadow: true } }) },
  {
    id: 'mm-professional', label: 'Profesional',
    config: deriveTheme({
      lineColor: '#8497b0',
      root: { ...flatFill('#1f3864', '#ffffff'), borderRadius: 6 },
      second: { ...flatFill('#dae3f3', '#1f3864', '#8faadc'), borderRadius: 4 },
      node: { color: '#263238', fontWeight: 'normal' }
    })
  },
  {
    id: 'mm-night', label: 'Noche',
    config: deriveTheme({
      backgroundColor: '#1e2530',
      lineColor: '#5f7088',
      generalizationLineColor: '#5f7088',
      // Las relaciones son casi negras en los demás temas: no se verían sobre el fondo oscuro
      associativeLineColor: '#c9d4e3',
      associativeLineTextColor: '#e6edf5',
      root: flatFill('#f2a33a', '#1e2530'),
      second: flatFill('#34465e', '#ffffff', '#5f7088'),
      node: { color: '#d8e0ea' },
      generalization: { fillColor: '#34465e', color: '#ffffff', borderColor: '#5f7088' }
    })
  },
  {
    id: 'mm-pastel', label: 'Pastel',
    config: deriveTheme({
      backgroundColor: '#fffdf8',
      lineColor: '#d9c9bd',
      root: flatFill('#f4b6b6', '#5b3a3a', '#e39b9b'),
      second: { ...flatFill('#cfe8d0', '#35523a', '#a9d1ab'), borderRadius: 14 },
      node: { color: '#5a5a5a', fontWeight: 'normal' }
    })
  },
  {
    id: 'mm-sunset', label: 'Atardecer',
    config: deriveTheme({
      backgroundColor: '#fffaf4',
      lineColor: '#f0b27a',
      root: { startColor: '#ff9a3c', endColor: '#d9480f', fillColor: '#e8590c', borderColor: '#b23c0a' },
      second: flatFill('#ffe0b8', '#7a3b00', '#f0a35e'),
      node: { color: '#5c3410' }
    })
  },
  {
    id: 'mm-forest', label: 'Bosque',
    config: deriveTheme({
      backgroundColor: '#f6fbf4',
      lineColor: '#8fbf8a',
      root: flatFill('#2e6b34', '#ffffff', '#24552a'),
      second: flatFill('#d4ead0', '#1f4d24', '#7fb77a'),
      node: { color: '#2b3a2c' }
    })
  },
  {
    id: 'mm-violet', label: 'Violeta',
    config: deriveTheme({
      lineColor: '#b39ddb',
      root: { startColor: '#8e6ad8', endColor: '#5126a8', fillColor: '#6a3fc1', borderColor: '#46208f' },
      second: flatFill('#ede7f6', '#4527a0', '#9e86d6'),
      node: { color: '#3b2e58' }
    })
  },
  {
    id: 'mm-mono', label: 'Monocromo',
    config: deriveTheme({
      lineColor: '#444444',
      lineStyle: 'straight',
      root: { ...flatFill('#222222', '#ffffff'), borderRadius: 4 },
      second: { ...flatFill('#ffffff', '#222222', '#222222'), borderWidth: 1.5, borderRadius: 4 },
      node: { color: '#222222', fontWeight: 'normal' }
    })
  },
  {
    id: 'mm-minimal', label: 'Minimalista',
    config: deriveTheme({
      lineColor: '#b5b5b5',
      lineStyle: 'direct',
      root: { ...flatFill('#ffffff', '#333333', '#333333'), borderWidth: 2, borderRadius: 4 },
      second: { ...flatFill('transparent', '#333333', 'transparent'), borderWidth: 0 },
      node: { color: '#555555', fontWeight: 'normal' }
    })
  }
]

const mapThemeById = id => MAP_THEMES.find(t => t.id === id) || null

// Registra los temas en la librería (desde setupMindMapLibrary)
function defineMapThemes(MindMapCtor) {
  MAP_THEMES.forEach(theme => MindMapCtor.defineTheme(theme.id, theme.config))
}

// ---- Normalización ----
// isHexColor está en markers.js
const oneOf = (list, value) => list.some(o => o.value === value) ? value : null

// Formato completo y válido a partir de lo guardado (puede venir de fuera de la app).
// `base`: formato de partida si no hay nada guardado (mapas anteriores a esta fase).
function normalizeMapFormat(raw, base = null) {
  const src = { ...(base || {}), ...(raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) }
  const lineWidth = oneOf(LINE_WIDTHS, src.lineWidth)
  const spacing = oneOf(SPACINGS, src.spacing)
  return {
    theme: mapThemeById(src.theme) ? src.theme : THEME_NAME,
    lineStyle: oneOf(LINE_STYLES, src.lineStyle),
    lineWidth: lineWidth === 'normal' ? null : lineWidth,
    lineColor: isHexColor(src.lineColor) ? src.lineColor.toLowerCase() : null,
    rainbow: src.rainbow === true,
    spacing: spacing === 'normal' ? null : spacing,
    background: isHexColor(src.background) ? src.background.toLowerCase() : null,
    shadow: typeof src.shadow === 'boolean' ? src.shadow : null,
    // Solo un archivo de la app: una dirección externa cargaría contenido de fuera
    backgroundImage: isAttachmentUrl(src.backgroundImage) ? src.backgroundImage : null,
    backgroundFit: isAttachmentUrl(src.backgroundImage) && BACKGROUND_FITS.includes(src.backgroundFit) && src.backgroundFit !== 'cover' ? src.backgroundFit : null
  }
}

// Ajuste de la imagen de fondo → estilos CSS que aplica la librería al contenedor del mapa
const BACKGROUND_FITS = ['cover', 'repeat', 'center']
const BACKGROUND_FIT_STYLES = {
  cover: { backgroundSize: 'cover', backgroundRepeat: 'no-repeat' },
  repeat: { backgroundSize: 'auto', backgroundRepeat: 'repeat' },
  center: { backgroundSize: 'auto', backgroundRepeat: 'no-repeat' }
}

// Lo que un tema propio guarda del formato: todo menos la imagen de fondo (es del mapa)
function themeFormatOf(format) {
  const out = compactMapFormat(normalizeMapFormat(format))
  delete out.backgroundImage
  delete out.backgroundFit
  return out
}

// Lo que se guarda: solo lo que se aparta del tema
function compactMapFormat(format) {
  const out = { theme: format.theme }
  for (const [key, value] of Object.entries(format)) {
    if (key !== 'theme' && value !== null && value !== false) out[key] = value
  }
  if (format.shadow === false) out.shadow = false
  return out
}

// Formato vigente de un mapa de la librería
function currentMapFormat(mindMap) {
  const tree = mindMap && mindMap.renderer && mindMap.renderer.renderTree
  const state = mindMap && mindMap.__mmMapFormat
  return normalizeMapFormat(tree && tree.data && tree.data[MAP_FORMAT_KEY], state ? state.base : null)
}

// ---- Del formato a las opciones de la librería ----
const factorOf = (list, value) => (list.find(o => o.value === value) || { factor: 1 }).factor
const themeShadow = config => SHADOW_LEVELS.some(level => !!(config[level] && config[level].shadow))

// themeConfig (personalización sobre el tema) para el formato
function mapFormatThemeConfig(format) {
  const theme = (mapThemeById(format.theme) || MAP_THEMES[0]).config
  const config = {}
  const level = name => (config[name] = config[name] || {})
  if (format.lineStyle) config.lineStyle = format.lineStyle
  if (format.lineColor) config.lineColor = format.lineColor
  if (format.background) config.backgroundColor = format.background
  if (format.backgroundImage) {
    config.backgroundImage = format.backgroundImage
    config.backgroundPosition = 'center center'
    Object.assign(config, BACKGROUND_FIT_STYLES[format.backgroundFit || 'cover'])
  }

  const width = factorOf(LINE_WIDTHS, format.lineWidth)
  if (width !== 1) {
    const scaled = value => Math.max(0.5, Math.round((Number(value) || 1) * width * 2) / 2)
    config.lineWidth = scaled(theme.lineWidth)
    for (const name of ['root', 'second', 'node']) {
      level(name).lineWidth = scaled((theme[name] && theme[name].lineWidth) || theme.lineWidth)
    }
  }

  const spacing = factorOf(SPACINGS, format.spacing)
  if (spacing !== 1) {
    for (const name of ['second', 'node']) {
      const own = theme[name] || {}
      for (const prop of ['marginX', 'marginY']) {
        const value = own[prop] !== undefined ? own[prop] : LIBRARY_MARGINS[name][prop]
        level(name)[prop] = Math.round(value * spacing)
      }
    }
  }

  if (format.shadow !== null) SHADOW_LEVELS.forEach(name => { level(name).shadow = format.shadow })
  return config
}

// Opciones del constructor de la librería para unos datos guardados
function mapFormatOptions(rootData, savedTheme) {
  const format = normalizeMapFormat(rootData && rootData[MAP_FORMAT_KEY], legacyMapFormat(savedTheme))
  return {
    theme: format.theme,
    themeConfig: mapFormatThemeConfig(format),
    rainbowLinesConfig: { open: format.rainbow, colorsList: [] },
    // Color de rama como en MindManager: el color de línea de un tema (p. ej. el de un tema
    // principal importado de un .mmap) lo heredan las líneas de todos sus subtemas
    enableInheritAncestorLineStyle: true
  }
}

// Mapas anteriores a esta fase: solo tenían el nombre del tema
function legacyMapFormat(savedTheme) {
  return { theme: themeTemplateOf(savedTheme) }
}

// Lo que muestra la cinta: los valores efectivos (los del formato o, si no, los del tema)
function describeMapFormat(mindMap) {
  const format = currentMapFormat(mindMap)
  const theme = (mapThemeById(format.theme) || MAP_THEMES[0]).config
  return {
    format,
    theme: format.theme,
    lineStyle: format.lineStyle || theme.lineStyle || 'straight',
    lineWidth: format.lineWidth || 'normal',
    lineColor: format.lineColor || theme.lineColor,
    rainbow: format.rainbow,
    spacing: format.spacing || 'normal',
    background: format.background || theme.backgroundColor,
    shadow: format.shadow !== null ? format.shadow : themeShadow(theme),
    backgroundImage: format.backgroundImage,
    backgroundFit: format.backgroundImage ? (format.backgroundFit || 'cover') : null,
    // Hay algo que "Restablecer" devolvería al tema (la imagen de fondo no: es del mapa)
    customized: Object.keys(themeFormatOf(format)).length > 1
  }
}

// ---- Equilibrar el mapa (diseño radial) ----
// En el diseño radial cada rama principal va a la derecha o a la izquierda según su dato `dir`
// o, si no lo tiene, en el sentido de las agujas del reloj (clockwise.js). Equilibrar = elegir
// el lado de cada rama para que los dos pesen (nº de temas) lo más parecido posible, con
// ceil(n/2) ramas a la derecha. Devuelve un lado por rama. Exacto hasta 20 ramas; con más, voraz.
const BALANCE_EXACT_MAX = 20
function balancedSides(weights) {
  const n = weights.length
  const k = Math.ceil(n / 2)
  const total = weights.reduce((a, b) => a + b, 0)
  const right = new Set()
  if (n <= BALANCE_EXACT_MAX) {
    // Todas las formas de elegir k ramas (máscaras de bits); gana la de menor diferencia
    let best = Infinity
    let bestMask = 0
    for (let mask = 0; mask < 1 << n; mask++) {
      let count = 0
      let sum = 0
      for (let i = 0; i < n; i++) if (mask & (1 << i)) { count++; sum += weights[i] }
      if (count === k && Math.abs(total - 2 * sum) < best) { best = Math.abs(total - 2 * sum); bestMask = mask }
    }
    for (let i = 0; i < n; i++) if (bestMask & (1 << i)) right.add(i)
  } else {
    // Voraz: de mayor a menor peso, al lado que pese menos y aún admita ramas
    const sums = [0, 0]
    const counts = [0, 0]
    const caps = [k, n - k]
    weights.map((w, i) => [w, i]).sort((a, b) => b[0] - a[0]).forEach(([w, i]) => {
      const side = counts[0] < caps[0] && (sums[0] <= sums[1] || counts[1] >= caps[1]) ? 0 : 1
      sums[side] += w
      counts[side]++
      if (side === 0) right.add(i)
    })
  }
  return weights.map((_, i) => right.has(i) ? 'right' : 'left')
}

// Orden de las ramas una vez elegidos los lados: primero las de la derecha y luego las de la
// izquierda, cada grupo en su orden de antes, para que el orden se siga leyendo como el reloj
function balancedOrder(sides) {
  const indexes = sides.map((_, i) => i)
  return [...indexes.filter(i => sides[i] === 'right'), ...indexes.filter(i => sides[i] === 'left')]
}

// Comando BALANCE_MAP: pone `dir` a cada rama principal y las ordena (una entrada de
// historial). `dir` es un dato de la librería, no un estilo: Quitar formato no lo borra
function balanceMap(mindMap) {
  const tree = mindMap.renderer.renderTree
  const children = (tree && tree.children) || []
  if (children.length < 2) return
  const weight = node => 1 + (node.children || []).reduce((sum, child) => sum + weight(child), 0)
  const sides = balancedSides(children.map(weight))
  sides.forEach((side, i) => { children[i].data.dir = side })
  tree.children = balancedOrder(sides).map(i => children[i])
  mindMap.render()
}

// ---- Aplicar ----
// Antes de cada render se copian a la librería las opciones derivadas de _mapFormat; si el
// formato cambió (un comando, Deshacer, Rehacer) el render repinta los estilos de todos los
// temas. Tras cada render se pintan las sombras.
function installMapFormat(mindMap, savedTheme) {
  if (!mindMap || mindMap.__mmMapFormat) return
  const state = { base: legacyMapFormat(savedTheme), key: null }
  mindMap.__mmMapFormat = state
  // El constructor ya recibió las opciones de este formato (mapFormatOptions)
  state.key = JSON.stringify(currentMapFormat(mindMap))
  const render = mindMap.render
  mindMap.render = function (callback, source) {
    const changed = syncMapFormatOptions(this)
    return render.call(this, callback, changed ? CHANGE_THEME_SOURCE : source)
  }
  mindMap.on('node_tree_render_end', () => applyTopicShadows(mindMap))
  applyTopicShadows(mindMap)
}

function syncMapFormatOptions(mindMap) {
  const state = mindMap.__mmMapFormat
  const format = currentMapFormat(mindMap)
  const key = JSON.stringify(format)
  if (key === state.key) return false
  state.key = key
  mindMap.opt.theme = format.theme
  mindMap.opt.themeConfig = mapFormatThemeConfig(format)
  mindMap.opt.rainbowLinesConfig = { open: format.rainbow, colorsList: [] }
  return true
}

// Comando SET_MAP_FORMAT: guarda el formato en el tema central y repinta (una entrada de
// historial). `format` es el formato completo nuevo.
function setMapFormat(mindMap, format) {
  const renderer = mindMap.renderer
  if (!renderer.root) return
  renderer.setNodeData(renderer.root, { [MAP_FORMAT_KEY]: compactMapFormat(normalizeMapFormat(format)) })
  mindMap.render()
}

// ---- Sombras ----
// La librería no tiene sombra de tema: es la propiedad de estilo `shadow` (en un tema o en
// un nivel del tema visual) y se pinta con un filtro SVG sobre la forma del tema. Al ser
// estilo, "Copiar formato" la copia y "Quitar formato" la quita. El filtro va en el <defs>
// del SVG del mapa, que la librería copia al exportar a PNG, SVG y PDF.
const SHADOW_FILTER_ID = 'mm-topic-shadow'
const SVG_NS = 'http://www.w3.org/2000/svg'

function ensureShadowFilter(mindMap) {
  const svg = mindMap.svg && mindMap.svg.node
  if (!svg || svg.querySelector(`#${SHADOW_FILTER_ID}`)) return
  let defs = svg.querySelector(':scope > defs')
  if (!defs) defs = svg.insertBefore(document.createElementNS(SVG_NS, 'defs'), svg.firstChild)
  const filter = document.createElementNS(SVG_NS, 'filter')
  filter.setAttribute('id', SHADOW_FILTER_ID)
  for (const [k, v] of Object.entries({ x: '-20%', y: '-20%', width: '150%', height: '170%' })) filter.setAttribute(k, v)
  const drop = document.createElementNS(SVG_NS, 'feDropShadow')
  for (const [k, v] of Object.entries({ dx: '2', dy: '3', stdDeviation: '2.5', 'flood-color': '#000000', 'flood-opacity': '0.3' })) drop.setAttribute(k, v)
  filter.appendChild(drop)
  defs.appendChild(filter)
}

function applyTopicShadows(mindMap) {
  const root = mindMap.renderer && mindMap.renderer.root
  if (!root) return
  ensureShadowFilter(mindMap)
  const walk = node => {
    if (!node) return
    const shape = node.shapeNode && node.shapeNode.node
    if (shape) {
      const on = !!node.style.merge('shadow')
      if (on && !shape.hasAttribute('filter')) shape.setAttribute('filter', `url(#${SHADOW_FILTER_ID})`)
      else if (!on && shape.hasAttribute('filter')) shape.removeAttribute('filter')
    }
    ;(node.children || []).forEach(walk)
  }
  walk(root)
}

// ---- Vistas previas de la galería de temas ----
function mapThemePreview(config) {
  const fillOf = level => {
    const c = config[level] || {}
    if (c.gradientStyle) return c.endColor || c.fillColor
    return c.fillColor && c.fillColor !== 'transparent' ? c.fillColor : 'none'
  }
  const strokeOf = level => {
    const c = config[level] || {}
    return Number(c.borderWidth) > 0 && c.borderColor && c.borderColor !== 'transparent' ? c.borderColor : 'none'
  }
  const shadow = themeShadow(config)
  const box = (x, y, w, h, level, rx) => {
    const fill = fillOf(level)
    const stroke = strokeOf(level)
    const under = shadow && fill !== 'none' ? `<rect x="${x + 1.5}" y="${y + 2}" width="${w}" height="${h}" rx="${rx}" fill="rgba(0,0,0,.25)"/>` : ''
    const text = fill === 'none' && stroke === 'none'
      ? `<rect x="${x + 2}" y="${y + h / 2 - 1}" width="${w - 4}" height="2" fill="${(config[level] || {}).color || '#333'}"/>`
      : ''
    return `${under}<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}"/>${text}`
  }
  const line = config.lineColor || '#999'
  const style = config.lineStyle || 'straight'
  const branch = (x2, y2) => style === 'curve'
    ? `M28 20C34 20 34 ${y2} ${x2} ${y2}`
    : style === 'direct' ? `M28 20L${x2} ${y2}` : `M28 20H34V${y2}H${x2}`
  const ends = [[40, 8], [40, 32]]
  const lines = ends.map(([x, y]) => branch(x, y)).join('') + 'M20 20C14 20 14 8 9 8M20 20C14 20 14 32 9 32'
  return `<svg viewBox="0 0 56 40" aria-hidden="true">
<rect x=".5" y=".5" width="55" height="39" rx="2" fill="${config.backgroundColor || '#fff'}" stroke="#c9d3df"/>
<path d="${lines}" fill="none" stroke="${line}" stroke-width="1.5"/>
${box(16, 15, 16, 10, 'root', 2.5)}${box(40, 4, 13, 8, 'second', 2)}${box(40, 28, 13, 8, 'second', 2)}${box(2, 4, 9, 8, 'second', 2)}${box(2, 28, 9, 8, 'second', 2)}
</svg>`
}
