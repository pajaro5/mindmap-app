// Fase 15 · Exportar a Word (.docx) y Markdown (.md)
const fs = require('fs')
const zlib = require('zlib')
const { test, expect, setupMap, SAMPLE_TREE } = require('./fixtures')

// Mapa con todo lo que se exporta: marcadores, tarea, vínculo, nota, llamada, rama contraída
// y textos con caracteres especiales
function richMap() {
  const data = JSON.parse(JSON.stringify(SAMPLE_TREE))
  const [alfa, beta, gamma] = data.root.children
  alfa.data.expand = false
  alfa.data.icon = ['priority_1', 'progress_4', 'flag_red']
  alfa.data.tag = [{ text: 'Urgente', style: { fill: '#c00000' } }]
  alfa.data._task = { start: '2026-03-02', due: '2026-03-09', resources: ['Ana', 'Juan'], milestone: true }
  alfa.children[0].children = [{ data: { text: 'Nivel 3' }, children: [{ data: { text: 'Nivel 4' }, children: [{ data: { text: 'Nivel 5' }, children: [{ data: { text: 'Nivel 6' }, children: [{ data: { text: 'Nivel 7' }, children: [] }] }] }] }] }]
  beta.data.hyperlink = 'https://ejemplo.com/a?b=1&c=2'
  beta.data.hyperlinkTitle = 'Web del proyecto'
  beta.data.note = 'Primera línea\nsegunda línea\n\nOtro párrafo'
  beta.data._callouts = [{ id: 'c1', text: 'Revisar con Ana', dx: 40, dy: -40 }]
  gamma.data.text = '<b>Gamma</b> & *cía* # 1. [x]'
  return data
}

async function download(page, action) {
  const [file] = await Promise.all([page.waitForEvent('download'), action()])
  return { name: file.suggestedFilename(), path: await file.path() }
}

// Lee un ZIP sin compresión (como los que genera la app) y comprueba cada CRC con zlib
function readStoredZip(buffer) {
  const files = {}
  let at = 0
  while (buffer.readUInt32LE(at) === 0x04034b50) {
    const method = buffer.readUInt16LE(at + 8)
    const crc = buffer.readUInt32LE(at + 14)
    const size = buffer.readUInt32LE(at + 18)
    const nameLen = buffer.readUInt16LE(at + 26)
    const extraLen = buffer.readUInt16LE(at + 28)
    const name = buffer.toString('utf8', at + 30, at + 30 + nameLen)
    const data = buffer.subarray(at + 30 + nameLen + extraLen, at + 30 + nameLen + extraLen + size)
    expect(method, `${name}: sin compresión`).toBe(0)
    expect(zlib.crc32(data), `${name}: CRC`).toBe(crc)
    files[name] = data.toString('utf8')
    at += 30 + nameLen + extraLen + size
  }
  // Directorio central y fin de archivo, con el número de entradas correcto
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  expect(end).toBeGreaterThan(0)
  expect(buffer.readUInt16LE(end + 10)).toBe(Object.keys(files).length)
  expect(buffer.readUInt32LE(end + 16)).toBe(at)
  return files
}

// XML bien formado (lo comprueba el analizador del navegador)
async function expectWellFormed(page, xml, name) {
  const error = await page.evaluate(text => {
    const doc = new DOMParser().parseFromString(text, 'application/xml')
    const err = doc.querySelector('parsererror')
    return err ? err.textContent : ''
  }, xml)
  expect(error, `${name} debe ser XML válido`).toBe('')
}

// Párrafos de document.xml como "Estilo|texto"
function docxParagraphs(xml) {
  return [...xml.matchAll(/<w:p>(.*?)<\/w:p>/g)].map(([, p]) => {
    const style = (p.match(/<w:pStyle w:val="([^"]+)"/) || [])[1]
    const text = [...p.matchAll(/<w:t[^>]*>(.*?)<\/w:t>|<w:br\/>/g)].map(m => m[1] === undefined ? '\n' : m[1]).join('')
    return `${style}|${text}`
  })
}

test.describe('Exportar a Markdown', () => {
  test('un título por nivel, listas por debajo del 6, marcadores, tarea, vínculo, notas y llamadas', async ({ page, maps }) => {
    const { app, map } = await setupMap(page, maps, { data: richMap() })
    const file = await download(page, () => app.clickRibbon('export', 'export.markdown'))
    expect(file.name).toBe(`${map.title}.md`)
    const md = fs.readFileSync(file.path, 'utf8')
    expect(md).toBe([
      '# Raíz',
      '## Alfa',
      '*Bandera roja · Urgente*',
      '*Prioridad 1 · 50 % completado · Inicio: 02/03/2026 · Vencimiento: 09/03/2026 · Hito · Recursos: Ana, Juan*',
      '### Alfa uno',
      '#### Nivel 3',
      '##### Nivel 4',
      '###### Nivel 5',
      '- **Nivel 6**',
      '  - **Nivel 7**',
      '## Beta',
      '[Web del proyecto](<https://ejemplo.com/a?b=1&c=2>)',
      'Primera línea  \nsegunda línea',
      'Otro párrafo',
      '> **Llamada:** Revisar con Ana',
      '## \\<b\\>Gamma\\</b\\> \\& \\*cía\\* # 1. \\[x\\]'
    ].join('\n\n') + '\n')
  })

  test('[Seguridad] el texto de los temas no puede inyectar HTML ni vínculos en el Markdown', async ({ page, maps }) => {
    const data = JSON.parse(JSON.stringify(SAMPLE_TREE))
    data.root.children[1].data.text = '<img src=x onerror=alert(1)>'
    data.root.children[1].data.note = '[clic](javascript:alert(1))'
    data.root.children[2].data.hyperlink = 'javascript:alert(1)'
    const { app } = await setupMap(page, maps, { data })
    const file = await download(page, () => app.clickRibbon('export', 'export.markdown'))
    const md = fs.readFileSync(file.path, 'utf8')
    expect(md).not.toMatch(/(^|[^\\])<img/)
    expect(md).toContain('\\[clic\\](javascript:alert(1))')
    // Un vínculo no permitido no se exporta (el mapa se sanea al abrirlo)
    // (un "\]" escapado no cierra ningún vínculo)
    expect(md).not.toMatch(/(^|[^\\])\]\(<?javascript:/m)
  })
})

test.describe('Exportar a Word', () => {
  test('genera un .docx válido: ZIP, XML bien formado, estilos de título y vínculos', async ({ page, maps }) => {
    const { app, map } = await setupMap(page, maps, { data: richMap() })
    const file = await download(page, () => app.clickRibbon('export', 'export.word'))
    expect(file.name).toBe(`${map.title}.docx`)
    const files = readStoredZip(fs.readFileSync(file.path))
    expect(Object.keys(files).sort()).toEqual([
      '[Content_Types].xml', '_rels/.rels', 'docProps/core.xml', 'word/_rels/document.xml.rels', 'word/document.xml', 'word/styles.xml'
    ])
    for (const [name, xml] of Object.entries(files)) await expectWellFormed(page, xml, name)

    expect(docxParagraphs(files['word/document.xml'])).toEqual([
      'Title|Raíz',
      'Heading1|Alfa',
      'TopicMeta|Bandera roja · Urgente',
      'TopicMeta|Prioridad 1 · 50 % completado · Inicio: 02/03/2026 · Vencimiento: 09/03/2026 · Hito · Recursos: Ana, Juan',
      'Heading2|Alfa uno',
      'Heading3|Nivel 3',
      'Heading4|Nivel 4',
      'Heading5|Nivel 5',
      'Heading6|Nivel 6',
      'Heading7|Nivel 7',
      'Heading1|Beta',
      'TopicMeta|Web del proyecto',
      'Normal|Primera línea\nsegunda línea',
      'Normal|Otro párrafo',
      'Callout|Llamada: Revisar con Ana',
      'Heading1|&lt;b&gt;Gamma&lt;/b&gt; &amp; *cía* # 1. [x]'
    ])
    // El vínculo es una relación externa del documento, con la URL escapada
    expect(files['word/document.xml']).toContain('<w:hyperlink r:id="rIdLink1">')
    expect(files['word/_rels/document.xml.rels']).toContain('Id="rIdLink1"')
    expect(files['word/_rels/document.xml.rels']).toContain('Target="https://ejemplo.com/a?b=1&amp;c=2" TargetMode="External"')
    // Todos los estilos usados están definidos
    const used = new Set([...files['word/document.xml'].matchAll(/w:val="([^"]+)"\/><\/w:pPr>/g)].map(m => m[1]))
    for (const style of used) expect(files['word/styles.xml'], `estilo ${style}`).toContain(`w:styleId="${style}"`)
    expect(files['docProps/core.xml']).toContain('<dc:title>')
  })

  test('caracteres de control y emojis no rompen el XML', async ({ page, maps }) => {
    const data = JSON.parse(JSON.stringify(SAMPLE_TREE))
    data.root.children[0].data.text = 'Con \u0001control\u0008 y emoji 🚀'
    const { app } = await setupMap(page, maps, { data })
    const file = await download(page, () => app.clickRibbon('export', 'export.word'))
    const files = readStoredZip(fs.readFileSync(file.path))
    await expectWellFormed(page, files['word/document.xml'], 'document.xml')
    expect(docxParagraphs(files['word/document.xml'])).toContain('Heading1|Con control y emoji 🚀')
  })

  test('los botones están en la pestaña Exportar y se desactivan sin mapa', async ({ app }) => {
    await app.ribbonTab('export').click()
    await expect(app.ribbonCmd('export', 'export.word')).toBeDisabled()
    await expect(app.ribbonCmd('export', 'export.markdown')).toBeDisabled()
  })
})
