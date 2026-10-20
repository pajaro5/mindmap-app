// Fase 18 · Pruebas pairwise (t=2): estilos rápidos de tema y pegado especial (un tema por
// línea). El oráculo está escrito aquí a mano, sin usar las funciones de la app.
const { test, expect, setupMap, SAMPLE_TREE } = require('./fixtures')
const { pairwise, missingPairs, chunk } = require('./pairwise')

const clone = o => JSON.parse(JSON.stringify(o))

// ---- Estilos rápidos: lo que debe quedar en el tema tras aplicar cada uno ----
const QUICK = {
  blue: { shape: 'roundedRectangle', fillColor: '#3d8fd8', borderColor: '#24609f', borderWidth: 1, color: '#ffffff', fontWeight: 'bold' },
  green: { shape: 'roundedRectangle', fillColor: '#7dc142', borderColor: '#57962a', borderWidth: 1, color: '#ffffff', fontWeight: 'bold' },
  orange: { shape: 'roundedRectangle', fillColor: '#f79646', borderColor: '#c55a11', borderWidth: 1, color: '#ffffff', fontWeight: 'bold' },
  red: { shape: 'rectangle', fillColor: '#c00000', borderColor: '#7f0000', borderWidth: 1, color: '#ffffff', fontWeight: 'bold' },
  note: { shape: 'rectangle', fillColor: '#fff2cc', borderColor: '#d6b656', borderWidth: 1, color: '#5c4a00', fontWeight: 'normal' },
  outline: { shape: 'roundedRectangle', fillColor: '#ffffff', borderColor: '#3d8fd8', borderWidth: 2, color: '#1f497d', fontWeight: 'bold' },
  lavender: { shape: 'roundedRectangle', fillColor: '#e5e0ec', borderColor: '#8064a2', borderWidth: 1, color: '#3f3151', fontWeight: 'bold' },
  plain: { shape: 'rectangle', fillColor: 'transparent', borderColor: 'transparent', borderWidth: 0, color: '#1e2a3a', fontWeight: 'normal' }
}
const LEVEL_TOPICS = { root: ['Raíz'], second: ['Beta', 'Gamma'], node: ['Alfa uno'] }

const STYLE_PARAMS = {
  style: Object.keys(QUICK),
  level: ['root', 'second', 'node'],
  theme: ['mindmanager', 'mm-night', 'mm-minimal'],
  preFill: [null, '#00b0f0'],
  multi: [false, true]
}
const STYLE_COMBOS = pairwise(STYLE_PARAMS)

// ---- Pegado especial: texto generado y árbol esperado ----
const INDENTS = { tab: '\t', two: '  ', four: '    ' }
const PASTE_PARAMS = {
  indent: Object.keys(INDENTS),
  bullet: ['', '- ', '* ', '• ', 'num'],
  depth: [1, 2, 3],
  eol: ['\n', '\r\n'],
  blankLines: [false, true],
  trailingSpaces: [false, true]
}
const PASTE_COMBOS = pairwise(PASTE_PARAMS)

function expectedTree(depth) {
  const leaf = text => ({ t: text, c: [] })
  const uno = depth === 1 ? leaf('Uno') : {
    t: 'Uno',
    c: [depth === 3 ? { t: 'Uno a', c: [leaf('Uno a i')] } : leaf('Uno a'), leaf('Uno b')]
  }
  return [uno, leaf('Dos')]
}

function outlineText(c) {
  const lines = []
  const write = (items, level) => items.forEach((item, i) => {
    const bullet = c.bullet === 'num' ? `${i + 1}. ` : c.bullet
    lines.push(INDENTS[c.indent].repeat(level) + bullet + item.t + (c.trailingSpaces ? '   ' : ''))
    if (c.blankLines && level === 0) lines.push('')
    write(item.c, level + 1)
  })
  write(expectedTree(c.depth), 0)
  return lines.join(c.eol)
}

test('los generadores cubren todos los pares', () => {
  expect(missingPairs(STYLE_PARAMS, STYLE_COMBOS)).toEqual([])
  expect(missingPairs(PASTE_PARAMS, PASTE_COMBOS)).toEqual([])
  expect(STYLE_COMBOS.length).toBeLessThanOrEqual(36) // mínimo 24 (8 × 3); exhaustivo 288
  expect(PASTE_COMBOS.length).toBeLessThanOrEqual(24) // mínimo 15 (5 × 3); exhaustivo 360
})

test.describe('pairwise: estilos rápidos y pegado especial', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'la combinatoria se prueba en Chromium; los escenarios, en los dos navegadores')

  chunk(STYLE_COMBOS, 2).forEach((combos, k) => {
    test(`estilos rápidos, bloque ${k + 1}: ${combos.length} combinaciones`, async ({ page, maps }) => {
      test.setTimeout(180000)
      const { app } = await setupMap(page, maps)
      for (const c of combos) {
        const topics = c.multi ? LEVEL_TOPICS[c.level] : LEVEL_TOPICS[c.level].slice(0, 1)
        await page.evaluate(({ c, topics }) => {
          const d = window.Alpine.$data(document.body)
          const mm = Alpine.raw(d.mindMap)
          d.setMapFormat({ theme: c.theme }, { reset: true })
          const strip = s => String(s).replace(/<[^>]+>/g, '').trim()
          const all = []
          const walk = n => { all.push(n); (n.children || []).forEach(walk) }
          walk(mm.renderer.root)
          const nodes = all.filter(n => topics.includes(strip(n.getData('text'))))
          // Partir de un tema limpio (o con un relleno propio, que el estilo debe sustituir)
          nodes.forEach(n => mm.renderer.removeCustomStyles(n))
          if (c.preFill) nodes.forEach(n => mm.renderer.setNodeStyles(n, { fillColor: c.preFill, gradientStyle: false }))
          mm.renderer.clearActiveNodeList()
          mm.renderer.activeMultiNode(nodes)
          d.activeNodeList = [...mm.renderer.activeNodeList]
          d.runCommand('style.quick', c.style)
        }, { c, topics })
        const want = topics.map(() => ({ ...QUICK[c.style], gradientStyle: false, painted: QUICK[c.style].fillColor, current: c.style }))
        await expect.poll(() => page.evaluate(({ topics, keys }) => {
          const d = window.Alpine.$data(document.body)
          const mm = Alpine.raw(d.mindMap)
          const strip = s => String(s).replace(/<[^>]+>/g, '').trim()
          const all = []
          const walk = n => { all.push(n); (n.children || []).forEach(walk) }
          walk(mm.renderer.root)
          return topics.map(t => {
            const n = all.find(x => strip(x.getData('text')) === t)
            if (!n || !n.shapeNode) return null
            const o = Object.fromEntries(keys.map(k => [k, n.getData(k)]))
            o.gradientStyle = n.getData('gradientStyle')
            o.painted = n.shapeNode.node.getAttribute('fill')
            o.current = d.currentValueOf('style.quick')
            return o
          })
        }, { topics, keys: Object.keys(QUICK[c.style]) }), { message: JSON.stringify(c) }).toEqual(want)
      }
    })
  })

  test(`pegado especial: ${PASTE_COMBOS.length} combinaciones`, async ({ page, maps }) => {
    test.setTimeout(180000)
    const data = clone(SAMPLE_TREE)
    const { app } = await setupMap(page, maps, { data })
    await app.selectNode('Beta')
    for (const c of PASTE_COMBOS) {
      const text = outlineText(c)
      const before = (await app.tree()).c[1].c.length
      await page.evaluate(text => {
        const d = window.Alpine.$data(document.body)
        d.pasteSpecialText(text, 'lines')
      }, text)
      await expect.poll(async () => (await app.tree()).c[1].c.slice(before), { message: JSON.stringify(c) }).toEqual(expectedTree(c.depth))
    }
  })
})
