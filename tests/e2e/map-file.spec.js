// Fase 19 · Abrir y guardar como archivo: escenarios que no son combinables (errores,
// seguridad, el ejemplo de la guía, no sobrescribir). La combinatoria está en
// map-file.pairwise.spec.js.
const fs = require('fs')
const path = require('path')
const { test, expect, AppPage } = require('./fixtures')
const { makeZip } = require('./zip')

test.skip(({ browserName }) => browserName !== 'chromium', 'escenarios en Chromium; los dos navegadores están en la combinatoria t=2')

const json = (name, value) => ({ name, mimeType: 'application/json', buffer: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)) })
const zipFile = (name, files) => ({ name, mimeType: 'application/zip', buffer: makeZip(files) })
const MINIMAL = { root: { data: { text: 'Raíz' }, children: [] } }

const appState = page => page.evaluate(() => {
  const d = window.Alpine.$data(document.body)
  return { id: d.currentId, busy: d.fileBusy, error: d.errorMsg, dialog: d.dialog && d.dialog.kind }
})

async function openFile(app, file) {
  await app.chooseFile(() => app.clickRibbon('export', 'map.openFile'), file)
}

test('archivos no válidos: mensaje claro y no se crea ningún mapa', async ({ page, request }) => {
  const app = new AppPage(page)
  await app.goto()
  const cases = [
    [json('roto.json', '{ "title": "x", '), 'no es un JSON válido'],
    [json('otro.json', { format: 'xmind', data: MINIMAL }), 'no es un mapa de esta aplicación'],
    [json('nuevo.json', { format: 'mindmap-app', version: 2, data: MINIMAL }), 'versión más nueva'],
    [json('sin-raiz.json', { title: 'x', data: { layout: 'mindMap' } }), 'estructura de un mapa'],
    [json('tema-sin-data.json', { root: { data: { text: 'a' }, children: [{ text: 'b' }] } }), 'estructura de un mapa'],
    [zipFile('vacio.zip', [{ name: 'leeme.txt', data: 'hola' }]), 'ningún archivo .json'],
    [zipFile('varios.zip', [{ name: 'a.json', data: JSON.stringify(MINIMAL) }, { name: 'b.json', data: JSON.stringify(MINIMAL) }]), 'varios .json'],
    [{ name: 'roto.zip', mimeType: 'application/zip', buffer: Buffer.from('PK\u0003\u0004 esto no es un zip') }, 'no es válido o está dañado'],
    [{ name: 'notas.txt', mimeType: 'text/plain', buffer: Buffer.from('hola') }, 'Elige un mapa guardado como .json o .zip']
  ]
  for (const [file, message] of cases) {
    await openFile(app, file)
    await expect.poll(async () => (await appState(page)).error, { message: file.name }).toContain(message)
    await expect(app.errorBanner).toContainText(`No se pudo abrir "${file.name}"`)
    expect((await appState(page)).busy).toBe('')
  }
  // Ningún mapa con el título que habría tenido (otras pruebas crean mapas en paralelo: no
  // vale contar todos)
  const titles = (await (await request.get('/api/maps')).json()).map(m => m.title)
  for (const [file] of cases) expect(titles).not.toContain(file.name.replace(/\.\w+$/, ''))
  expect(titles).not.toContain('x')
})

test('seguridad: lo que llega en el archivo se sanea y los adjuntos ajenos se quitan', async ({ page, maps }) => {
  const app = new AppPage(page)
  await app.goto()
  let dialogs = 0
  page.on('dialog', () => { dialogs++ })
  const file = json('peligroso.json', {
    title: 'Peligroso',
    data: {
      root: {
        data: { text: 'Raíz' },
        children: [
          { data: { text: 'Vínculo', hyperlink: 'javascript:alert(1)', hyperlinkTitle: '<img src=x onerror=alert(2)>' }, children: [] },
          { data: { text: 'Ajeno', attachmentUrl: '/api/files/0b7c1c62-1111-4111-8111-111111111111', attachmentName: 'x.exe' }, children: [] },
          { data: { text: 'Imagen', image: 'javascript:alert(3)', imageSize: { width: 10, height: 10 } }, children: [] }
        ]
      }
    }
  })
  await openFile(app, file)
  await expect.poll(async () => (await appState(page)).dialog).toBe('fileReport')
  maps.track((await appState(page)).id)
  await expect(page.locator('.file-report li')).toHaveCount(1)
  await expect(page.locator('.file-report li')).toContainText('pertenece a otro mapa')
  expect(await app.nodeData('Vínculo', 'hyperlink')).toBeUndefined()
  expect(await app.nodeData('Ajeno', 'attachmentUrl')).toBeUndefined()
  expect(await app.nodeData('Imagen', 'image')).toBeUndefined()
  expect(dialogs).toBe(0)
})

test('el ejemplo de howToCreateAMindmap.md se abre completo desde un .zip de su carpeta', async ({ page, maps, request }) => {
  const app = new AppPage(page)
  await app.goto()
  const guide = fs.readFileSync(path.join(__dirname, '..', '..', 'howToCreateAMindmap.md'), 'utf8')
  const example = [...guide.matchAll(/```json\r?\n([\s\S]*?)```/g)].map(m => m[1]).find(b => b.includes('Git básico'))
  expect(example).toBeTruthy()
  const png = Buffer.from(await page.evaluate(() => {
    const c = document.createElement('canvas')
    c.width = 800
    c.height = 450
    c.getContext('2d').fillRect(0, 0, 800, 450)
    return c.toDataURL('image/png').split(',')[1]
  }), 'base64')
  const file = {
    name: 'tutorial-git.zip',
    mimeType: 'application/zip',
    buffer: makeZip([
      { name: 'tutorial-git/mapa.json', data: example },
      { name: 'tutorial-git/capturas/01-descarga.png', data: png },
      { name: 'tutorial-git/adjuntos/practica-ramas.zip', data: 'zip de práctica' }
    ], { deflate: true })
  }
  await openFile(app, file)
  await expect.poll(async () => {
    const s = await appState(page)
    return s.error || (!s.busy && (await page.evaluate(() => window.Alpine.$data(document.body).currentTitle)))
  }).toBe('Tutorial: Git básico')
  maps.track((await appState(page)).id)
  expect((await appState(page)).dialog).toBeNull()
  expect((await app.tree()).c.map(n => n.t)).toEqual(['1. Instalar y configurar', '2. Primer repositorio', '3. Ramas'])
  expect(await app.nodeData('Instalar Git', 'imageSize')).toEqual({ width: 400, height: 225, custom: true })
  expect((await app.nodeImage('Instalar Git')) || '').toMatch(/^data:image\/png;base64,/)
  expect(await app.nodeData('Instalar Git', 'hyperlink')).toBe('https://git-scm.com/downloads')
  expect(await app.nodeData('Identidad', 'icon')).toEqual(['symbol_warning'])
  expect(await app.nodeData('Commit', 'note')).toContain('git add .')
  // La rama 3 viene plegada: su adjunto se comprueba en los datos guardados
  const saved = await maps.get((await appState(page)).id)
  const ramas = saved.data.root.children[2]
  const practica = ramas.children.find(n => n.data.text === 'Repositorio de práctica').data
  expect(practica.attachmentName).toBe('practica-ramas.zip')
  expect((await (await request.get(practica.attachmentUrl)).body()).toString('utf8')).toBe('zip de práctica')
  expect(ramas.data.associativeLineTargets).toEqual(['7f1c2e10-0000-4000-8000-000000000001'])
})

test('abrir un archivo crea un mapa nuevo y no toca el que estaba abierto', async ({ page, maps, openMap }) => {
  const { app, map } = openMap
  // Contenido del mapa abierto (los datos crudos cambian solo con abrirlo: la librería añade
  // uid, versión y vista al autoguardar)
  const content = async () => {
    const m = await maps.get(map.id)
    const walk = n => ({ t: String(n.data.text).replace(/<[^>]+>/g, ''), c: (n.children || []).map(walk) })
    return { title: m.title, tree: walk(m.data.root), layout: m.data.layout }
  }
  const before = await content()
  await openFile(app, json('otro.json', { title: 'Importado', data: MINIMAL }))
  await expect.poll(async () => (await appState(page)).id).not.toBe(map.id)
  maps.track((await appState(page)).id)
  await expect(app.titleInput).toHaveValue('Importado')
  await expect(page.locator('.map-list li', { hasText: 'Importado' })).toHaveCount(1)
  expect(await content()).toEqual(before)
})

test('arrastrar un archivo sobre la app la resalta; arrastrar texto no', async ({ page }) => {
  const app = new AppPage(page)
  await app.goto()
  const drag = (type, withFile) => page.evaluate(([type, withFile]) => {
    const dt = new DataTransfer()
    if (withFile) dt.items.add(new File(['{}'], 'mapa.json', { type: 'application/json' }))
    else dt.setData('text/plain', 'hola')
    document.body.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }))
  }, [type, withFile])
  await drag('dragover', false)
  await expect(page.locator('body')).not.toHaveClass(/file-drag-over/)
  await drag('dragover', true)
  await expect(page.locator('body')).toHaveClass(/file-drag-over/)
  await drag('dragleave', true)
  await expect(page.locator('body')).not.toHaveClass(/file-drag-over/)
})

test('Guardar como archivo está deshabilitado sin mapa; Abrir, no', async ({ page }) => {
  const app = new AppPage(page)
  await app.goto()
  await app.ribbonTab('export').click()
  await expect(app.ribbonCmd('export', 'map.saveFile')).toBeDisabled()
  await expect(app.ribbonCmd('export', 'map.openFile')).toBeEnabled()
  await expect(app.qat('map.openFile')).toHaveAttribute('title', /Ctrl\+O/)
})
