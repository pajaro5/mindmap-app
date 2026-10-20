// Fase 23 · Pruebas pairwise (t=2) de la edición de diagramas: tipo × cambio de tamaño ×
// regla de zona × zona. Oráculo: la regla elegida (valores escritos aquí) llega a los temas
// de la zona y no a los demás; y, como relación metamórfica, cambiar el tamaño del diagrama
// no saca a ningún tema de su zona.
const { test, expect, setupMap } = require('./fixtures')
const { pairwise, missingPairs } = require('./pairwise')

const TYPES = { funnel: 3, onion: 3, quarter: 3, lanes: 3, venn: 2, matrix: 4 }
const PARAMS = {
  type: Object.keys(TYPES),
  scale: [0.75, 1.25, 1.6],
  rule: ['fill', 'fontSize', 'icon'],
  zone: ['first', 'last']
}
const COMBOS = pairwise(PARAMS)
const RULES = { fill: { fill: '#2fb5a6' }, fontSize: { fontSize: 22 }, icon: { icon: 'flag_green' } }

function diagramMap(type) {
  const n = TYPES[type]
  return {
    layout: 'logicalStructure',
    root: {
      data: { text: 'Diagrama', _diagram: { type, items: Array.from({ length: n }, (_, i) => ({ id: `z${i + 1}`, label: `Zona ${i + 1}` })), ...(type === 'matrix' ? { rows: 2, cols: 2 } : {}) } },
      children: Array.from({ length: n }, (_, i) => ({ data: { text: `T${i + 1}` }, children: [] }))
    },
    theme: { template: 'mindmanager', config: {} },
    view: {}
  }
}

test('el generador cubre todos los pares', () => {
  expect(missingPairs(PARAMS, COMBOS)).toEqual([])
  expect(COMBOS.length).toBeLessThanOrEqual(24) // mínimo 18 (6 × 3); exhaustivo 54
})

test.describe('pairwise: editar diagramas', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'la combinatoria se prueba en Chromium; los escenarios, en los dos navegadores')

  for (const c of COMBOS) {
    test(`${c.type} × ${c.scale} × ${c.rule} × ${c.zone}`, async ({ page, maps }) => {
      await setupMap(page, maps, { data: diagramMap(c.type) })
      const zonesOf = () => page.evaluate(() => {
        const mm = Alpine.raw(window.Alpine.$data(document.body).mindMap)
        return mm.renderer.root.children.map(n => diagramZoneAt(diagramOf(mm), n.left + n.width / 2, n.top + n.height / 2))
      })
      // Cada tema empieza en su zona (en Venn, en la de su círculo solo)
      const n = TYPES[c.type]
      await expect.poll(zonesOf).toEqual(Array.from({ length: n }, (_, i) => `z${i + 1}`))
      const zone = c.zone === 'first' ? 'z1' : `z${n}`
      const index = Number(zone.slice(1)) - 1
      await page.evaluate(({ zone, rule, scale }) => {
        const d = window.Alpine.$data(document.body)
        d.setDiagramRule(zone, rule)
        const cur = diagramOf(Alpine.raw(d.mindMap))
        d.setDiagramProperties({ width: Math.round(cur.width * scale), height: Math.round(cur.height * scale) })
      }, { zone, rule: RULES[c.rule], scale: c.scale })
      const want = Array.from({ length: n }, (_, i) => i === index ? 'regla' : 'sin regla')
      await expect.poll(() => page.evaluate(({ rule }) => {
        const mm = Alpine.raw(window.Alpine.$data(document.body).mindMap)
        return mm.renderer.root.children.map(node => {
          const d = node.getData()
          const has = rule.fill ? d.fillColor === rule.fill : rule.fontSize ? d.fontSize === rule.fontSize : (d.icon || []).includes(rule.icon)
          return has ? 'regla' : 'sin regla'
        })
      }, { rule: RULES[c.rule] }), { message: JSON.stringify(c) }).toEqual(want)
      // Relación metamórfica: el cambio de tamaño no saca a nadie de su zona
      await expect.poll(zonesOf, { message: `zonas tras escalar ${JSON.stringify(c)}` }).toEqual(Array.from({ length: n }, (_, i) => `z${i + 1}`))
    })
  }
})
