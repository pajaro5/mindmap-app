// Fase 19 · Abrir y guardar como archivo. Pruebas pairwise (t=2) con el navegador como un
// parámetro más: cada proyecto de Playwright ejecuta solo sus filas (estrategia de QA t=2,
// ver docs/PLAN-clon-mindmanager.md §4). El oráculo está escrito aquí, sin funciones de la app.
const fs = require('fs')
const { test, expect, AppPage, uniqueTitle } = require('./fixtures')
const { pairwise, missingPairs } = require('./pairwise')
const { makeZip, readZip } = require('./zip')

const BROWSERS = ['chromium', 'firefox']

// ---- Modelo 1: abrir un archivo ----
const OPEN_PARAMS = {
  browser: BROWSERS,
  container: ['json', 'zipStored', 'zipFolderDeflate'],
  wrapper: ['full', 'guide', 'bare'],
  image: ['none', 'png', 'jpegWidth', 'missing'],
  attachment: ['none', 'present', 'missing'],
  layout: ['mindMap', 'logicalStructure', 'fishbone'],
  entry: ['ribbon', 'qat', 'pane', 'shortcut', 'drop']
}
const OPEN_COMBOS = pairwise(OPEN_PARAMS)

// ---- Modelo 2: guardar como archivo y volver a abrirlo (ida y vuelta) ----
const SAVE_PARAMS = {
  browser: BROWSERS,
  attachments: [0, 1, 2],
  image: ['none', 'embedded'],
  extras: ['notes', 'relation', 'callout'],
  title: ['plain', 'special']
}
const SAVE_COMBOS = pairwise(SAVE_PARAMS)

const ATTACHMENT_TEXT = 'contenido del adjunto ✓\n'
// Texto de un tema sin el HTML del texto enriquecido
const plain = text => String(text).replace(/<[^>]+>/g, '').trim()

test('los generadores cubren todos los pares', () => {
  expect(missingPairs(OPEN_PARAMS, OPEN_COMBOS)).toEqual([])
  expect(missingPairs(SAVE_PARAMS, SAVE_COMBOS)).toEqual([])
  expect(OPEN_COMBOS.length).toBeLessThanOrEqual(30) // mínimo 20 (5 × 4); exhaustivo 3240
  expect(SAVE_COMBOS.length).toBeLessThanOrEqual(12) // mínimo 9 (3 × 3); exhaustivo 72
  // Cada navegador recibe filas de los dos modelos
  for (const b of BROWSERS) {
    expect(OPEN_COMBOS.filter(c => c.browser === b).length).toBeGreaterThan(0)
    expect(SAVE_COMBOS.filter(c => c.browser === b).length).toBeGreaterThan(0)
  }
})

// Imagen generada con canvas en la página → Buffer
async function canvasImage(page, type, w, h) {
  const b64 = await page.evaluate(([type, w, h]) => {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#3d8fd8'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#7dc142'
    ctx.fillRect(0, 0, w / 2, h / 2)
    return c.toDataURL(type, 0.9).split(',')[1]
  }, [type, w, h])
  return Buffer.from(b64, 'base64')
}

const appState = page => page.evaluate(() => {
  const d = window.Alpine.$data(document.body)
  return { id: d.currentId, title: d.currentTitle, busy: d.fileBusy, error: d.errorMsg, layout: d.currentLayout, dialog: d.dialog && d.dialog.kind }
})

// Entrega el archivo a la app por la vía indicada
async function deliver(app, page, entry, file) {
  if (entry === 'drop') {
    await page.evaluate(({ name, type, b64 }) => {
      const bytes = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0))
      const dt = new DataTransfer()
      dt.items.add(new File([bytes], name, { type }))
      const target = document.getElementById('mindMapContainer')
      target.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }))
      target.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }))
    }, { name: file.name, type: file.mimeType, b64: file.buffer.toString('base64') })
    return
  }
  const triggers = {
    ribbon: () => app.clickRibbon('export', 'map.openFile'),
    qat: () => app.qat('map.openFile').click(),
    pane: async () => { await app.showMapsPane(); await page.locator('[data-action="open-file"]').click() },
    shortcut: () => page.keyboard.press('Control+O')
  }
  await app.chooseFile(triggers[entry], file)
}

// Espera a que termine la apertura de un archivo que crea un mapa distinto de `previousId`
async function waitImported(page, previousId) {
  await expect.poll(async () => {
    const s = await appState(page)
    if (s.error) return `error: ${s.error}`
    return !s.busy && s.id && s.id !== previousId ? 'ok' : 'esperando'
  }, { timeout: 15000 }).toBe('ok')
  await page.waitForFunction(() => {
    const d = window.Alpine.$data(document.body)
    return d.mindMap && d.mindMapId === d.currentId
  })
}

test.describe('pairwise: abrir archivo', () => {
  test('filas de este navegador', async ({ page, maps, request }, testInfo) => {
    test.setTimeout(240000)
    const rows = OPEN_COMBOS.filter(c => c.browser === testInfo.project.name)
    const app = new AppPage(page)
    await app.goto()
    const png = await canvasImage(page, 'image/png', 300, 200)
    const jpeg = await canvasImage(page, 'image/jpeg', 400, 200)
    const stamp = Date.now().toString(36)

    for (const [i, c] of rows.entries()) {
      const label = JSON.stringify(c)
      const zip = c.container !== 'json'
      const folder = c.container === 'zipFolderDeflate' ? 'tutorial/' : ''
      const stem = `pw-${stamp}-${i}`
      const title = `Archivo ${stamp} ${i}`

      // Contenido del mapa
      const children = [{ data: { text: 'Normal', note: 'Nota de prueba', icon: ['priority_1'] }, children: [] }]
      const extraFiles = []
      if (c.image !== 'none') {
        const d = { text: 'Con imagen' }
        if (c.image === 'png') {
          // En la carpeta comprimida la referencia difiere en mayúsculas del archivo real
          d.imageFile = folder ? 'capturas/Captura.PNG' : 'capturas/captura.png'
          extraFiles.push({ name: `${folder}capturas/captura.png`, data: png })
        } else if (c.image === 'jpegWidth') {
          d.imageFile = './capturas/foto.jpg'
          d.imageWidth = 160
          extraFiles.push({ name: `${folder}capturas/foto.jpg`, data: jpeg })
        } else {
          d.imageFile = 'capturas/no-existe.png'
        }
        children.push({ data: d, children: [] })
      }
      if (c.attachment !== 'none') {
        const d = { text: 'Con adjunto', attachmentFile: c.attachment === 'present' ? 'adjuntos/guía práctica.txt' : 'adjuntos/no-existe.txt' }
        if (c.attachment === 'present') extraFiles.push({ name: `${folder}adjuntos/guía práctica.txt`, data: ATTACHMENT_TEXT })
        children.push({ data: d, children: [] })
      }
      const data = { layout: c.layout, root: { data: { text: 'Centro' }, children } }
      const content = c.wrapper === 'full' ? { format: 'mindmap-app', version: 1, title, data }
        : c.wrapper === 'guide' ? { title, data } : data
      const json = JSON.stringify(content, null, 2)
      const file = zip
        ? { name: `${stem}.zip`, mimeType: 'application/zip', buffer: makeZip([{ name: `${folder}${folder ? 'mi-mapa' : 'mapa'}.json`, data: json }, ...extraFiles], { deflate: c.container === 'zipFolderDeflate' }) }
        : { name: `${stem}.json`, mimeType: 'application/json', buffer: Buffer.from(json) }

      // Avisos esperados
      const warnings = []
      if (!zip && c.image !== 'none') warnings.push('abre el .zip')
      if (!zip && c.attachment !== 'none') warnings.push('abre el .zip')
      if (zip && c.image === 'missing') warnings.push('Falta la imagen')
      if (zip && c.attachment === 'missing') warnings.push('Falta el adjunto')

      const before = await appState(page)
      await deliver(app, page, c.entry, file)
      await waitImported(page, before.id)
      const s = await appState(page)
      maps.track(s.id)

      expect(s.title, label).toBe(c.wrapper === 'bare' ? stem : title)
      expect(s.layout, label).toBe(c.layout)
      expect((await app.tree()).c.map(n => n.t), label).toEqual(children.map(n => n.data.text))
      expect(await app.nodeData('Normal', 'note'), label).toBe('Nota de prueba')
      expect(await app.nodeData('Normal', 'icon'), label).toEqual(['priority_1'])

      if (zip && c.image === 'png') {
        expect((await app.nodeImage('Con imagen')) || '', label).toMatch(/^data:image\/png;base64,/)
        expect(await app.nodeData('Con imagen', 'imageSize'), label).toEqual({ width: 300, height: 200, custom: false })
      } else if (zip && c.image === 'jpegWidth') {
        expect((await app.nodeImage('Con imagen')) || '', label).toMatch(/^data:image\/jpeg;base64,/)
        expect(await app.nodeData('Con imagen', 'imageSize'), label).toEqual({ width: 160, height: 80, custom: true })
      } else if (c.image !== 'none') {
        expect(await app.nodeData('Con imagen', 'image'), label).toBeUndefined()
      }

      if (zip && c.attachment === 'present') {
        const url = await app.nodeData('Con adjunto', 'attachmentUrl')
        expect(url, label).toMatch(/^\/api\/files\/[0-9a-f-]{36}$/)
        expect(await app.nodeData('Con adjunto', 'attachmentName'), label).toBe('guía práctica.txt')
        expect((await (await request.get(url)).body()).toString('utf8'), label).toBe(ATTACHMENT_TEXT)
        // El adjunto está guardado en el mapa (no solo en la página)
        const saved = await maps.get(s.id)
        expect(saved.data.root.children.find(n => plain(n.data.text) === 'Con adjunto').data.attachmentUrl, label).toBe(url)
      } else if (c.attachment !== 'none') {
        expect(await app.nodeData('Con adjunto', 'attachmentUrl'), label).toBeUndefined()
      }

      if (warnings.length) {
        expect(s.dialog, label).toBe('fileReport')
        const items = page.locator('.file-report li')
        await expect(items, label).toHaveCount(warnings.length)
        for (const [k, w] of warnings.entries()) await expect(items.nth(k), label).toContainText(w)
        await page.locator('#appDialog').getByRole('button', { name: 'Aceptar' }).click()
        await expect.poll(async () => (await appState(page)).dialog, { message: label }).toBeNull()
      } else {
        expect(s.dialog, label).toBeNull()
      }
    }
  })
})

// Normaliza los datos de un mapa para compararlos: sin las URL de adjuntos (cambian al
// subirlos de nuevo), la selección ni la vista (al abrir un archivo el mapa se ajusta a la ventana)
function comparable(data) {
  const copy = JSON.parse(JSON.stringify(data))
  delete copy.view
  // Las imágenes pueden estar en el tema o, como clave, en root.data.imgMap (lo decide el
  // plugin nodeBase64ImageStorage de la librería, en diferido): se comparan resueltas
  const imgMap = copy.root.data.imgMap || {}
  delete copy.root.data.imgMap
  const walk = node => {
    if (imgMap[node.data.image]) node.data.image = imgMap[node.data.image]
    delete node.data.attachmentUrl
    delete node.data.isActive
    ;(node.children || []).forEach(walk)
  }
  walk(copy.root)
  return copy
}

const attachmentsOf = data => {
  const list = []
  const walk = node => {
    if (node.data.attachmentUrl) list.push({ text: plain(node.data.text), url: node.data.attachmentUrl, name: node.data.attachmentName })
    ;(node.children || []).forEach(walk)
  }
  walk(data.root)
  return list
}

test.describe('pairwise: guardar como archivo y volver a abrirlo', () => {
  test('filas de este navegador', async ({ page, maps, request }, testInfo) => {
    test.setTimeout(240000)
    const rows = SAVE_COMBOS.filter(c => c.browser === testInfo.project.name)
    const app = new AppPage(page)
    await app.goto()
    const png = await canvasImage(page, 'image/png', 120, 80)
    const stamp = Date.now().toString(36)

    for (const [i, c] of rows.entries()) {
      const label = JSON.stringify(c)
      const title = c.title === 'plain' ? `Plan ${stamp} ${i}` : `Plan: a/b "c"? ${stamp} ${i}`
      const expectedBase = c.title === 'plain' ? `Plan ${stamp} ${i}` : `Plan a b c ${stamp} ${i}`

      const uno = { text: 'Uno' }
      const dos = { text: 'Dos' }
      if (c.extras === 'notes') Object.assign(uno, { note: 'Primera\nsegunda', icon: ['flag_red'], tag: [{ text: 'Clave', style: { fill: '#2f9e44' } }] })
      if (c.extras === 'relation') {
        dos.uid = `dos-${stamp}-${i}`
        Object.assign(uno, { associativeLineTargets: [dos.uid], associativeLineText: { [dos.uid]: 'lleva a' } })
      }
      if (c.extras === 'callout') {
        uno._callouts = [{ id: 'c1', text: 'Ojo aquí', dx: 30, dy: -20 }]
        dos._task = { start: '2026-11-02', due: '2026-11-05', resources: ['Ana'] }
      }
      if (c.image === 'embedded') {
        Object.assign(dos, { image: `data:image/png;base64,${png.toString('base64')}`, imageTitle: 'img.png', imageSize: { width: 120, height: 80, custom: false } })
      }
      const data = { layout: 'logicalStructure', root: { data: { text: 'Origen' }, children: [{ data: uno, children: [] }, { data: dos, children: [] }] } }

      // Mapa original, con sus adjuntos subidos a la API (mismo nombre en los dos temas)
      const original = await maps.create({ title })
      const contents = {}
      for (const node of data.root.children.slice(0, c.attachments)) {
        const text = `${ATTACHMENT_TEXT}${node.data.text}`
        const res = await request.post(`/api/maps/${original.id}/files`, { headers: { 'Content-Type': 'text/plain', 'X-File-Name': 'nota.txt' }, data: Buffer.from(text) })
        expect(res.status(), label).toBe(201)
        node.data.attachmentUrl = (await res.json()).url
        node.data.attachmentName = 'nota.txt'
        contents[node.data.text] = text
      }
      expect((await request.put(`/api/maps/${original.id}`, { data: { data } })).ok(), label).toBeTruthy()

      // La lista de mapas se cargó antes de crear este
      await page.evaluate(() => window.Alpine.$data(document.body).loadMapList())
      await app.openMapByTitle(title)
      const before = await page.evaluate(() => Alpine.raw(window.Alpine.$data(document.body).mindMap).getData(true))

      // Guardar como archivo
      const [download] = await Promise.all([page.waitForEvent('download'), app.clickRibbon('export', 'map.saveFile')])
      const buffer = fs.readFileSync(await download.path())
      const isZip = c.attachments > 0
      expect(download.suggestedFilename(), label).toBe(`${expectedBase}.${isZip ? 'zip' : 'json'}`)
      let saved
      if (isZip) {
        const entries = readZip(buffer)
        const names = ['mapa.json', 'adjuntos/nota.txt', 'adjuntos/nota (2).txt'].slice(0, c.attachments + 1)
        expect(Object.keys(entries).sort(), label).toEqual(names.sort())
        saved = JSON.parse(entries['mapa.json'].toString('utf8'))
        const files = saved.data.root.children.filter(n => n.data.attachmentFile)
        expect(files.map(n => n.data.attachmentName), label).toEqual(Array(c.attachments).fill('nota.txt'))
        for (const n of files) expect(entries[n.data.attachmentFile].toString('utf8'), label).toBe(contents[plain(n.data.text)])
      } else {
        saved = JSON.parse(buffer.toString('utf8'))
      }
      expect({ format: saved.format, version: saved.version, title: saved.title }, label).toEqual({ format: 'mindmap-app', version: 1, title })
      // El archivo lleva la versión del formato de los datos (migrations.js)
      expect(saved.data.schemaVersion, label).toBe(1)
      expect(JSON.stringify(saved), label).not.toContain('/api/files/')

      // Volver a abrirlo: un mapa nuevo idéntico al original
      const previous = await appState(page)
      await app.chooseFile(() => app.clickRibbon('export', 'map.openFile'), { name: download.suggestedFilename(), mimeType: isZip ? 'application/zip' : 'application/json', buffer })
      await waitImported(page, previous.id)
      const s = await appState(page)
      maps.track(s.id)
      expect(s.title, label).toBe(title)
      expect(s.dialog, label).toBeNull()
      const after = await page.evaluate(() => Alpine.raw(window.Alpine.$data(document.body).mindMap).getData(true))
      expect(comparable(after), label).toEqual(comparable(before))
      // Los adjuntos se subieron de nuevo, al mapa nuevo, con el mismo contenido
      const reopened = attachmentsOf(after)
      expect(reopened.length, label).toBe(c.attachments)
      for (const a of reopened) {
        expect(attachmentsOf(before).map(b => b.url), label).not.toContain(a.url)
        expect((await (await request.get(a.url)).body()).toString('utf8'), label).toBe(contents[a.text])
      }
    }
  })
})
