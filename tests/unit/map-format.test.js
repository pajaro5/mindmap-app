// Formato del mapa (map-format.js): imagen de fondo, temas propios y equilibrar. Sin navegador.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { loadApp } = require('./load-app')
const { pairwise, missingPairs } = require('../e2e/pairwise')

const app = loadApp()
const plain = value => JSON.parse(JSON.stringify(value))
const FILE = '/api/files/0b7c1c62-1111-4111-8111-111111111111'

// ---- Imagen de fondo ----
const BG_PARAMS = {
  image: [undefined, FILE, 'https://evil.example/x.png', 'javascript:alert(1)', '/api/files/../x', 5],
  fit: [undefined, 'cover', 'repeat', 'center', 'otro'],
  theme: ['mindmanager', 'mm-night', 'inventado']
}
const BG_COMBOS = pairwise(BG_PARAMS)

test(`normalizeMapFormat con imagen de fondo: ${BG_COMBOS.length} combinaciones (imagen × ajuste × tema)`, () => {
  assert.deepEqual(missingPairs(BG_PARAMS, BG_COMBOS), [])
  for (const c of BG_COMBOS) {
    const got = plain(app.compactMapFormat(app.normalizeMapFormat({ theme: c.theme, backgroundImage: c.image, backgroundFit: c.fit })))
    const want = { theme: c.theme === 'inventado' ? 'mindmanager' : c.theme }
    if (c.image === FILE) {
      want.backgroundImage = FILE
      if (c.fit === 'repeat' || c.fit === 'center') want.backgroundFit = c.fit // 'cover' es el de por defecto
    }
    assert.deepEqual(got, want, JSON.stringify(c))
  }
})

test('estilos de la imagen de fondo según el ajuste', () => {
  const cfg = fit => plain(app.mapFormatThemeConfig(app.normalizeMapFormat({ backgroundImage: FILE, backgroundFit: fit })))
  assert.deepEqual([cfg(undefined).backgroundSize, cfg(undefined).backgroundRepeat], ['cover', 'no-repeat'])
  assert.deepEqual([cfg('repeat').backgroundSize, cfg('repeat').backgroundRepeat], ['auto', 'repeat'])
  assert.deepEqual([cfg('center').backgroundSize, cfg('center').backgroundRepeat], ['auto', 'no-repeat'])
  assert.equal(cfg('repeat').backgroundImage, FILE)
  assert.equal(plain(app.mapFormatThemeConfig(app.normalizeMapFormat({}))).backgroundImage, undefined)
})

test('un tema propio guarda el formato sin la imagen de fondo (es del mapa)', () => {
  const format = { theme: 'mm-night', lineStyle: 'direct', shadow: true, backgroundImage: FILE, backgroundFit: 'repeat', nada: 1 }
  assert.deepEqual(plain(app.themeFormatOf(format)), { theme: 'mm-night', lineStyle: 'direct', shadow: true })
  assert.deepEqual(plain(app.themeFormatOf({ theme: 'x', lineStyle: 'zigzag' })), { theme: 'mindmanager' })
})

// ---- Equilibrar ----
// Oráculo: mejor diferencia posible con ceil(n/2) ramas a la derecha (fuerza bruta aquí)
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
const WEIGHTS = [1, 2, 3, 5, 8, 13]
const BALANCE_PARAMS = { n: [1, 2, 3, 4, 5, 7, 9, 12], ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`w${i}`, WEIGHTS])) }
const BALANCE_COMBOS = pairwise(BALANCE_PARAMS)

const sideSums = (weights, sides) => ({
  right: weights.reduce((s, w, i) => s + (sides[i] === 'right' ? w : 0), 0),
  left: weights.reduce((s, w, i) => s + (sides[i] === 'left' ? w : 0), 0),
  rightCount: sides.filter(s => s === 'right').length
})

test(`balancedSides: ${BALANCE_COMBOS.length} combinaciones (nº de ramas × peso de cada una)`, () => {
  assert.deepEqual(missingPairs(BALANCE_PARAMS, BALANCE_COMBOS), [])
  for (const c of BALANCE_COMBOS) {
    const weights = Array.from({ length: c.n }, (_, i) => c[`w${i}`])
    const sides = [...app.balancedSides(weights)]
    const label = JSON.stringify(weights)
    assert.equal(sides.length, weights.length, label)
    assert.ok(sides.every(s => s === 'right' || s === 'left'), label)
    const sums = sideSums(weights, sides)
    assert.equal(sums.rightCount, Math.ceil(weights.length / 2), label)
    assert.equal(Math.abs(sums.right - sums.left), bestDifference(weights), label)
  }
})

test('balancedSides con más de 20 ramas (voraz): ceil(n/2) a la derecha y no se aleja mucho', () => {
  const weights = Array.from({ length: 25 }, (_, i) => (i * 7) % 11 + 1)
  const sums = sideSums(weights, [...app.balancedSides(weights)])
  assert.equal(sums.rightCount, 13)
  assert.ok(Math.abs(sums.right - sums.left) <= Math.max(...weights), `diferencia ${Math.abs(sums.right - sums.left)}`)
})
