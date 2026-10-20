// Fase 24 · Pruebas pairwise (t=2) de las opciones de exportación: formato × cada opción de
// "qué incluir" × numeración. El oráculo (qué textos deben aparecer) está escrito aquí a mano
// para un mapa conocido.
const { test, expect, setupMap, SAMPLE_TREE } = require('./fixtures')
const { pairwise, missingPairs } = require('./pairwise')

const PARAMS = {
  format: ['md', 'docx'],
  notes: [true, false],
  markers: [true, false],
  task: [true, false],
  links: [true, false],
  callouts: [true, false],
  extras: [true, false],
  numbering: [false, true]
}
const COMBOS = pairwise(PARAMS)

// Qué texto delata cada parte del documento
const PROBES = {
  notes: 'Nota de Beta',
  markers: 'Bandera roja',
  task: 'Prioridad 1',
  links: 'Web del proyecto',
  callouts: 'Llamada de Beta',
  extras: 'informe.pdf'
}

function map() {
  const data = JSON.parse(JSON.stringify(SAMPLE_TREE))
  const [alfa, beta] = data.root.children
  alfa.data.icon = ['priority_1', 'flag_red']
  alfa.data._task = { start: '2026-03-02' }
  beta.data.hyperlink = 'https://ejemplo.com/'
  beta.data.hyperlinkTitle = 'Web del proyecto'
  beta.data.note = 'Nota de Beta'
  beta.data._callouts = [{ id: 'c1', text: 'Llamada de Beta', dx: 40, dy: -40 }]
  beta.data.attachmentUrl = '/api/files/123e4567-e89b-12d3-a456-426614174000'
  beta.data.attachmentName = 'informe.pdf'
  return data
}

test('el generador cubre todos los pares', () => {
  expect(missingPairs(PARAMS, COMBOS)).toEqual([])
  expect(COMBOS.length).toBeLessThanOrEqual(10) // mínimo 4; exhaustivo 256
})

test.describe('pairwise: opciones de exportación', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'la combinatoria se prueba en Chromium; los escenarios, en los dos navegadores')

  test(`${COMBOS.length} combinaciones`, async ({ page, maps }) => {
    test.setTimeout(120000)
    await setupMap(page, maps, { data: map() })
    for (const c of COMBOS) {
      const options = { notes: c.notes, markers: c.markers, task: c.task, links: c.links, callouts: c.callouts, extras: c.extras, numbering: c.numbering, images: true }
      // El texto del documento tal como sale para el formato (Markdown, o el XML de Word)
      const text = await page.evaluate(({ format, options }) => {
        const mm = Alpine.raw(window.Alpine.$data(document.body).mindMap)
        const iconLabel = id => (window.Alpine.$data(document.body).iconById[id] || {}).label || id
        const topics = mapDocument(mm.getData(false), { iconLabel, options })
        return format === 'md' ? buildMarkdown(topics) : buildDocxDocument(topics).xml
      }, { format: c.format, options })
      const present = Object.fromEntries(Object.entries(PROBES).map(([k, probe]) => [k, text.includes(probe)]))
      const numbered = c.format === 'md' ? text.includes('## 2. Beta') : text.includes('>2. Beta<')
      expect({ ...present, numbered }, JSON.stringify(c)).toEqual({
        notes: c.notes, markers: c.markers, task: c.task, links: c.links, callouts: c.callouts, extras: c.extras, numbered: c.numbering
      })
    }
  })
})
