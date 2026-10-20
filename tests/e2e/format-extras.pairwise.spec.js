// Fase 20 · Pruebas pairwise (t=2): temas propios (cualquier formato guardado se vuelve a
// aplicar igual) y equilibrar el mapa (el reparto es el mejor posible). El oráculo está
// escrito aquí a mano, sin usar las funciones de la app.
const { test, expect, setupMap } = require('./fixtures')
const { pairwise, missingPairs, chunk } = require('./pairwise')

// ---- Temas propios ----
const THEME_PARAMS = {
  theme: ['mindmanager', 'mm-relief', 'mm-professional', 'mm-night', 'mm-pastel', 'mm-sunset', 'mm-forest', 'mm-violet', 'mm-mono', 'mm-minimal'],
  lineStyle: [null, 'curve', 'straight', 'direct'],
  lineWidth: [null, 'thin', 'thick'],
  spacing: [null, 'compact', 'wide'],
  rainbow: [false, true],
  shadow: [null, true, false],
  background: [null, '#fdeada'],
  lineColor: [null, '#c00000']
}
const THEME_COMBOS = pairwise(THEME_PARAMS)
const compact = c => {
  const out = { theme: c.theme }
  for (const k of ['lineStyle', 'lineWidth', 'lineColor', 'spacing', 'background']) if (c[k] !== null) out[k] = c[k]
  if (c.rainbow) out.rainbow = true
  if (c.shadow !== null) out.shadow = c.shadow
  return out
}

// ---- Equilibrar: n ramas principales con un peso (número de temas) cada una ----
const WEIGHTS = [1, 2, 4, 7]
const BALANCE_PARAMS = {
  n: [2, 3, 4, 5, 6],
  w0: WEIGHTS, w1: WEIGHTS, w2: WEIGHTS, w3: WEIGHTS, w4: WEIGHTS, w5: WEIGHTS
}
const BALANCE_COMBOS = pairwise(BALANCE_PARAMS)
const weightsOf = c => [c.w0, c.w1, c.w2, c.w3, c.w4, c.w5].slice(0, c.n)

// Mejor diferencia posible con ceil(n/2) ramas a la derecha (fuerza bruta)
function bestDifference(weights) {
  const n = weights.length
  const k = Math.ceil(n / 2)
  const total = weights.reduce((a, b) => a + b, 0)
  let best = Infinity
  for (let mask = 0; mask < 1 << n; mask++) {
    let count = 0
    let right = 0
    for (let i = 0; i < n; i++) if (mask & (1 << i)) { count++; right += weights[i] }
    if (count === k) best = Math.min(best, Math.abs(total - 2 * right))
  }
  return best
}

function treeFor(weights) {
  return {
    data: { text: 'Centro', uid: 'centro' },
    children: weights.map((w, i) => ({
      data: { text: `R${i}`, uid: `r${i}` },
      children: Array.from({ length: w - 1 }, (_, j) => ({ data: { text: `R${i}.${j}`, uid: `r${i}-${j}` }, children: [] }))
    }))
  }
}

test('los generadores cubren todos los pares', () => {
  expect(missingPairs(THEME_PARAMS, THEME_COMBOS)).toEqual([])
  expect(missingPairs(BALANCE_PARAMS, BALANCE_COMBOS)).toEqual([])
  expect(THEME_COMBOS.length).toBeLessThanOrEqual(60) // mínimo 40 (10 × 4); exhaustivo 25.920
  expect(BALANCE_COMBOS.length).toBeLessThanOrEqual(30) // mínimo 20 (5 × 4); exhaustivo 20.480
})

test.describe('pairwise: temas propios y equilibrar', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'la combinatoria se prueba en Chromium; los escenarios, en los dos navegadores')

  chunk(THEME_COMBOS, 2).forEach((combos, k) => {
    test(`temas propios, bloque ${k + 1}: ${combos.length} combinaciones`, async ({ page, maps, request }) => {
      test.setTimeout(180000)
      const created = []
      try {
        for (const c of combos) {
          const res = await request.post('/api/themes', { data: { title: `PW ${k} ${created.length}`, format: compact(c) } })
          expect(res.status(), JSON.stringify(c)).toBe(201)
          created.push((await res.json()).id)
        }
        await setupMap(page, maps)
        await page.evaluate(() => window.Alpine.$data(document.body).loadUserThemes())
        for (const [i, c] of combos.entries()) {
          // Desde otro tema con otros cambios, para ver que se sustituye todo
          await page.evaluate(id => {
            const d = window.Alpine.$data(document.body)
            d.setMapFormat({ theme: 'mm-forest', spacing: 'wide', lineColor: '#123456' }, { reset: true })
            d.runCommand('mapTheme.apply', `user:${id}`)
          }, created[i])
          await expect.poll(() => page.evaluate(() =>
            Alpine.raw(window.Alpine.$data(document.body).mindMap).renderer.renderTree.data._mapFormat), { message: JSON.stringify(c) }).toEqual(compact(c))
          // La galería marca el tema propio; si no cambia nada del tema de serie, marca ese
          const marked = Object.keys(compact(c)).length > 1 ? `user:${created[i]}` : c.theme
          await expect.poll(() => page.evaluate(() => window.Alpine.$data(document.body).currentValueOf('mapTheme.apply'))).toBe(marked)
        }
      } finally {
        for (const id of created) await request.delete(`/api/themes/${id}`)
      }
    })
  })

  test(`equilibrar: ${BALANCE_COMBOS.length} combinaciones`, async ({ page, maps }) => {
    test.setTimeout(180000)
    await setupMap(page, maps)
    await page.evaluate(() => window.Alpine.$data(document.body).setLayout('mindMap'))
    for (const c of BALANCE_COMBOS) {
      const weights = weightsOf(c)
      await page.evaluate(tree => Alpine.raw(window.Alpine.$data(document.body).mindMap).setData(tree), treeFor(weights))
      await expect.poll(() => page.evaluate(() => Alpine.raw(window.Alpine.$data(document.body).mindMap).renderer.root.children.length)).toBe(weights.length)
      await page.evaluate(() => window.Alpine.$data(document.body).runCommand('layout.balance'))
      const observe = () => page.evaluate(() => {
        const root = Alpine.raw(window.Alpine.$data(document.body).mindMap).renderer.root
        const weight = n => 1 + (n.children || []).reduce((s, ch) => s + weight(ch), 0)
        let right = 0
        let left = 0
        let rightCount = 0
        root.children.forEach(n => { if (n.left > root.left) { right += weight(n); rightCount++ } else left += weight(n) })
        return { diff: Math.abs(right - left), rightCount, total: root.children.length }
      })
      await expect.poll(observe, { message: JSON.stringify(c) }).toEqual({
        diff: bestDifference(weights), rightCount: Math.ceil(weights.length / 2), total: weights.length
      })
    }
  })
})
