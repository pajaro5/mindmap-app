// Fase 23 · Pruebas pairwise (t=2) del filtro: criterios combinados × modo × subtemas, y
// cada combinación guardada con nombre y vuelta a aplicar. El oráculo (qué temas cumplen)
// está escrito aquí a mano sobre un mapa conocido, sin usar las funciones de la app.
const { test, expect, setupMap } = require('./fixtures')
const { pairwise, missingPairs } = require('./pairwise')

// Mapa conocido y, para cada tema, lo que tiene
const TOPICS = {
  'Raíz': { parent: null, text: 'Raíz', note: '', icons: [], tags: [], resources: [], progress: 0, dated: false },
  'A': { parent: 'Raíz', text: 'A', note: '', icons: ['flag_red'], tags: ['Urgente'], resources: ['Ana'], progress: 0, dated: false },
  'A1': { parent: 'A', text: 'informe', note: 'presupuesto anual', icons: [], tags: [], resources: [], progress: 0, dated: false },
  'B': { parent: 'Raíz', text: 'B', note: '', icons: ['priority_1', 'progress_8'], tags: ['Revisar'], resources: [], progress: 100, dated: false },
  'B1': { parent: 'B', text: 'B1', note: '', icons: [], tags: ['Urgente'], resources: [], progress: 0, dated: false },
  'C': { parent: 'Raíz', text: 'C', note: '', icons: [], tags: [], resources: ['Luis'], progress: 0, dated: true },
  'C1': { parent: 'C', text: 'C1', note: '', icons: [], tags: [], resources: [], progress: 0, dated: false }
}
const childrenOf = name => Object.keys(TOPICS).filter(k => TOPICS[k].parent === name)
function treeData(name) {
  const t = TOPICS[name]
  const data = { text: t.text }
  if (t.note) data.note = t.note
  if (t.icons.length) data.icon = t.icons
  if (t.tags.length) data.tag = t.tags
  if (t.resources.length || t.dated) data._task = { ...(t.resources.length ? { resources: t.resources } : {}), ...(t.dated ? { start: '2026-01-05' } : {}) }
  return { data, children: childrenOf(name).map(treeData) }
}
const MAP = { layout: 'logicalStructure', root: treeData('Raíz'), theme: { template: 'mindmanager', config: {} }, view: {} }

const PARAMS = {
  // Estrategia t=2: el navegador es un parámetro más (cada proyecto ejecuta sus filas)
  browser: ['chromium', 'firefox'],
  text: ['', 'informe', 'presupuesto'],
  icon: [null, 'flag_red', 'priority_1'],
  tag: [null, 'Urgente', 'Revisar'],
  resource: [null, 'Ana', 'Luis'],
  status: ['', 'done', 'pending', 'dated'],
  mode: ['all', 'any'],
  withSubtopics: [false, true]
}
const COMBOS = pairwise(PARAMS)

const filterOf = c => ({
  mode: c.mode, text: c.text, icons: c.icon ? [c.icon] : [], tags: c.tag ? [c.tag] : [],
  resources: c.resource ? [c.resource] : [], status: c.status, withSubtopics: c.withSubtopics
})

// Temas atenuados según el oráculo
function expectedDimmed(c) {
  const fold = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const matches = name => {
    const t = TOPICS[name]
    const checks = []
    if (c.text) checks.push(fold(t.text).includes(fold(c.text)) || fold(t.note).includes(fold(c.text)))
    if (c.icon) checks.push(t.icons.includes(c.icon))
    if (c.tag) checks.push(t.tags.includes(c.tag))
    if (c.resource) checks.push(t.resources.includes(c.resource))
    if (c.status === 'done') checks.push(t.progress >= 100)
    if (c.status === 'pending') checks.push(t.progress < 100)
    if (c.status === 'dated') checks.push(t.dated)
    if (!checks.length) return null // filtro inactivo
    return c.mode === 'any' ? checks.some(Boolean) : checks.every(Boolean)
  }
  if (matches('Raíz') === null) return []
  const visible = new Set(['Raíz'])
  const ancestorsOf = name => { const out = []; for (let p = TOPICS[name].parent; p; p = TOPICS[p].parent) out.push(p); return out }
  for (const name of Object.keys(TOPICS)) {
    if (matches(name)) {
      visible.add(name)
      ancestorsOf(name).forEach(a => visible.add(a))
    } else if (c.withSubtopics && ancestorsOf(name).some(a => matches(a))) {
      visible.add(name)
    }
  }
  return Object.keys(TOPICS).filter(n => !visible.has(n)).map(n => TOPICS[n].text).sort()
}

const dimmedTexts = page => page.evaluate(() => [...document.querySelectorAll('#mindMapContainer .smm-node.smm-filter-dim')]
  .map(el => (el.querySelector('foreignObject') || el).textContent.trim()).sort())

test('el generador cubre todos los pares', () => {
  expect(missingPairs(PARAMS, COMBOS)).toEqual([])
  expect(COMBOS.length).toBeLessThanOrEqual(22) // mínimo 12 (estado 4 × texto, icono, marcador o recurso 3); exhaustivo 3888
  for (const b of PARAMS.browser) expect(COMBOS.some(c => c.browser === b)).toBe(true)
})

test.describe('pairwise: filtro × filtro guardado', () => {
  test('filas de este navegador', async ({ page, maps }, testInfo) => {
      test.setTimeout(180000)
      const k = testInfo.project.name
      await setupMap(page, maps, { data: MAP })
      for (const [i, c] of COMBOS.filter(r => r.browser === testInfo.project.name).entries()) {
        const want = expectedDimmed(c)
        await page.evaluate(f => { window.Alpine.$data(document.body).filter = f }, filterOf(c))
        await expect.poll(() => dimmedTexts(page), { message: JSON.stringify(c) }).toEqual(want)
        // Guardar con nombre, quitar el filtro y volver a aplicarlo da lo mismo
        // Sin ningún criterio el filtro no está activo y no se puede guardar
        if (!(c.text || c.icon || c.tag || c.resource || c.status)) continue
        const name = `F${k}-${i}`
        await page.evaluate(name => window.Alpine.$data(document.body).saveCurrentFilter(name), name)
        await page.evaluate(() => window.Alpine.$data(document.body).clearFilter())
        await expect.poll(() => dimmedTexts(page)).toEqual([])
        await page.evaluate(name => window.Alpine.$data(document.body).applySavedFilter(name), name)
        await expect.poll(() => dimmedTexts(page), { message: `guardado ${JSON.stringify(c)}` }).toEqual(want)
      }
  })
})
