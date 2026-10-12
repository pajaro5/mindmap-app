// Fase 3 · Elementos del tema: hipervínculo, notas, imagen y adjunto (+ seguridad)
const { test, expect, setupMap, SAMPLE_TREE } = require('./fixtures')

const cmd = (app, id) => app.ribbonCmd('home', id)
const dialog = page => page.locator('#appDialog')

test.describe('Hipervínculo', () => {
  test('Ctrl+K abre el diálogo; una dirección sin esquema se guarda como https', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNode('Beta')
    await page.keyboard.press('ControlOrMeta+k')
    await expect(dialog(page)).toBeVisible()
    await dialog(page).locator('[name="url"]').fill('ejemplo.com/docs')
    await dialog(page).locator('[name="title"]').fill('Documentación')
    await dialog(page).getByRole('button', { name: 'Aceptar' }).click()
    await expect(dialog(page)).toBeHidden()

    await expect.poll(() => app.nodeData('Beta', 'hyperlink')).toBe('https://ejemplo.com/docs')
    expect(await app.nodeData('Beta', 'hyperlinkTitle')).toBe('Documentación')
    await expect(app.node('Beta').locator('a')).toHaveAttribute('href', 'https://ejemplo.com/docs')
  })

  test('un correo se convierte en mailto', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNode('Gamma')
    await cmd(app, 'element.hyperlink').click()
    await dialog(page).locator('[name="url"]').fill('equipo@ejemplo.com')
    await dialog(page).locator('[name="url"]').press('Enter')
    await expect.poll(() => app.nodeData('Gamma', 'hyperlink')).toBe('mailto:equipo@ejemplo.com')
  })

  test('rechaza vínculos javascript: y no guarda nada', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNode('Beta')
    await cmd(app, 'element.hyperlink').click()
    await dialog(page).locator('[name="url"]').fill('javascript:alert(1)')
    await dialog(page).getByRole('button', { name: 'Aceptar' }).click()
    await expect(dialog(page).getByRole('alert')).toHaveText('Solo se permiten vínculos http, https o mailto.')
    await expect(dialog(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toBeHidden()
    expect(await app.nodeData('Beta', 'hyperlink')).toBeUndefined()
  })

  test('editar muestra el vínculo actual y "Quitar vínculo" lo elimina', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNode('Beta')
    await cmd(app, 'element.hyperlink').click()
    await expect(dialog(page).getByRole('button', { name: 'Quitar vínculo' })).toBeHidden()
    await dialog(page).locator('[name="url"]').fill('https://uno.example')
    await dialog(page).locator('[name="title"]').fill('A & B <c>')
    await dialog(page).getByRole('button', { name: 'Aceptar' }).click()
    // El título se guarda escapado (la librería lo inserta como SVG sin escapar)
    await expect.poll(() => app.nodeData('Beta', 'hyperlinkTitle')).toBe('A &amp; B &lt;c&gt;')

    await cmd(app, 'element.hyperlink').click()
    await expect(dialog(page).locator('[name="url"]')).toHaveValue('https://uno.example/')
    await expect(dialog(page).locator('[name="title"]')).toHaveValue('A & B <c>')
    await dialog(page).getByRole('button', { name: 'Quitar vínculo' }).click()
    await expect.poll(() => app.nodeData('Beta', 'hyperlink')).toBeUndefined()
    await expect(app.node('Beta').locator('a')).toHaveCount(0)
  })

  test('[Regresión] Ctrl+K justo después de seleccionar otro tema usa el tema nuevo', async ({ page, maps }) => {
    const data = JSON.parse(JSON.stringify(SAMPLE_TREE))
    Object.assign(data.root.children[0].data, { hyperlink: 'https://alfa.example/', hyperlinkTitle: 'Vínculo de Alfa' })
    const { app } = await setupMap(page, maps, { data })
    await app.selectNode('Alfa')
    // Seleccionar Beta y lanzar el comando en el mismo tick, antes de que la librería emita
    // node_active (lo hace con setTimeout 0): así se reproduce de forma determinista
    await page.evaluate(() => {
      const app = window.Alpine.$data(document.body)
      const beta = app.mindMap.renderer.root.children.find(n => n.getData('text').includes('Beta'))
      beta.active()
      app.runCommand('element.hyperlink')
    })
    await expect(dialog(page)).toBeVisible()
    await expect(dialog(page).locator('[name="title"]')).toHaveValue('')
    await expect(dialog(page).getByRole('button', { name: 'Quitar vínculo' })).toBeHidden()
  })

  test('el icono del vínculo abre la dirección en una pestaña nueva', async ({ page, maps, context }) => {
    const data = JSON.parse(JSON.stringify(SAMPLE_TREE))
    data.root.children[1].data.hyperlink = 'https://example.com/'
    const { app } = await setupMap(page, maps, { data })
    await context.route('https://example.com/**', route => route.fulfill({ body: 'ok' }))
    const [popup] = await Promise.all([context.waitForEvent('page'), app.node('Beta').locator('a').click()])
    expect(popup.url()).toBe('https://example.com/')
  })
})

test.describe('Saneado de mapas al abrirlos', () => {
  test('un mapa con datos maliciosos se abre sin ejecutar código', async ({ page, maps, pageErrors }) => {
    const payload = '</title><image href="x" onerror="window.__xss=1"/><title>'
    const data = JSON.parse(JSON.stringify(SAMPLE_TREE))
    Object.assign(data.root.children[0].data, { hyperlink: 'javascript:window.__xss=2', hyperlinkTitle: payload })
    Object.assign(data.root.children[1].data, { hyperlink: 'https://ok.example/', hyperlinkTitle: payload })
    Object.assign(data.root.children[2].data, { attachmentUrl: '/api/files/00000000-0000-0000-0000-000000000000', attachmentName: payload })
    const { app } = await setupMap(page, maps, { data })

    await page.waitForTimeout(300)
    expect(await page.evaluate(() => window.__xss)).toBeUndefined()
    // Ningún elemento inyectado dentro del SVG del mapa
    expect(await page.locator('#mindMapContainer [onerror]').count()).toBe(0)
    // El vínculo javascript: se descarta; el título se conserva como texto
    expect(await app.nodeData('Alfa', 'hyperlink')).toBeUndefined()
    expect(await app.nodeData('Beta', 'hyperlink')).toBe('https://ok.example/')
    await expect(app.node('Beta').locator('title').first()).toHaveText(payload)
  })
})

test.describe('Notas', () => {
  test('escribir una nota la guarda, muestra el icono y persiste', async ({ page, maps }) => {
    const { app, map } = await setupMap(page, maps)
    await app.selectNode('Beta')
    await cmd(app, 'element.notes').click()
    const editor = page.locator('.notes-editor')
    await expect(editor).toBeFocused()
    await editor.fill('Revisar con el equipo\nantes del viernes')
    await expect.poll(() => app.nodeData('Beta', 'note')).toBe('Revisar con el equipo\nantes del viernes')
    await expect(app.node('Beta').locator('.smm-node-note')).toHaveCount(1)
    await expect.poll(async () => (await maps.get(map.id)).data.root.children[1].data.note).toContain('viernes')
  })

  test('cambiar de tema guarda la nota pendiente y carga la del nuevo tema', async ({ page, maps }) => {
    const data = JSON.parse(JSON.stringify(SAMPLE_TREE))
    data.root.children[2].data.note = 'Nota de Gamma'
    const { app } = await setupMap(page, maps, { data })
    await app.strip('pane.notes').click()
    await app.selectNode('Beta')
    await page.locator('.notes-editor').fill('Nota de Beta')
    // Cambiar enseguida, antes de que venza el retardo de guardado
    await app.selectNode('Gamma')
    await expect(page.locator('.notes-editor')).toHaveValue('Nota de Gamma')
    await expect(page.locator('.notes-topic')).toHaveText('Gamma')
    expect(await app.nodeData('Beta', 'note')).toBe('Nota de Beta')
  })

  test('el icono de nota del tema abre el panel con esa nota', async ({ page, maps }) => {
    const data = JSON.parse(JSON.stringify(SAMPLE_TREE))
    data.root.children[0].data.note = 'Contexto de Alfa'
    const { app } = await setupMap(page, maps, { data })
    await app.node('Alfa').locator('.smm-node-note').click()
    await expect(page.locator('.task-pane-header')).toHaveText(/Notas/)
    await expect(page.locator('.notes-editor')).toHaveValue('Contexto de Alfa')
  })

  test('con varios temas seleccionados se pide elegir uno', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNodes('Beta', 'Gamma')
    await expect(cmd(app, 'element.notes')).toBeDisabled()
    await app.strip('pane.notes').click()
    await expect(page.locator('.notes-pane')).toContainText('Selecciona un solo tema')
    await expect(page.locator('.notes-editor')).toHaveCount(0)
  })

  test('una nota con HTML se muestra como texto', async ({ page, maps }) => {
    const data = JSON.parse(JSON.stringify(SAMPLE_TREE))
    data.root.children[1].data.note = '<img src=x onerror="window.__xss=3">'
    const { app } = await setupMap(page, maps, { data })
    await app.node('Beta').locator('.smm-node-note').hover()
    await page.waitForTimeout(200)
    expect(await page.evaluate(() => window.__xss)).toBeUndefined()
    await expect(page.getByText('<img src=x onerror="window.__xss=3">')).toBeVisible()
  })
})

test.describe('Imagen', () => {
  test('insertar una imagen la muestra en el tema', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    const png = await app.makePng(40, 20)
    await app.selectNode('Beta')
    await app.chooseFile(() => cmd(app, 'element.image').click(), { name: 'logo.png', mimeType: 'image/png', buffer: png })
    await expect.poll(() => app.nodeImage('Beta')).toMatch(/^data:image\/png;base64,/)
    expect(await app.nodeData('Beta', 'imageSize')).toMatchObject({ width: 40, height: 20 })
    await expect(app.node('Beta').locator('image')).toHaveCount(1)
  })

  test('[Regresión] la imagen sigue ahí al volver a abrir el mapa', async ({ page, maps }) => {
    const { app, map } = await setupMap(page, maps)
    await app.selectNode('Beta')
    await app.chooseFile(() => cmd(app, 'element.image').click(), { name: 'a.png', mimeType: 'image/png', buffer: await app.makePng(30, 30) })
    await expect.poll(() => app.nodeImage('Beta')).toMatch(/^data:image\/png;base64,/)
    // Esperar al autoguardado y recargar: el saneado al abrir no debe borrar la imagen
    await expect.poll(async () => JSON.stringify((await maps.get(map.id)).data.root.data.imgMap || {})).toContain('data:image/png')
    await page.reload()
    await app.openMapByTitle(map.title)
    await expect.poll(() => app.nodeImage('Beta')).toMatch(/^data:image\/png;base64,/)
    await expect(app.node('Beta').locator('image')).toHaveCount(1)
  })

  test('el saneado descarta imágenes no seguras del almacén de imágenes', async ({ page, maps }) => {
    const data = JSON.parse(JSON.stringify(SAMPLE_TREE))
    data.root.data.imgMap = { smm_img_key_bueno: 'data:image/png;base64,iVBORw0KGgo=', smm_img_key_malo: 'javascript:alert(1)' }
    const size = { width: 10, height: 10, custom: false }
    Object.assign(data.root.children[0].data, { image: 'smm_img_key_bueno', imageSize: size })
    Object.assign(data.root.children[1].data, { image: 'smm_img_key_malo', imageSize: size })
    Object.assign(data.root.children[2].data, { image: 'https://tracker.example/pixel.png', imageSize: size })
    // Imagen sin tamaño: antes hacía fallar el render y el mapa no se podía abrir
    data.root.children[0].children[0].data.image = 'smm_img_key_bueno'
    const { app } = await setupMap(page, maps, { data })
    expect(await app.nodeImage('Alfa')).toBe('data:image/png;base64,iVBORw0KGgo=')
    expect(await app.nodeData('Beta', 'image')).toBeUndefined()
    expect(await app.nodeData('Gamma', 'image')).toBeUndefined()
    expect(await app.nodeData('Alfa uno', 'image')).toBeUndefined()
    const imgMap = await page.evaluate(() => window.Alpine.$data(document.body).mindMap.renderer.root.getData('imgMap'))
    expect(Object.keys(imgMap || {})).not.toContain('smm_img_key_malo')
  })

  test('una imagen grande se reduce antes de guardarla', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    const png = await app.makePng(2400, 1200)
    await app.selectNode('Gamma')
    await app.chooseFile(() => cmd(app, 'element.image').click(), { name: 'grande.png', mimeType: 'image/png', buffer: png })
    await expect.poll(() => app.nodeData('Gamma', 'imageSize')).toMatchObject({ width: 1024, height: 512 })
  })

  test('rechaza SVG y archivos que no son imágenes', async ({ page, maps, pageErrors }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNode('Beta')
    await app.chooseFile(() => cmd(app, 'element.image').click(),
      { name: 'x.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') })
    await expect(app.errorBanner).toContainText('Formato no admitido')
    expect(await app.nodeData('Beta', 'image')).toBeUndefined()
  })

  test('"Quitar imagen" la elimina', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNode('Beta')
    await app.chooseFile(() => cmd(app, 'element.image').click(), { name: 'a.png', mimeType: 'image/png', buffer: await app.makePng(10, 10) })
    await expect.poll(() => app.nodeImage('Beta')).toBeTruthy()
    await app.chooseFromMenu('home', 'element.image', 'element.image.remove')
    await expect.poll(() => app.nodeImage('Beta')).toBeUndefined()
    await expect(app.node('Beta').locator('image')).toHaveCount(0)
  })
})

test.describe('Adjunto', () => {
  test('adjuntar un archivo muestra el icono y se descarga con su nombre y contenido', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    const content = Buffer.from('Acta de la reunión')
    await app.selectNode('Alfa')
    await app.chooseFile(() => cmd(app, 'element.attachment').click(), { name: 'acta.txt', mimeType: 'text/plain', buffer: content })
    await expect.poll(() => app.nodeData('Alfa', 'attachmentUrl')).toMatch(/^\/api\/files\/[0-9a-f-]{36}$/)
    expect(await app.nodeData('Alfa', 'attachmentName')).toBe('acta.txt')

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      app.chooseFromMenu('home', 'element.attachment', 'element.attachment.open')
    ])
    expect(download.suggestedFilename()).toBe('acta.txt')
    const file = test.info().outputPath('acta.txt')
    await download.saveAs(file)
    expect(require('fs').readFileSync(file, 'utf8')).toBe('Acta de la reunión')
  })

  test('el nombre del adjunto se guarda escapado y "Quitar adjunto" lo elimina', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNode('Gamma')
    // Nombre de archivo válido en cualquier sistema (sin "/") pero con HTML
    await app.chooseFile(() => cmd(app, 'element.attachment').click(),
      { name: '<img src=x onerror=window.__xss=4>.txt', mimeType: 'text/plain', buffer: Buffer.from('x') })
    await expect.poll(() => app.nodeData('Gamma', 'attachmentName')).toBe('&lt;img src=x onerror=window.__xss=4&gt;.txt')
    await expect(app.node('Gamma').locator('img, [onerror]')).toHaveCount(0)
    expect(await page.evaluate(() => window.__xss)).toBeUndefined()

    await app.chooseFromMenu('home', 'element.attachment', 'element.attachment.remove')
    await expect.poll(() => app.nodeData('Gamma', 'attachmentUrl')).toBeUndefined()
  })

  test('sin adjunto, "Abrir adjunto" y "Quitar adjunto" están deshabilitados', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNode('Beta')
    await app.ribbonPanel('home').locator('[data-menu-for="element.attachment"]').click()
    await expect(app.menu.locator('[data-cmd="element.attachment.open"]')).toBeDisabled()
    await expect(app.menu.locator('[data-cmd="element.attachment.remove"]')).toBeDisabled()
    await expect(app.menu.locator('[data-cmd="element.attachment"]')).toBeEnabled()
  })
})
