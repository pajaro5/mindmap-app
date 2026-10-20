// El mapa de impacto (tests/impact-map.js) debe estar completo: si un módulo o un spec no
// aparece, la regresión selectiva no lo ejecutaría nunca (o lanzaría siempre la suite entera).
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { QUARANTINE, QUARANTINE_MODULES, SMOKE, IMPACT } = require('../impact-map')
const { appScripts } = require('./load-app')

const ROOT = path.join(__dirname, '..', '..')
const specNames = fs.readdirSync(path.join(ROOT, 'tests', 'e2e'))
  .filter(f => f.endsWith('.spec.js'))
  .map(f => f.replace(/(\.pairwise)?\.spec\.js$/, ''))

test('cada módulo de la app tiene pruebas e2e asignadas', () => {
  const modules = fs.readdirSync(path.join(ROOT, 'public', 'js')).map(f => `public/js/${f}`)
  const missing = modules.filter(m => !QUARANTINE_MODULES.includes(m) && !(IMPACT[m] && IMPACT[m].length))
  assert.deepEqual(missing, [], 'añádelos a IMPACT en tests/impact-map.js')
})

test('los módulos en cuarentena no se cargan en la app', () => {
  const loaded = appScripts().map(s => `public${s}`)
  assert.deepEqual(QUARANTINE_MODULES.filter(m => loaded.includes(m)), [], 'si ya se carga, sácalo de la cuarentena')
})

test('cada spec e2e aparece en el mapa (humo, impacto o cuarentena)', () => {
  const referenced = new Set([...SMOKE, ...QUARANTINE, ...Object.values(IMPACT).flat()])
  assert.deepEqual([...new Set(specNames)].filter(s => !referenced.has(s)), [])
})

test('el mapa no nombra specs que no existen', () => {
  const existing = new Set(specNames)
  const named = [...SMOKE, ...QUARANTINE, ...Object.values(IMPACT).flat()]
  assert.deepEqual([...new Set(named)].filter(s => !existing.has(s)), [])
})
