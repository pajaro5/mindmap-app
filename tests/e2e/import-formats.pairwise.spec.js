// Fase 22 · Importar mapas de FreeMind (.mm) y MindManager (.mmap). Pruebas pairwise (t=2) con
// el navegador como parámetro: cada proyecto ejecuta sus filas. Los archivos se generan aquí
// y el oráculo está escrito a mano. Cada fila pasa por la importación real de la app
// (importMapFile: convertir, resolver archivos, crear el mapa, subir adjuntos y abrirlo).
const { test, expect, AppPage } = require('./fixtures')
const { pairwise, missingPairs } = require('./pairwise')
const { makeZip } = require('./zip')

const BROWSERS = ['chromium', 'firefox']

// ---- FreeMind ----
const MM_PARAMS = {
  browser: BROWSERS,
  encoding: ['utf8', 'latin1', 'entities'],
  textSource: ['attr', 'richcontent'],
  note: ['none', 'html', 'plain'],
  folded: [false, true],
  link: ['none', 'web', 'internal', 'file'],
  icons: ['none', 'known', 'unknown', 'exclusive'],
  arrow: ['none', 'valid', 'dangling'],
  depth: [1, 3]
}
const MM_COMBOS = pairwise(MM_PARAMS)

// ---- MindManager ----
const MMAP_PARAMS = {
  browser: BROWSERS,
  notes: ['none', 'xhtml', 'preview'],
  task: ['none', 'full', 'percent'],
  icons: ['none', 'known', 'unknown'],
  extras: ['none', 'callout', 'floating', 'boundary', 'labels'],
  media: ['none', 'image', 'attachment', 'missingImage'],
  relation: ['none', 'valid', 'dangling'],
  collapsed: [false, true]
}
const MMAP_COMBOS = pairwise(MMAP_PARAMS)

test('los generadores cubren todos los pares', () => {
  expect(missingPairs(MM_PARAMS, MM_COMBOS)).toEqual([])
  expect(missingPairs(MMAP_PARAMS, MMAP_COMBOS)).toEqual([])
  expect(MM_COMBOS.length).toBeLessThanOrEqual(24) // mínimo 16 (4 × 4); exhaustivo 5184
  expect(MMAP_COMBOS.length).toBeLessThanOrEqual(30) // mínimo 20 (5 × 4); exhaustivo 6480
})

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function freeMindFile(c, stem) {
  const tema = 'Tema ñandú'
  const textOf = t => c.encoding === 'entities' ? t.replace(/[^\x00-\x7f]/g, ch => `&#x${ch.charCodeAt(0).toString(16)};`) : t
  const attrs = []
  if (c.textSource === 'attr') attrs.push(`TEXT="${textOf(tema)}"`)
  if (c.folded) attrs.push('FOLDED="true"')
  if (c.link === 'web') attrs.push('LINK="https://ejemplo.com/x?a=1&amp;b=2"')
  if (c.link === 'internal') attrs.push('LINK="#ID_dest"')
  if (c.link === 'file') attrs.push('LINK="file:///C:/docs/x.doc"')
  const inner = []
  if (c.textSource === 'richcontent') inner.push(`<richcontent TYPE="NODE"><html><head/><body><p>${textOf(tema)}</p></body></html></richcontent>`)
  if (c.note === 'html') inner.push('<richcontent TYPE="NOTE"><html><head/><body><p><b>Clave</b> uno</p><ul><li>a</li></ul></body></html></richcontent>')
  if (c.note === 'plain') inner.push('<richcontent TYPE="NOTE">texto simple</richcontent>')
  const icons = { none: [], known: ['idea', 'full-2'], unknown: ['penguin'], exclusive: ['full-1', 'full-3', 'flag', 'flag-green'] }[c.icons]
  icons.forEach(i => inner.push(`<icon BUILTIN="${i}"/>`))
  if (c.arrow !== 'none') inner.push(`<arrowlink DESTINATION="${c.arrow === 'valid' ? 'ID_dest' : 'ID_nada'}"/>`)
  if (c.depth === 3) inner.push('<node TEXT="Nieto" ID="ID_n"><node TEXT="Bisnieto" ID="ID_b"/></node>')
  const decl = c.encoding === 'latin1' ? '<?xml version="1.0" encoding="ISO-8859-1"?>' : ''
  const xml = `${decl}<map version="1.0.1"><node TEXT="Raíz" ID="ID_root">` +
    `<node ID="ID_tema" ${attrs.join(' ')}>${inner.join('')}</node>` +
    '<node TEXT="Destino" ID="ID_dest"/></node></map>'
  const xmlFinal = c.encoding === 'entities' ? xml.replace('Raíz', 'Ra&#xed;z') : xml
  return { name: `${stem}.mm`, mimeType: 'application/xml', buffer: Buffer.from(xmlFinal, c.encoding === 'latin1' ? 'latin1' : 'utf8') }
}

function freeMindExpected(c) {
  const warnings = []
  const tema = { text: 'Tema ñandú' }
  if (c.folded) tema.expand = false
  if (c.note === 'html') Object.assign(tema, { note: 'Clave uno\n- a', _noteHtml: '<p><b>Clave</b> uno</p><ul><li>a</li></ul>' })
  if (c.note === 'plain') tema.note = 'texto simple'
  if (c.link === 'web') tema.hyperlink = 'https://ejemplo.com/x?a=1&b=2'
  if (c.link === 'internal') tema.hyperlink = 'topic:<Destino>'
  if (c.link === 'file') warnings.push('Vínculos a archivos locales')
  const icons = { none: undefined, known: ['symbol_idea', 'priority_2'], unknown: undefined, exclusive: ['priority_1', 'flag_red'] }[c.icons]
  if (icons) tema.icon = icons
  if (c.icons === 'unknown') warnings.push('Iconos sin equivalente')
  if (c.arrow === 'valid') tema.associativeLineTargets = ['<Destino>']
  return { tema, children: c.depth === 3 ? ['Nieto'] : [], warnings }
}

const MMAP_NS = 'xmlns:ap="http://schemas.mindjet.com/MindManager/Application/2003" xmlns:cor="http://schemas.mindjet.com/MindManager/Core/2003" xmlns:xhtml="http://www.w3.org/1999/xhtml"'

function mindManagerFile(c, stem, png) {
  const parts = ['<ap:Text PlainText="Tema"/>']
  if (c.collapsed) parts.push('<ap:TopicViewGroup><ap:Collapsed Collapsed="true"/></ap:TopicViewGroup>')
  if (c.notes === 'xhtml') parts.push('<ap:NotesGroup><ap:NotesXhtmlData PreviewPlainText="Clave uno"><xhtml:html><xhtml:p><xhtml:b>Clave</xhtml:b> uno</xhtml:p></xhtml:html></ap:NotesXhtmlData></ap:NotesGroup>')
  if (c.notes === 'preview') parts.push('<ap:NotesGroup><ap:NotesXhtmlData PreviewPlainText="Solo vista previa"/></ap:NotesGroup>')
  if (c.task === 'full') parts.push('<ap:Task TaskPriority="urn:mindjet:Prio2" TaskPercentage="50" StartDate="2026-03-02T08:00:00" DueDate="2026-03-09T17:00:00" Resources="Ana; Juan" Milestone="true"/>')
  if (c.task === 'percent') parts.push('<ap:Task TaskPercentage="100"/>')
  const icon = { none: null, known: ['urn:mindjet:FlagGreen', 'urn:mindjet:SmileyHappy'], unknown: ['urn:mindjet:Wombat'] }[c.icons]
  if (icon) parts.push(`<ap:IconsGroup><ap:Icons>${icon.map(t => `<ap:Icon IconType="${t}"/>`).join('')}</ap:Icons></ap:IconsGroup>`)
  if (c.extras === 'callout') parts.push('<ap:Callouts><ap:Topic><ap:Text PlainText="Ojo aquí"/></ap:Topic></ap:Callouts>')
  if (c.extras === 'boundary') parts.push('<ap:Boundary/>')
  if (c.extras === 'labels') parts.push('<ap:TextLabels><ap:TextLabel TextLabelName="Clave"/><ap:TextLabel TextLabelName="Examen"/></ap:TextLabels>')
  if (c.media === 'image') parts.push('<ap:Image><ap:ImageData><cor:Uri>mmarch://bin/img.png</cor:Uri></ap:ImageData></ap:Image>')
  if (c.media === 'missingImage') parts.push('<ap:Image><ap:ImageData><cor:Uri>mmarch://bin/nada.png</cor:Uri></ap:ImageData></ap:Image>')
  if (c.media === 'attachment') parts.push('<ap:Attachments><ap:Attachment FileName="guía.pdf"><ap:AttachmentData><cor:Uri>mmarch://bin/doc.pdf</cor:Uri></ap:AttachmentData></ap:Attachment></ap:Attachments>')
  const floating = c.extras === 'floating' ? '<ap:FloatingTopics><ap:Topic OId="F"><ap:Text PlainText="Flotante"/></ap:Topic></ap:FloatingTopics>' : ''
  const rel = c.relation === 'none' ? '' : '<ap:Relationships><ap:Relationship>' +
    '<ap:ConnectionGroup Index="1"><ap:Connection><ap:ObjectReference OIdRef="' + (c.relation === 'valid' ? 'D' : 'ZZ') + '"/></ap:Connection></ap:ConnectionGroup>' +
    '<ap:ConnectionGroup Index="0"><ap:Connection><ap:ObjectReference OIdRef="T"/></ap:Connection></ap:ConnectionGroup></ap:Relationship></ap:Relationships>'
  const xml = `<?xml version="1.0" encoding="UTF-8"?><ap:Map ${MMAP_NS}><ap:OneTopic><ap:Topic OId="R"><ap:SubTopics>` +
    `<ap:Topic OId="T">${parts.join('')}</ap:Topic><ap:Topic OId="D"><ap:Text PlainText="Destino"/></ap:Topic>` +
    `</ap:SubTopics>${floating}<ap:Text PlainText="Central &amp; más"/></ap:Topic></ap:OneTopic>${rel}</ap:Map>`
  const files = [{ name: 'Document.xml', data: xml }, { name: 'xsd/MindManagerApplication.xsd', data: '<xs/>' }]
  if (c.media === 'image') files.push({ name: 'bin/img.png', data: png })
  if (c.media === 'attachment') files.push({ name: 'bin/doc.pdf', data: '%PDF importado' })
  return { name: `${stem}.mmap`, mimeType: 'application/octet-stream', buffer: makeZip(files, { deflate: true }) }
}

function mindManagerExpected(c) {
  const warnings = []
  const tema = { text: 'Tema' }
  if (c.collapsed) tema.expand = false
  if (c.notes === 'xhtml') Object.assign(tema, { note: 'Clave uno', _noteHtml: '<p><b>Clave</b> uno</p>' })
  if (c.notes === 'preview') tema.note = 'Solo vista previa'
  let icons = { none: [], known: ['flag_green', 'face_happy'], unknown: [] }[c.icons]
  if (c.icons === 'unknown') warnings.push('Iconos sin equivalente')
  if (c.task === 'full') {
    icons = [...icons, 'priority_2', 'progress_4']
    tema._task = { start: '2026-03-02', due: '2026-03-09', milestone: true, resources: ['Ana', 'Juan'] }
  }
  if (c.task === 'percent') icons = [...icons, 'progress_8']
  if (icons.length) tema.icon = icons
  if (c.extras === 'callout') tema._callouts = ['Ojo aquí']
  if (c.extras === 'boundary') warnings.push('Límites')
  if (c.extras === 'floating') warnings.push('Temas flotantes')
  if (c.extras === 'labels') tema.tag = ['Clave', 'Examen']
  if (c.relation === 'valid') tema.associativeLineTargets = ['<Destino>']
  if (c.relation === 'dangling') warnings.push('Relaciones con temas que no existen')
  if (c.media === 'missingImage') warnings.push('Falta la imagen "bin/nada.png"')
  return { tema, rootChildren: ['Tema', 'Destino', ...(c.extras === 'floating' ? ['Flotante'] : [])], warnings }
}

// Lo que hay que comparar de un tema importado, con los uid sustituidos por el texto del tema
const topicSummary = (page, text) => page.evaluate(text => {
  const d = window.Alpine.$data(document.body)
  const strip = s => String(s || '').replace(/<[^>]+>/g, '').trim()
  const all = []
  const walk = n => { all.push(n); (n.children || []).forEach(walk) }
  walk(Alpine.raw(d.mindMap).getData(false))
  const byUid = Object.fromEntries(all.map(n => [n.data.uid, strip(n.data.text)]))
  const node = all.find(n => strip(n.data.text) === text)
  if (!node) return null
  const x = node.data
  const out = { text: strip(x.text) }
  if (x.expand === false) out.expand = false
  for (const k of ['note', '_noteHtml', 'icon', '_task']) if (x[k] !== undefined && !(Array.isArray(x[k]) && !x[k].length)) out[k] = x[k]
  if (x.hyperlink) out.hyperlink = x.hyperlink.startsWith('topic:') ? `topic:<${byUid[x.hyperlink.slice(6)]}>` : x.hyperlink
  if (x.associativeLineTargets && x.associativeLineTargets.length) out.associativeLineTargets = x.associativeLineTargets.map(u => `<${byUid[u]}>`)
  if (x._callouts) out._callouts = x._callouts.map(c => c.text)
  if (x.tag && x.tag.length) out.tag = x.tag.map(t => t.text)
  return { summary: out, children: (node.children || []).map(n => strip(n.data.text)), rootChildren: all[0].children.map(n => strip(n.data.text)) }
}, text)

async function importFile(page, file) {
  const before = await page.evaluate(() => window.Alpine.$data(document.body).currentId)
  await page.evaluate(({ name, type, b64 }) => {
    const bytes = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0))
    window.Alpine.$data(document.body).importMapFile(new File([bytes], name, { type }))
  }, { name: file.name, type: file.mimeType, b64: file.buffer.toString('base64') })
  await expect.poll(() => page.evaluate(prev => {
    const d = window.Alpine.$data(document.body)
    if (d.errorMsg) return `error: ${d.errorMsg}`
    return !d.fileBusy && d.currentId && d.currentId !== prev && d.mindMap && d.mindMapId === d.currentId ? 'ok' : 'esperando'
  }, before), { timeout: 15000 }).toBe('ok')
  return page.evaluate(() => {
    const d = window.Alpine.$data(document.body)
    return { id: d.currentId, title: d.currentTitle, warnings: d.dialog && d.dialog.kind === 'fileReport' ? [...d.dialog.warnings] : [] }
  })
}

async function closeReport(page) {
  if (await page.evaluate(() => !!window.Alpine.$data(document.body).dialog)) {
    await page.locator('#appDialog').getByRole('button', { name: 'Aceptar' }).click()
  }
}

const sortIcons = s => s && s.icon ? { ...s, icon: [...s.icon].sort() } : s

test('pairwise: importar FreeMind (.mm), filas de este navegador', async ({ page, maps }, testInfo) => {
  test.setTimeout(240000)
  const app = new AppPage(page)
  await app.goto()
  const stamp = Date.now().toString(36)
  for (const [i, c] of MM_COMBOS.filter(r => r.browser === testInfo.project.name).entries()) {
    const label = JSON.stringify(c)
    const want = freeMindExpected(c)
    const result = await importFile(page, freeMindFile(c, `fm-${stamp}-${i}`))
    maps.track(result.id)
    expect(result.title, label).toBe('Raíz')
    const got = await topicSummary(page, 'Tema ñandú')
    expect(got && got.summary, label).toEqual(want.tema)
    expect(got.children, label).toEqual(want.children)
    expect(got.rootChildren, label).toEqual(['Tema ñandú', 'Destino'])
    expect(result.warnings.length, `${label}\n${result.warnings.join('\n')}`).toBe(want.warnings.length)
    want.warnings.forEach(w => expect(result.warnings.join('\n'), label).toContain(w))
    await closeReport(page)
  }
})

test('pairwise: importar MindManager (.mmap), filas de este navegador', async ({ page, maps, request }, testInfo) => {
  test.setTimeout(240000)
  const app = new AppPage(page)
  await app.goto()
  const png = Buffer.from(await page.evaluate(() => {
    const cv = document.createElement('canvas')
    cv.width = 90
    cv.height = 60
    cv.getContext('2d').fillRect(0, 0, 90, 60)
    return cv.toDataURL('image/png').split(',')[1]
  }), 'base64')
  const stamp = Date.now().toString(36)
  for (const [i, c] of MMAP_COMBOS.filter(r => r.browser === testInfo.project.name).entries()) {
    const label = JSON.stringify(c)
    const want = mindManagerExpected(c)
    const result = await importFile(page, mindManagerFile(c, `mm-${stamp}-${i}`, png))
    maps.track(result.id)
    expect(result.title, label).toBe('Central & más')
    const got = await topicSummary(page, 'Tema')
    expect(sortIcons(got && got.summary), label).toEqual(sortIcons(want.tema))
    expect(got.rootChildren, label).toEqual(want.rootChildren)
    if (c.media === 'image') {
      expect((await app.nodeImage('Tema')) || '', label).toMatch(/^data:image\/png;base64,/)
      expect(await app.nodeData('Tema', 'imageSize'), label).toEqual({ width: 90, height: 60, custom: false })
    } else {
      expect(await app.nodeData('Tema', 'image'), label).toBeUndefined()
    }
    if (c.media === 'attachment') {
      const url = await app.nodeData('Tema', 'attachmentUrl')
      expect(url, label).toMatch(/^\/api\/files\/[0-9a-f-]{36}$/)
      expect(await app.nodeData('Tema', 'attachmentName'), label).toBe('guía.pdf')
      expect((await (await request.get(url)).body()).toString('utf8'), label).toBe('%PDF importado')
    }
    if (c.extras === 'labels') {
      // Definiciones en el tema central (se lee directamente: su texto lleva "&amp;" en el HTML)
      const defs = await page.evaluate(() => window.Alpine.$data(document.body).mindMap.renderer.root.getData('_textMarkers') || [])
      expect(defs.map(cat => [cat.name, cat.markers.map(m => m.name)]), label)
        .toEqual([['Importados', ['Clave', 'Examen']]])
    }
    expect(result.warnings.length, `${label}\n${result.warnings.join('\n')}`).toBe(want.warnings.length)
    want.warnings.forEach(w => expect(result.warnings.join('\n'), label).toContain(w))
    await closeReport(page)
  }
})
