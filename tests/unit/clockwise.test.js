// Sentido horario del diseño radial (clockwise.js), orden al equilibrar (map-format.js) y colores
// de MindManager (import-formats.js). Oráculo escrito a mano.
const test = require('node:test')
const assert = require('node:assert/strict')
const { loadApp } = require('./load-app')

const app = loadApp()
const R = 'right'
const L = 'left'

test('clockwiseSides: sin dir, la primera mitad (hacia arriba) a la derecha y el resto a la izquierda', () => {
  const cases = [
    [[], []],
    [[undefined], [R]],
    [[undefined, undefined], [R, L]],
    [[undefined, undefined, undefined], [R, R, L]],
    [[undefined, undefined, undefined, undefined], [R, R, L, L]],
    [Array(9).fill(undefined), [R, R, R, R, R, L, L, L, L]]
  ]
  for (const [dirs, expected] of cases) assert.deepEqual([...app.clockwiseSides(dirs)], expected, JSON.stringify(dirs))
})

test('clockwiseSides: un dir guardado manda; los que faltan o no valen siguen la regla por posición', () => {
  const cases = [
    [[L, R], [L, R]],
    [[L, undefined, undefined], [L, R, L]],
    [[undefined, undefined, R, R], [R, R, R, R]],
    [['arriba', 42, null, L], [R, R, L, L]]
  ]
  for (const [dirs, expected] of cases) assert.deepEqual([...app.clockwiseSides(dirs)], expected, JSON.stringify(dirs))
})

test('clockwiseVisualOrder: la derecha en orden y la izquierda al revés (de abajo arriba)', () => {
  const nodes = [['a', R], ['b', R], ['c', L], ['d', R], ['e', L], ['f', L]].map(([id, dir]) => ({ id, dir }))
  assert.deepEqual([...app.clockwiseVisualOrder(nodes).map(n => n.id)], ['a', 'b', 'd', 'f', 'e', 'c'])
  assert.deepEqual([...app.clockwiseVisualOrder([])], [])
})

test('computedTopValue: los temas principales de la izquierda quedan de abajo arriba; los subtemas no', () => {
  const node = (id, dir, height, children = []) => ({ uid: id, dir, height, top: 0, children, getData: k => k === 'expand' ? true : undefined })
  const subs = [node('s1', L, 10), node('s2', L, 10)]
  const kids = [node('r1', R, 10), node('r2', R, 10), node('l1', L, 10, subs), node('l2', L, 10)]
  const root = { isRoot: true, top: 0, height: 20, leftChildrenAreaHeight: 0, rightChildrenAreaHeight: 0, children: kids, getData: () => true }
  kids[2].leftChildrenAreaHeight = 0
  kids[2].rightChildrenAreaHeight = 0
  const layout = { root, getMarginY: () => 5, ...app.clockwiseLayoutMethods }
  layout.computedTopValue()
  const top = id => [...kids, ...subs].find(n => n.uid === id).top
  assert.ok(top('r1') < top('r2'), 'derecha: r1 encima de r2')
  assert.ok(top('l2') < top('l1'), 'izquierda: l2 (el último) encima de l1')
  assert.ok(top('s1') < top('s2'), 'subtemas de una rama izquierda: en orden')
})

test('balancedOrder: primero las ramas de la derecha y luego las de la izquierda, cada grupo en su orden', () => {
  assert.deepEqual([...app.balancedOrder([R, L, R, L, R])], [0, 2, 4, 1, 3])
  assert.deepEqual([...app.balancedOrder([L, L, R])], [2, 0, 1])
  assert.deepEqual([...app.balancedOrder([])], [])
})

test('mindManagerColor: AARRGGBB → #rrggbb; transparente o inválido → null', () => {
  const cases = [
    ['fff85e19', '#f85e19'],
    ['FF4447BF', '#4447bf'],
    ['80123456', '#123456'],
    ['00000000', null],
    ['00ffffff', null],
    ['f85e19', null],
    ['zzf85e19', null],
    ['', null],
    [undefined, null]
  ]
  for (const [value, expected] of cases) assert.equal(app.mindManagerColor(value), expected, String(value))
})

test('applyMindManagerColors: relleno con texto legible y sin degradado; la línea de la rama salvo en el central', () => {
  const main = {}
  app.applyMindManagerColors(main, { fill: '#ffeee5', line: '#f85e19' }, false)
  assert.deepEqual(main, { fillColor: '#ffeee5', gradientStyle: false, color: '#1e2a3a', borderColor: '#f85e19', lineColor: '#f85e19' })
  const root = {}
  app.applyMindManagerColors(root, { fill: '#1d3557', line: '#000000' }, true)
  assert.deepEqual(root, { fillColor: '#1d3557', gradientStyle: false, color: '#ffffff', borderColor: '#000000' })
  const onlyLine = {}
  app.applyMindManagerColors(onlyLine, { fill: null, line: '#4447bf' }, false)
  assert.deepEqual(onlyLine, { borderColor: '#4447bf', lineColor: '#4447bf' })
  const none = {}
  app.applyMindManagerColors(none, null, false)
  assert.deepEqual(none, {})
})
