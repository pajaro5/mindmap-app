// Fase 16 · Pruebas pairwise (t=2) del formato del mapa: cada par de valores de dos
// parámetros cualesquiera (tema × diseño, grosor × espaciado, sombras × ramas de colores…)
// se prueba al menos una vez. El oráculo (valores esperados) está escrito aquí a mano a
// partir de la definición de los temas, sin usar las funciones de la app.
const { test, expect, setupMap } = require('./fixtures')
const { pairwise, missingPairs, chunk } = require('./pairwise')

// Lo que define cada tema y se puede comprobar
const THEMES = {
  'mindmanager': { bg: '#ffffff', line: '#b9b9b9', lineStyle: 'curve', shadow: false },
  'mm-relief': { bg: '#ffffff', line: '#b9b9b9', lineStyle: 'curve', shadow: true },
  'mm-professional': { bg: '#ffffff', line: '#8497b0', lineStyle: 'curve', shadow: false },
  'mm-night': { bg: '#1e2530', line: '#5f7088', lineStyle: 'curve', shadow: false },
  'mm-pastel': { bg: '#fffdf8', line: '#d9c9bd', lineStyle: 'curve', shadow: false },
  'mm-sunset': { bg: '#fffaf4', line: '#f0b27a', lineStyle: 'curve', shadow: false },
  'mm-forest': { bg: '#f6fbf4', line: '#8fbf8a', lineStyle: 'curve', shadow: false },
  'mm-violet': { bg: '#ffffff', line: '#b39ddb', lineStyle: 'curve', shadow: false },
  'mm-mono': { bg: '#ffffff', line: '#444444', lineStyle: 'straight', shadow: false },
  'mm-minimal': { bg: '#ffffff', line: '#b5b5b5', lineStyle: 'direct', shadow: false }
}
// Todos los temas heredan los márgenes y grosores del predeterminado
const SECOND = { marginX: 90, marginY: 34, lineWidth: 2 }
const WIDTH_FACTOR = { thin: 0.5, thick: 2 }
const SPACING_FACTOR = { compact: 0.6, wide: 1.5 }
// Diseños en los que la rama de cada tema principal sale del tema central (se comprueba su trazo)
const RADIAL_LAYOUTS = ['mindMap', 'logicalStructure', 'logicalStructureLeft']

const PARAMS = {
  theme: Object.keys(THEMES),
  layout: ['mindMap', 'logicalStructure', 'organizationStructure', 'timeline', 'fishbone', 'logicalStructureLeft',
    'catalogOrganization', 'timeline2', 'verticalTimeline', 'verticalTimeline2', 'verticalTimeline3', 'fishbone2'],
  lineStyle: [null, 'curve', 'straight', 'direct'],
  lineWidth: [null, 'thin', 'thick'],
  spacing: [null, 'compact', 'wide'],
  rainbow: [false, true],
  shadow: [null, true, false],
  background: [null, '#fdeada'],
  lineColor: [null, '#c00000']
}
const COMBOS = pairwise(PARAMS)

const hexToRgb = hex => `rgb(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`

// Lo que debe verse y guardarse con una combinación
function expected(c) {
  const theme = THEMES[c.theme]
  const width = WIDTH_FACTOR[c.lineWidth] || 1
  const spacing = SPACING_FACTOR[c.spacing] || 1
  const shadow = c.shadow === null ? theme.shadow : c.shadow
  const saved = { theme: c.theme }
  for (const key of ['lineStyle', 'lineWidth', 'lineColor', 'spacing', 'background']) if (c[key] !== null) saved[key] = c[key]
  if (c.rainbow) saved.rainbow = true
  if (c.shadow !== null) saved.shadow = c.shadow
  return {
    saved,
    theme: c.theme,
    layout: c.layout,
    lineStyle: c.lineStyle || theme.lineStyle,
    background: hexToRgb(c.background || theme.bg),
    secondMarginX: Math.round(SECOND.marginX * spacing),
    secondMarginY: Math.round(SECOND.marginY * spacing),
    secondLineWidth: SECOND.lineWidth * width,
    rootShadow: shadow,
    rainbow: c.rainbow,
    nodes: 5,
    // Rama de Beta (desde el tema central): grosor y color
    branch: RADIAL_LAYOUTS.includes(c.layout)
      ? { width: SECOND.lineWidth * width, color: c.rainbow ? 'arcoíris' : (c.lineColor || theme.line) }
      : null,
    // Las opciones con las que se abriría el mapa guardado son las mismas que las vigentes
    reopenSame: true
  }
}

// Lo que se ve y se guarda ahora mismo (mismo formato que expected)
function observe(page, layoutWithBranches) {
  return page.evaluate(radial => {
    const d = window.Alpine.$data(document.body)
    const mm = Alpine.raw(d.mindMap)
    const root = mm.renderer.root
    if (!root || !root.shapeNode) return null
    const rootData = mm.renderer.renderTree.data
    const cfg = mm.themeConfig
    const strip = s => String(s).replace(/<[^>]+>/g, '').trim()
    const lineTo = text => {
      const i = root.children.findIndex(n => strip(n.getData('text')) === text)
      const line = root._lines && root._lines[i]
      return line ? { width: Number(line.node.getAttribute('stroke-width')), color: line.node.getAttribute('stroke') } : null
    }
    let branch = null
    if (radial.includes(mm.getLayout())) {
      const lines = ['Alfa', 'Beta', 'Gamma'].map(lineTo)
      if (lines.some(l => !l)) return null
      const colors = new Set(lines.map(l => l.color))
      branch = { width: lines[1].width, color: mm.opt.rainbowLinesConfig.open ? (colors.size === 3 ? 'arcoíris' : [...colors].join()) : lines[1].color }
    }
    const reopened = mapFormatOptions(rootData, { template: 'mindmanager' })
    return {
      saved: rootData._mapFormat,
      theme: mm.opt.theme,
      layout: mm.getLayout(),
      lineStyle: cfg.lineStyle,
      background: getComputedStyle(document.getElementById('mindMapContainer')).backgroundColor,
      secondMarginX: cfg.second.marginX,
      secondMarginY: cfg.second.marginY,
      secondLineWidth: cfg.second.lineWidth,
      rootShadow: root.shapeNode.node.getAttribute('filter') === 'url(#mm-topic-shadow)',
      rainbow: mm.opt.rainbowLinesConfig.open,
      nodes: document.querySelectorAll('#mindMapContainer .smm-node').length,
      branch,
      reopenSame: reopened.theme === mm.opt.theme &&
        JSON.stringify(reopened.themeConfig) === JSON.stringify(mm.opt.themeConfig) &&
        reopened.rainbowLinesConfig.open === mm.opt.rainbowLinesConfig.open
    }
  }, layoutWithBranches)
}

test('el generador cubre todos los pares de valores con el mínimo de combinaciones', () => {
  expect(missingPairs(PARAMS, COMBOS)).toEqual([])
  // El par mayor es tema × diseño (10 × 12): no puede haber menos de 120 combinaciones
  expect(COMBOS.length).toBe(PARAMS.theme.length * PARAMS.layout.length)
})

test.describe('pairwise: tema × diseño × ramas × espaciado × sombras × fondo', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'la combinatoria se prueba en Chromium; los escenarios, en los dos navegadores')

  chunk(COMBOS, 4).forEach((combos, k) => {
    test(`bloque ${k + 1}: ${combos.length} combinaciones`, async ({ page, maps }) => {
      test.setTimeout(240000)
      await setupMap(page, maps)
      for (const c of combos) {
        await page.evaluate(c => {
          const d = window.Alpine.$data(document.body)
          d.setLayout(c.layout)
          const { layout, ...format } = c
          d.setMapFormat(format, { reset: true })
        }, c)
        const want = expected(c)
        await expect.poll(() => observe(page, RADIAL_LAYOUTS), { message: JSON.stringify(c), timeout: 8000 }).toEqual(want)
      }
    })
  })
})
