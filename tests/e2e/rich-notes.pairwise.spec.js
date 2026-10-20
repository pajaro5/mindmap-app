// Fase 21 · Pruebas pairwise (t=2) de las notas con formato: estilos de texto × contenedor
// (párrafos o listas) × vínculo × caracteres especiales × número de líneas. Para cada
// combinación se comprueba el texto plano, el Markdown exportado y que el saneado deja el
// HTML igual. El oráculo está escrito aquí a mano, sin usar las funciones de la app.
const { test, expect, setupMap } = require('./fixtures')
const { pairwise, missingPairs } = require('./pairwise')

const PARAMS = {
  bold: [false, true],
  italic: [false, true],
  underline: [false, true],
  strike: [false, true],
  container: ['p', 'ul', 'ol'],
  link: [null, 'https://ejemplo.com/a?b=1', 'mailto:x@y.es'],
  special: ['', '<&>*_'],
  lines: [1, 2]
}
const COMBOS = pairwise(PARAMS)
const WORDS = ['Uno', 'Dos']

const escHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escMd = s => s.replace(/[\\`*_[\]<>|~&]/g, '\\$&')

function build(c) {
  const lines = WORDS.slice(0, c.lines).map(w => w + c.special)
  const wrapHtml = text => {
    let h = escHtml(text)
    if (c.strike) h = `<s>${h}</s>`
    if (c.underline) h = `<u>${h}</u>`
    if (c.italic) h = `<i>${h}</i>`
    if (c.bold) h = `<b>${h}</b>`
    if (c.link) h = `<a href="${escHtml(c.link)}" target="_blank" rel="noopener noreferrer">${h}</a>`
    return h
  }
  const wrapMd = text => {
    let m = escMd(text)
    if (c.strike) m = `~~${m}~~`
    if (c.italic) m = `*${m}*`
    if (c.bold) m = `**${m}**`
    if (c.link) m = `[${m}](<${c.link}>)`
    return m
  }
  const html = c.container === 'p'
    ? lines.map(l => `<p>${wrapHtml(l)}</p>`).join('')
    : `<${c.container}>${lines.map(l => `<li>${wrapHtml(l)}</li>`).join('')}</${c.container}>`
  const prefix = i => c.container === 'ul' ? '- ' : c.container === 'ol' ? `${i + 1}. ` : ''
  return {
    html,
    text: lines.map((l, i) => prefix(i) + l).join('\n'),
    markdown: c.container === 'p'
      ? lines.map(wrapMd).join('\n\n')
      : lines.map((l, i) => prefix(i) + wrapMd(l)).join('\n'),
    formatted: c.bold || c.italic || c.underline || c.strike || !!c.link || c.container !== 'p'
  }
}

test('el generador cubre todos los pares', () => {
  expect(missingPairs(PARAMS, COMBOS)).toEqual([])
  expect(COMBOS.length).toBeLessThanOrEqual(14) // mínimo 9 (contenedor 3 × vínculo 3); exhaustivo 576
})

test.describe('pairwise: notas con formato', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'la combinatoria se prueba en Chromium; los escenarios, en los dos navegadores')

  test(`${COMBOS.length} combinaciones`, async ({ page, maps }) => {
    test.setTimeout(120000)
    const { app } = await setupMap(page, maps)
    await app.selectNode('Beta')
    for (const c of COMBOS) {
      const want = build(c)
      // Se guarda como lo haría el editor y se exporta el mapa entero
      const got = await page.evaluate(html => {
        const d = window.Alpine.$data(document.body)
        const mm = Alpine.raw(d.mindMap)
        const beta = mm.renderer.root.children[1]
        mm.renderer.setNodeDataRender(beta, noteDataFromHtml(html))
        const topic = mapDocument(mm.getData(false)).find(t => t.lines[0] === 'Beta')
        return {
          html: sanitizeNoteHtml(html),
          text: beta.getData('note'),
          stored: beta.getData('_noteHtml') !== undefined,
          markdown: buildMarkdown([topic]).split('\n\n').slice(1).join('\n\n').trim()
        }
      }, want.html)
      expect(got, JSON.stringify(c)).toEqual({ html: want.html, text: want.text, stored: want.formatted, markdown: want.markdown })
    }
  })
})
