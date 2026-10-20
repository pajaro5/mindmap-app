// Fase 22 · Pruebas pairwise (t=2) de llamadas y temas flotantes: tipo × texto (corto o que
// se parte en dos líneas) × número de subtemas × nivel del tema × zoom. Se comprueba la
// geometría del globo y el conector con un oráculo escrito aquí a mano.
const { test, expect, setupMap } = require('./fixtures')
const { pairwise, missingPairs } = require('./pairwise')

const PARAMS = {
  floating: [false, true],
  text: ['Corto', 'uno dos tres cuatro cinco seis'], // el segundo (30 caracteres) ocupa 2 líneas
  items: [0, 1, 3],
  level: ['root', 'second', 'node'],
  zoom: [0.5, 1, 2]
}
const COMBOS = pairwise(PARAMS)
const TOPIC = { root: 'Raíz', second: 'Beta', node: 'Alfa uno' }
const LINE_HEIGHT = 16
const PAD_Y = 7

test('el generador cubre todos los pares', () => {
  expect(missingPairs(PARAMS, COMBOS)).toEqual([])
  expect(COMBOS.length).toBeLessThanOrEqual(14) // mínimo 9; exhaustivo 108
})

test.describe('pairwise: llamadas y temas flotantes', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'la combinatoria se prueba en Chromium; los escenarios, en los dos navegadores')

  test(`${COMBOS.length} combinaciones`, async ({ page, maps }) => {
    test.setTimeout(120000)
    await setupMap(page, maps)
    for (const c of COMBOS) {
      const items = ['a', 'b', 'c'].slice(0, c.items)
      const lines = (c.text.length > 28 ? 2 : 1) + items.length
      await page.evaluate(({ c, items, topic }) => {
        const mm = Alpine.raw(window.Alpine.$data(document.body).mindMap)
        const strip = s => String(s).replace(/<[^>]+>/g, '').trim()
        const all = []
        const walk = n => { all.push(n); (n.children || []).forEach(walk) }
        walk(mm.renderer.root)
        // Una sola llamada en todo el mapa: la de esta combinación
        all.forEach(n => { if (n.getData('_callouts')) mm.renderer.setNodeData(n, { _callouts: undefined }) })
        const node = all.find(n => strip(n.getData('text')) === topic)
        mm.execCommand('SET_CALLOUTS', node.uid, () => [{ id: 'k', text: c.text, items, floating: c.floating || undefined, dx: 24, dy: -14 }])
        mm.view.setScale(c.zoom)
      }, { c, items, topic: TOPIC[c.level] })
      const want = { lines, height: lines * LINE_HEIGHT + PAD_Y * 2, connector: c.floating ? 0 : 1, x: 'ok', y: 'ok', screen: 'ok', floatingClass: c.floating }
      await expect.poll(() => page.evaluate(({ topic, zoom }) => {
        const mm = Alpine.raw(window.Alpine.$data(document.body).mindMap)
        const g = document.querySelector('#mindMapContainer .smm-callouts .smm-callout')
        if (!g) return null
        const strip = s => String(s).replace(/<[^>]+>/g, '').trim()
        const all = []
        const walk = n => { all.push(n); (n.children || []).forEach(walk) }
        walk(mm.renderer.root)
        const node = all.find(n => strip(n.getData('text')) === topic)
        const box = g.querySelector('.smm-callout-box')
        const height = Number(box.getAttribute('height'))
        const x = Number(box.getAttribute('x'))
        const y = Number(box.getAttribute('y'))
        const screen = box.getBoundingClientRect().height
        return {
          lines: g.querySelectorAll('tspan').length,
          height,
          connector: g.querySelectorAll('line').length,
          x: Math.abs(x - (node.left + node.width + 24)) < 0.5 ? 'ok' : `x=${x}`,
          y: Math.abs(y - (node.top - 14 - height)) < 0.5 ? 'ok' : `y=${y}`,
          screen: Math.abs(screen - height * zoom) < 2 ? 'ok' : `screen=${screen}`,
          floatingClass: g.classList.contains('smm-floating')
        }
      }, { topic: TOPIC[c.level], zoom: c.zoom }), { message: JSON.stringify(c) }).toEqual(want)
    }
  })
})
