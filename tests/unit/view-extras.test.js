// Vista: filtros guardados (view-extras.js) y buscar en marcadores (search-filter.js).
// Combinaciones pairwise t=2 con el oráculo escrito aquí.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { loadApp } = require('./load-app')
const { pairwise, missingPairs } = require('../e2e/pairwise')

const app = loadApp()
const plain = value => JSON.parse(JSON.stringify(value))
const EMPTY = { mode: 'all', text: '', icons: [], tags: [], resources: [], status: '', withSubtopics: false }

// ---- normalizeFilter ----
const FILTER_PARAMS = {
  mode: ['all', 'any', 'otro', undefined],
  text: ['', 'informe', 'x'.repeat(250), 5],
  icons: [undefined, ['flag_red'], ['<b>', 'flag_red', 3], 'flag_red'],
  status: ['', 'done', 'overdue', 'inventado'],
  withSubtopics: [true, false, 'true']
}
const FILTER_COMBOS = pairwise(FILTER_PARAMS)

test(`normalizeFilter: ${FILTER_COMBOS.length} combinaciones (modo × texto × iconos × estado × subtemas)`, () => {
  assert.deepEqual(missingPairs(FILTER_PARAMS, FILTER_COMBOS), [])
  for (const c of FILTER_COMBOS) {
    const raw = { mode: c.mode, text: c.text, icons: c.icons, status: c.status, withSubtopics: c.withSubtopics, tags: [' Urgente ', '', 7], resources: 'Ana' }
    const want = {
      mode: c.mode === 'any' ? 'any' : 'all',
      text: typeof c.text === 'string' ? c.text.slice(0, 200) : '',
      icons: Array.isArray(c.icons) ? c.icons.filter(i => i === 'flag_red') : [],
      tags: ['Urgente'],
      resources: [],
      status: ['done', 'overdue'].includes(c.status) ? c.status : '',
      withSubtopics: c.withSubtopics === true
    }
    assert.deepEqual(plain(app.normalizeFilter(raw)), want, JSON.stringify(c))
  }
  for (const bad of [null, undefined, 'x', [], 3]) assert.deepEqual(plain(app.normalizeFilter(bad)), EMPTY)
})

// ---- normalizeSavedFilters y withSavedFilter ----
test('normalizeSavedFilters: descarta lo inválido, los inactivos y los nombres repetidos', () => {
  const got = plain(app.normalizeSavedFilters([
    { name: '  Urgentes ', filter: { tags: ['Urgente'] } },
    { name: 'urgentes', filter: { tags: ['Otro'] } }, // repetido (sin distinguir mayúsculas)
    { name: 'Vacío', filter: {} },                   // inactivo
    { name: '', filter: { tags: ['x'] } },
    { name: 5, filter: { tags: ['x'] } },
    'basura', null,
    { name: 'Iconos raros', filter: { icons: ['<b>'], status: 'x' } }, // queda inactivo
    { name: 'n'.repeat(80), filter: { text: 'hola' } }
  ]))
  assert.deepEqual(got.map(f => f.name), ['Urgentes', 'n'.repeat(60)])
  assert.deepEqual(got[0].filter, { ...EMPTY, tags: ['Urgente'] })
  assert.deepEqual(plain(app.normalizeSavedFilters('x')), [])
})

test('normalizeSavedFilters: como mucho 30', () => {
  const many = Array.from({ length: 35 }, (_, i) => ({ name: `F${i}`, filter: { text: `t${i}` } }))
  assert.equal(app.normalizeSavedFilters(many).length, 30)
})

test('withSavedFilter: añade al final o sustituye el del mismo nombre', () => {
  const list = app.normalizeSavedFilters([{ name: 'A', filter: { text: 'a' } }, { name: 'B', filter: { text: 'b' } }])
  assert.deepEqual(plain(app.withSavedFilter(list, ' C ', { text: 'c' })).map(f => f.name), ['A', 'B', 'C'])
  const replaced = plain(app.withSavedFilter(list, 'a', { text: 'nuevo' }))
  assert.deepEqual(replaced.map(f => [f.name, f.filter.text]), [['B', 'b'], ['a', 'nuevo']])
})

// ---- Buscar en marcadores ----
const SEARCH_PARAMS = {
  where: ['text', 'note', 'tag', 'icon', 'none'],
  includeNotes: [false, true],
  includeMarkers: [false, true],
  matchCase: [false, true],
  query: ['bandera', 'Bandera']
}
const SEARCH_COMBOS = pairwise(SEARCH_PARAMS)

test(`topicMatchesQuery: ${SEARCH_COMBOS.length} combinaciones (dónde × notas × marcadores × mayúsculas × consulta)`, () => {
  assert.deepEqual(missingPairs(SEARCH_PARAMS, SEARCH_COMBOS), [])
  const labels = { flag_red: 'Bandera roja' }
  for (const c of SEARCH_COMBOS) {
    const data = { text: 'Tema' }
    if (c.where === 'text') data.text = 'Bandera del tema'
    if (c.where === 'note') data.note = 'una Bandera en la nota'
    if (c.where === 'tag') data.tag = [{ text: 'Bandera azul', style: { fill: '#000000' } }]
    if (c.where === 'icon') data.icon = ['flag_red']
    const options = { includeNotes: c.includeNotes, includeMarkers: c.includeMarkers, matchCase: c.matchCase, iconLabel: id => labels[id] || id }
    // Oráculo: todos los textos de ejemplo llevan "Bandera" con mayúscula
    const caseOk = !c.matchCase || c.query === 'Bandera'
    const reachable = c.where === 'text' || (c.where === 'note' && c.includeNotes) || (['tag', 'icon'].includes(c.where) && c.includeMarkers)
    assert.equal(app.topicMatchesQuery(data, c.query, options), reachable && caseOk, JSON.stringify(c))
  }
})
