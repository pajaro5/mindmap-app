// Fase 22 · Importar FreeMind y MindManager: escenarios no combinables (errores, seguridad y
// la vía real del selector de archivos). La combinatoria está en import-formats.pairwise.spec.js.
const { test, expect, AppPage } = require('./fixtures')
const { makeZip } = require('./zip')

test.skip(({ browserName }) => browserName !== 'chromium', 'escenarios en Chromium; los dos navegadores están en la combinatoria t=2')

const state = page => page.evaluate(() => {
  const d = window.Alpine.$data(document.body)
  return { id: d.currentId, busy: d.fileBusy, error: d.errorMsg, title: d.currentTitle, dialog: d.dialog && d.dialog.kind }
})

const open = (app, file) => app.chooseFile(() => app.clickRibbon('export', 'map.openFile'), file)

test('errores claros: .mmap binario de MindManager X5, XML roto y .mm que no es un mapa', async ({ page, request }) => {
  const app = new AppPage(page)
  await app.goto()
  const ole = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(512)])
  const cases = [
    [{ name: 'viejo.mmap', mimeType: 'application/octet-stream', buffer: ole }, 'MindManager X5 o anterior'],
    [{ name: 'roto.mm', mimeType: 'application/xml', buffer: Buffer.from('<map><node TEXT="a"></map>') }, 'no es un XML válido'],
    [{ name: 'otro.mm', mimeType: 'application/xml', buffer: Buffer.from('<?xml version="1.0"?><html><body/></html>') }, 'no contiene un mapa de FreeMind'],
    [{ name: 'raro.mmap', mimeType: 'application/octet-stream', buffer: makeZip([{ name: 'Document.xml', data: '<x:Otra xmlns:x="urn:x"/>' }]) }, 'no contiene un mapa de MindManager'],
    [{ name: 'foto.png', mimeType: 'image/png', buffer: Buffer.from('PNG') }, 'MindManager (.mmap) o FreeMind (.mm)']
  ]
  for (const [file, message] of cases) {
    await open(app, file)
    await expect.poll(async () => (await state(page)).error, { message: file.name }).toContain(message)
  }
  const titles = (await (await request.get('/api/maps')).json()).map(m => m.title)
  expect(titles).not.toContain('a')
})

test('[Seguridad] lo que llega de un .mm se sanea: vínculos javascript y HTML peligroso en notas', async ({ page, maps }) => {
  const app = new AppPage(page)
  await app.goto()
  let dialogs = 0
  page.on('dialog', () => { dialogs++ })
  const xml = '<map version="1.0.1"><node TEXT="Seguro" ID="r">' +
    '<node TEXT="&lt;img src=x onerror=alert(1)&gt;" ID="a" LINK="javascript:alert(2)">' +
    '<richcontent TYPE="NOTE"><html><body><p onclick="alert(3)">nota<img src="x" onerror="alert(4)"/><script>alert(5)</script><a href="javascript:alert(6)">mal</a></p></body></html></richcontent>' +
    '</node></node></map>'
  await open(app, { name: 'malo.mm', mimeType: 'application/xml', buffer: Buffer.from(xml) })
  await expect.poll(async () => (await state(page)).title).toBe('Seguro')
  maps.track((await state(page)).id)
  const node = await page.evaluate(() => {
    const d = window.Alpine.$data(document.body)
    const child = Alpine.raw(d.mindMap).getData(false).children[0].data
    return { hyperlink: child.hyperlink, note: child.note, html: child._noteHtml }
  })
  expect(node.hyperlink).toBeUndefined()
  expect(node.note).toBe('notamal')
  expect(node.html).toBeUndefined() // sin formato que conservar: solo texto plano
  // El texto con forma de HTML se muestra como texto, sin ejecutarse
  await expect(page.locator('#mindMapContainer foreignObject').getByText('<img src=x onerror=alert(1)>')).toBeVisible()
  await page.waitForTimeout(300)
  expect(dialogs).toBe(0)
})

test('el selector de archivos acepta .mmap y .mm y el mapa abre con sus avisos', async ({ page, maps }) => {
  const app = new AppPage(page)
  await app.goto()
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), app.clickRibbon('export', 'map.openFile')])
  const accept = await page.evaluate(() => document.querySelector('[data-testid="file-picker"]').accept)
  expect(accept.split(',')).toEqual(expect.arrayContaining(['.mmap', '.mm', '.json', '.zip']))
  const xml = '<map><node TEXT="Biología"><node TEXT="Célula"><icon BUILTIN="penguin"/></node></node></map>'
  await chooser.setFiles({ name: 'biologia.mm', mimeType: 'application/xml', buffer: Buffer.from(xml) })
  await expect.poll(async () => (await state(page)).dialog).toBe('fileReport')
  maps.track((await state(page)).id)
  await expect(page.locator('.file-report li')).toHaveText(['Iconos sin equivalente aquí (no se importaron): 1.'])
  expect((await app.tree()).c.map(n => n.t)).toEqual(['Célula'])
})
