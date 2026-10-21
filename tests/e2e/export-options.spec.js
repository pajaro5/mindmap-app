// Fase 24 · Exportar: opciones (qué incluir, numerar títulos), imágenes de los temas en Word
// y presentación en el HTML interactivo
const fs = require('fs')
const zlib = require('zlib')
const { pathToFileURL } = require('url')
const { test, expect, setupMap, SAMPLE_TREE } = require('./fixtures')

const clone = o => JSON.parse(JSON.stringify(o))
const dialog = page => page.locator('#appDialog')

function richMap() {
  const data = clone(SAMPLE_TREE)
  const [alfa, beta] = data.root.children
  alfa.data.icon = ['priority_1', 'flag_red']
  alfa.data._task = { start: '2026-03-02', due: '2026-03-09', resources: ['Ana'] }
  beta.data.hyperlink = 'https://ejemplo.com/'
  beta.data.note = 'Nota de Beta'
  beta.data._callouts = [{ id: 'c1', text: 'Llamada de Beta', dx: 40, dy: -40 }]
  return data
}

async function download(page, action) {
  const [file] = await Promise.all([page.waitForEvent('download'), action()])
  return { name: file.suggestedFilename(), path: await file.path() }
}

function zipEntries(buffer) {
  const files = {}
  let at = 0
  while (buffer.readUInt32LE(at) === 0x04034b50) {
    const crc = buffer.readUInt32LE(at + 14)
    const size = buffer.readUInt32LE(at + 18)
    const nameLen = buffer.readUInt16LE(at + 26)
    const extraLen = buffer.readUInt16LE(at + 28)
    const name = buffer.toString('utf8', at + 30, at + 30 + nameLen)
    const data = buffer.subarray(at + 30 + nameLen + extraLen, at + 30 + nameLen + extraLen + size)
    expect(zlib.crc32(data), `${name}: CRC`).toBe(crc)
    files[name] = data
    at += 30 + nameLen + extraLen + size
  }
  return files
}

async function exportWithOptions(page, app, format, set) {
  await app.chooseFromMenu('export', format === 'md' ? 'export.markdown' : 'export.word', 'export.options')
  await expect(dialog(page).locator('[name="expNotes"]')).toBeVisible()
  for (const [name, value] of Object.entries(set)) await dialog(page).locator(`[name="${name}"]`).setChecked(value)
  return download(page, () => dialog(page).getByRole('button', { name: 'Exportar' }).click())
}

test.describe('Opciones de exportación', () => {
  test('quitar notas, tareas y llamadas y numerar los títulos (Markdown)', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps, { data: richMap() })
    const file = await exportWithOptions(page, app, 'md', { expNotes: false, expTask: false, expCallouts: false, expNumbering: true })
    const md = fs.readFileSync(file.path, 'utf8')
    expect(md).toContain('## 1. Alfa')
    expect(md).toContain('### 1.1. Alfa uno')
    expect(md).toContain('## 2. Beta')
    expect(md).not.toContain('Nota de Beta')
    expect(md).not.toContain('Llamada de Beta')
    expect(md).not.toContain('Prioridad 1')
    expect(md).toContain('Bandera roja') // los marcadores sí
    expect(md).toContain('ejemplo.com') // y los vínculos
  })

  test('las opciones se recuerdan para el botón directo', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps, { data: richMap() })
    await exportWithOptions(page, app, 'md', { expMarkers: false, expNumbering: true })
    await app.ribbonTab('export').click()
    const again = await download(page, () => app.ribbonCmd('export', 'export.markdown').click())
    const md = fs.readFileSync(again.path, 'utf8')
    expect(md).toContain('## 1. Alfa')
    expect(md).not.toContain('Bandera roja')
    // Y al abrir de nuevo el diálogo están marcadas igual
    await app.chooseFromMenu('export', 'export.markdown', 'export.options')
    await expect(dialog(page).locator('[name="expMarkers"]')).not.toBeChecked()
    await expect(dialog(page).locator('[name="expNumbering"]')).toBeChecked()
  })
})

test.describe('Imágenes en Word', () => {
  test('la imagen de un tema va en el .docx (PNG; WebP se convierte)', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    const png = await app.makePng(80, 40)
    const webp = await page.evaluate(() => {
      const c = document.createElement('canvas')
      c.width = 30; c.height = 30
      c.getContext('2d').fillRect(0, 0, 30, 30)
      return c.toDataURL('image/webp')
    })
    await page.evaluate(({ png, webp }) => {
      const mm = Alpine.raw(window.Alpine.$data(document.body).mindMap)
      const [alfa, beta] = mm.renderer.root.children
      mm.renderer.setNodeDataRender(alfa, { image: `data:image/png;base64,${png}`, imageSize: { width: 80, height: 40 } })
      mm.renderer.setNodeDataRender(beta, { image: webp, imageSize: { width: 30, height: 30 } })
    }, { png: png.toString('base64'), webp })
    await app.ribbonTab('export').click()
    const file = await download(page, () => app.ribbonCmd('export', 'export.word').click())
    const files = zipEntries(fs.readFileSync(file.path))
    const media = Object.keys(files).filter(n => n.startsWith('word/media/'))
    expect(media.sort()).toEqual(['word/media/image1.png', 'word/media/image2.png'])
    expect(files['word/media/image1.png'].subarray(1, 4).toString()).toBe('PNG')
    expect(files['[Content_Types].xml'].toString()).toContain('Extension="png"')
    const doc = files['word/document.xml'].toString()
    expect((doc.match(/<w:drawing>/g) || []).length).toBe(2)
    expect(files['word/_rels/document.xml.rels'].toString()).toContain('Target="media/image1.png"')
    // 80 × 40 px → EMU (9525 por píxel)
    expect(doc).toContain('cx="762000" cy="381000"')
  })

  test('sin la opción de imágenes no se incluyen', async ({ page, maps }) => {
    const data = clone(SAMPLE_TREE)
    const { app } = await setupMap(page, maps, { data })
    const png = await app.makePng(20, 20)
    await page.evaluate(png => {
      const mm = Alpine.raw(window.Alpine.$data(document.body).mindMap)
      mm.renderer.setNodeDataRender(mm.renderer.root.children[0], { image: `data:image/png;base64,${png}`, imageSize: { width: 20, height: 20 } })
    }, png.toString('base64'))
    const file = await exportWithOptions(page, app, 'docx', { expImages: false })
    const files = zipEntries(fs.readFileSync(file.path))
    expect(Object.keys(files).some(n => n.startsWith('word/media/'))).toBe(false)
  })
})

test.describe('Presentación en el HTML interactivo', () => {
  test.describe.configure({ timeout: 90000 })

  test('el archivo exportado tiene presentación: avanzar y salir', async ({ page, maps }, testInfo) => {
    const { app } = await setupMap(page, maps)
    await app.ribbonTab('export').click()
    const [dl] = await Promise.all([page.waitForEvent('download'), app.ribbonCmd('export', 'export.html').click()])
    const file = testInfo.outputPath(dl.suggestedFilename())
    await dl.saveAs(file)
    const viewer = await page.context().newPage()
    const errors = []
    viewer.on('pageerror', e => errors.push(e.message))
    await viewer.route('**/*', route => /^(file|blob|data):/.test(route.request().url()) ? route.continue() : route.abort())
    await viewer.goto(pathToFileURL(file).href)
    await expect(viewer.locator('body.viewer-ready')).toHaveCount(1, { timeout: 30000 })
    await viewer.locator('[data-viewer="present"]').click()
    await expect(viewer.locator('.viewer-present-bar')).toBeVisible()
    await expect(viewer.locator('.viewer-present-status')).toHaveText(/^1 \/ \d+$/)
    await viewer.keyboard.press('ArrowRight')
    await expect(viewer.locator('.viewer-present-status')).toHaveText(/^2 \/ \d+$/)
    await viewer.keyboard.press('Escape')
    await expect(viewer.locator('.viewer-present-bar')).toBeHidden()
    expect(errors).toEqual([])
    await viewer.close()
  })
})
