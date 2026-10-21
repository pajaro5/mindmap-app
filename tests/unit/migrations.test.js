// Versión del formato y migraciones (migrations.js). Combinaciones pairwise t=2 con el
// oráculo escrito aquí.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { loadApp } = require('./load-app')
const { pairwise, missingPairs } = require('../e2e/pairwise')

const app = loadApp()
const plain = value => JSON.parse(JSON.stringify(value))

const PARAMS = {
  version: ['missing', 0, 1, 2, -1, '1', 1.5, null],
  markers: ['none', 'legacy', 'both', 'current'],
  theme: ['none', 'default', 'mindmanager', 'notObject'],
  rootData: ['ok', 'missing']
}
const COMBOS = pairwise(PARAMS)
const LEGACY = [{ id: 'c1', name: 'Viejo', color: '#2b6fbd', markers: [] }]
const CURRENT = [{ id: 'c2', name: 'Nuevo', color: '#c00000', markers: [] }]

test('SCHEMA_VERSION es la última migración (1)', () => {
  assert.equal(app.SCHEMA_VERSION, 1)
})

test(`migrateMapData: ${COMBOS.length} combinaciones (versión × marcadores × tema × raíz)`, () => {
  assert.deepEqual(missingPairs(PARAMS, COMBOS), [])
  for (const c of COMBOS) {
    const label = JSON.stringify(c)
    const data = { layout: 'mindMap', root: c.rootData === 'ok' ? { data: { text: 'R' }, children: [] } : { children: [] } }
    if (c.version !== 'missing') data.schemaVersion = c.version
    if (c.rootData === 'ok') {
      if (['legacy', 'both'].includes(c.markers)) data.root.data.textMarkers = LEGACY
      if (['both', 'current'].includes(c.markers)) data.root.data._textMarkers = CURRENT
    }
    if (c.theme === 'default') data.theme = { template: 'default', config: {} }
    if (c.theme === 'mindmanager') data.theme = { template: 'mindmanager', config: {} }
    if (c.theme === 'notObject') data.theme = 'raro'
    const before = plain(data)

    const result = plain(app.migrateMapData(data))

    // Oráculo: versión válida = entero ≥ 0; si no, cuenta como 0
    const from = Number.isInteger(c.version) && c.version >= 0 ? c.version : 0
    if (from > 1) {
      assert.deepEqual(result, { from, to: from, applied: [], newer: true }, label)
      assert.deepEqual(plain(data), before, `una versión posterior no se toca: ${label}`)
      continue
    }
    assert.deepEqual(result, { from, to: 1, applied: from === 0 ? ['claves antiguas: marcadores de texto y tema "default"'] : [], newer: false }, label)
    assert.equal(data.schemaVersion, 1, label)
    const want = { ...before, schemaVersion: 1 }
    if (from === 0) {
      if (c.rootData === 'ok' && c.markers === 'legacy') { want.root.data._textMarkers = LEGACY; delete want.root.data.textMarkers }
      if (c.rootData === 'ok' && c.markers === 'both') delete want.root.data.textMarkers // gana la clave actual
      if (c.theme === 'default') want.theme.template = 'mindmanager'
    }
    assert.deepEqual(plain(data), want, label)
  }
})

test('migrateMapData: datos que no son un objeto no fallan', () => {
  for (const bad of [null, undefined, 'x', 3]) assert.deepEqual(plain(app.migrateMapData(bad)), { from: 0, to: 0, applied: [], newer: false })
})

test('migrar dos veces es lo mismo que una (idempotente)', () => {
  const data = { root: { data: { text: 'R', textMarkers: LEGACY }, children: [] }, theme: { template: 'default' } }
  app.migrateMapData(data)
  const once = plain(data)
  assert.deepEqual(plain(app.migrateMapData(data)).applied, [])
  assert.deepEqual(plain(data), once)
})

test('stampSchemaVersion: la actual, o la posterior con la que se abrió el mapa', () => {
  const table = [[undefined, 1], [0, 1], [1, 1], [3, 3], [-2, 1], ['5', 1], [2.5, 1]]
  for (const [loaded, want] of table) assert.equal(app.stampSchemaVersion({}, loaded).schemaVersion, want, String(loaded))
})
