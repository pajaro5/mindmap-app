// Fase 17 · Pruebas pairwise (t=2) del formato de relaciones y de límites. El oráculo
// (valores esperados) está escrito aquí a mano, sin usar las funciones de la app.
const { test, expect, setupMap, SAMPLE_TREE } = require('./fixtures')
const { pairwise, missingPairs, chunk } = require('./pairwise')

const clone = o => JSON.parse(JSON.stringify(o))

// Color de las relaciones de cada tema (sin color propio)
const THEME_RELATION_COLOR = { mindmanager: '#333333', 'mm-night': '#c9d4e3' }
// El mismo color tal como lo define el tema (lo que muestra la cinta)
const THEME_RELATION_VALUE = { mindmanager: 'rgb(51, 51, 51)', 'mm-night': '#c9d4e3' }
// Estilo por defecto de un límite nuevo (format.js, "Redondeado")
const DEFAULT_BOUNDARY = { strokeColor: '#3d8fd8', fill: 'rgba(61, 143, 216, 0.06)' }

const RELATION_PARAMS = {
  theme: ['mindmanager', 'mm-night'],
  color: [null, '#c00000', '#00b050'],
  width: [1, 2, 4],
  dash: ['none', '6,4', '2,3'],
  arrows: ['end', 'both', 'start', 'none']
}
const BOUNDARY_PARAMS = {
  shape: ['rect', 'rounded', 'cloud'],
  color: [null, '#c00000'],
  fill: [null, '#fdeada'],
  dash: ['none', '6,4', '2,3']
}
const RELATION_COMBOS = pairwise(RELATION_PARAMS)
const BOUNDARY_COMBOS = pairwise(BOUNDARY_PARAMS)

function sample() {
  const data = clone(SAMPLE_TREE)
  data.root.children[2].data.uid = 'gamma-uid'
  data.root.children[0].data.associativeLineTargets = ['gamma-uid']
  data.root.children[0].children[0].data.outerFrame = { groupId: 'g1', radius: 14, strokeWidth: 2, ...DEFAULT_BOUNDARY, strokeDasharray: 'none' }
  return data
}

test('los generadores cubren todos los pares', () => {
  expect(missingPairs(RELATION_PARAMS, RELATION_COMBOS)).toEqual([])
  expect(missingPairs(BOUNDARY_PARAMS, BOUNDARY_COMBOS)).toEqual([])
  // El voraz no siempre llega al mínimo teórico (el producto de los dos parámetros con más
  // valores), pero se queda cerca y muy por debajo del exhaustivo
  expect(RELATION_COMBOS.length).toBeGreaterThanOrEqual(12) // flechas (4) × color, grosor o trazo (3)
  expect(RELATION_COMBOS.length).toBeLessThanOrEqual(18) // exhaustivo: 216
  expect(BOUNDARY_COMBOS.length).toBeGreaterThanOrEqual(9) // forma (3) × trazo (3)
  expect(BOUNDARY_COMBOS.length).toBeLessThanOrEqual(14) // exhaustivo: 36
})

test.describe('pairwise: formato de relaciones y límites', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'la combinatoria se prueba en Chromium; los escenarios, en los dos navegadores')

  chunk(RELATION_COMBOS, 2).forEach((combos, k) => {
    test(`relaciones, bloque ${k + 1}: ${combos.length} combinaciones`, async ({ page, maps }) => {
      test.setTimeout(120000)
      const { app } = await setupMap(page, maps, { data: sample() })
      await expect.poll(() => app.relationshipCount()).toBe(1)
      for (const c of combos) {
        await page.evaluate(theme => window.Alpine.$data(document.body).setMapFormat({ theme }, { reset: true }), c.theme)
        // Cambiar el tema repinta las relaciones: se vuelve a seleccionar la relación
        await expect.poll(() => page.evaluate(() => Alpine.raw(window.Alpine.$data(document.body).mindMap).opt.theme)).toBe(c.theme)
        // opt.theme cambia antes del repintado: hay que esperar a que termine (y a su entrada de
        // historial, que vuelve a pintar las relaciones) o el clic se perdería en medio
        await app.settleHistory()
        // Al 30 % del trazo: el punto medio cae sobre Beta
        await app.clickRelationship(0, 0.3)
        await page.evaluate(c => window.Alpine.$data(document.body).setRelationshipStyle({
          associativeLineColor: c.color, associativeLineWidth: c.width, associativeLineDasharray: c.dash, arrows: c.arrows
        }), c)
        const want = {
          stroke: c.color || THEME_RELATION_COLOR[c.theme],
          width: c.width,
          dash: c.dash,
          markerStart: c.arrows === 'start' || c.arrows === 'both',
          markerEnd: c.arrows === 'end' || c.arrows === 'both',
          ribbon: { color: c.color || THEME_RELATION_VALUE[c.theme], width: String(c.width), dash: c.dash, arrows: c.arrows }
        }
        const observe = () => page.evaluate(() => {
          const d = window.Alpine.$data(document.body)
          const entry = d.mindMap.associativeLine.lineList[0]
          if (!entry) return null
          const el = entry[0].node
          const r = d.selection.relationship || {}
          return {
            stroke: el.getAttribute('stroke'),
            width: Number(el.getAttribute('stroke-width')),
            dash: el.getAttribute('stroke-dasharray'),
            markerStart: !!el.getAttribute('marker-start'),
            markerEnd: !!el.getAttribute('marker-end'),
            ribbon: { color: r.color, width: String(r.width), dash: r.dash, arrows: r.arrows }
          }
        })
        await expect.poll(observe, { message: JSON.stringify(c) }).toEqual(want)
        // Repintar todas las relaciones (lo que pasa al mover un tema o al recargar) da lo mismo
        await page.evaluate(() => window.Alpine.$data(document.body).mindMap.associativeLine.renderAllLines())
        const { ribbon, ...painted } = want
        await expect.poll(async () => { const o = await observe(); if (o) delete o.ribbon; return o }, { message: `repintado ${JSON.stringify(c)}` }).toEqual(painted)
      }
    })
  })

  test(`límites: ${BOUNDARY_COMBOS.length} combinaciones`, async ({ page, maps }) => {
    test.setTimeout(120000)
    const { app } = await setupMap(page, maps, { data: sample() })
    const frame = page.locator('.smm-outer-frame-container > rect, .smm-outer-frame-container > path')
    await expect(frame).toHaveCount(1)
    for (const c of BOUNDARY_COMBOS) {
      if (!(await page.evaluate(() => window.Alpine.$data(document.body).boundaryActive))) {
        const box = await frame.first().boundingBox()
        const inset = (await frame.first().evaluate(e => e.tagName)) === 'path' ? 12 : 4
        await page.mouse.click(box.x + inset, box.y + box.height / 2)
        await page.waitForFunction(() => window.Alpine.$data(document.body).boundaryActive)
      }
      await page.evaluate(c => {
        const d = window.Alpine.$data(document.body)
        d.setBoundaryShape(c.shape)
        d.setBoundaryStyle({ strokeColor: c.color, fill: c.fill, strokeDasharray: c.dash })
      }, c)
      const want = {
        tag: c.shape === 'cloud' ? 'path' : 'rect',
        count: 1,
        stroke: c.color || DEFAULT_BOUNDARY.strokeColor,
        fill: c.fill || DEFAULT_BOUNDARY.fill,
        radius: c.shape === 'rounded' ? '14' : null,
        active: true,
        saved: { shape: c.shape === 'cloud' ? 'cloud' : undefined, strokeDasharray: c.dash },
        ribbon: { shape: c.shape, dash: c.dash, color: c.color || DEFAULT_BOUNDARY.strokeColor, fill: c.fill || DEFAULT_BOUNDARY.fill }
      }
      await expect.poll(() => page.evaluate(() => {
        const d = window.Alpine.$data(document.body)
        const els = document.querySelectorAll('.smm-outer-frame-container > rect, .smm-outer-frame-container > path')
        const el = els[0]
        if (!el) return null
        const data = Alpine.raw(d.mindMap).renderer.root.children[0].children[0].getData('outerFrame')
        const b = d.selection.boundary || {}
        return {
          tag: el.tagName,
          count: els.length,
          stroke: el.getAttribute('stroke'),
          fill: el.getAttribute('fill'),
          radius: el.tagName === 'rect' && Number(el.getAttribute('rx')) > 0 ? el.getAttribute('rx') : null,
          active: d.boundaryActive,
          saved: { shape: data.shape, strokeDasharray: data.strokeDasharray },
          ribbon: { shape: b.shape, dash: b.dash, color: b.color, fill: b.fill }
        }
      }), { message: JSON.stringify(c) }).toEqual(want)
    }
  })
})
