// Fase 20 · Notas con formato: negrita, cursiva, subrayado, tachado, listas y vínculos
const { test, expect, setupMap, SAMPLE_TREE } = require('./fixtures')

const clone = o => JSON.parse(JSON.stringify(o))
const editor = page => page.locator('.notes-editor')
const toolbar = (page, cmd) => page.locator(`.notes-toolbar [data-note-cmd="${cmd}"]`)

async function openNotesFor(app, text) {
  await app.selectNode(text)
  await app.ribbonCmd('home', 'element.notes').click()
  await expect(editor(app.page)).toBeVisible()
}

test.describe('Notas con formato', () => {
  test('negrita y lista desde la barra; se guarda el texto plano y el formato; sobrevive a recargar', async ({ page, maps }) => {
    const { app, map } = await setupMap(page, maps)
    await openNotesFor(app, 'Beta')
    await editor(page).click()
    await page.keyboard.type('Importante')
    await page.keyboard.press('ControlOrMeta+a')
    await toolbar(page, 'bold').click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await toolbar(page, 'bold').click() // deja de escribir en negrita
    await toolbar(page, 'ul').click()
    await page.keyboard.type('uno')
    await page.keyboard.press('Enter')
    await page.keyboard.type('dos')
    await expect.poll(() => app.nodeData('Beta', 'note')).toBe('Importante\n- uno\n- dos')
    const html = await app.nodeData('Beta', '_noteHtml')
    expect(html).toContain('<b>Importante</b>')
    expect(html).toMatch(/<ul><li>uno<\/li><li>dos<\/li><\/ul>/)
    // Chromium mete la lista dentro de un <p>: no deben quedar párrafos vacíos
    expect(html).not.toContain('<p></p>')

    await expect.poll(async () => (await maps.get(map.id)).data.root.children[1].data._noteHtml).toContain('<b>')
    await page.reload()
    await app.openMapByTitle(map.title)
    await openNotesFor(app, 'Beta')
    await expect(editor(page).locator('b')).toHaveText('Importante')
    await expect(editor(page).locator('li')).toHaveText(['uno', 'dos'])
  })

  test('una nota sin formato solo guarda el texto plano; las notas antiguas se abren tal cual', async ({ page, maps }) => {
    const data = clone(SAMPLE_TREE)
    data.root.children[2].data.note = 'Línea 1\nLínea 2'
    const { app } = await setupMap(page, maps, { data })
    await openNotesFor(app, 'Gamma')
    await expect(editor(page).locator('p')).toHaveText(['Línea 1', 'Línea 2'])
    await editor(page).click()
    await page.keyboard.press('ControlOrMeta+End')
    await page.keyboard.type(' más')
    await expect.poll(() => app.nodeData('Gamma', 'note')).toBe('Línea 1\nLínea 2 más')
    expect(await app.nodeData('Gamma', '_noteHtml')).toBeUndefined()
  })

  test('vínculo en la nota: solo direcciones seguras', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await openNotesFor(app, 'Beta')
    await editor(page).click()
    await page.keyboard.type('web')
    await page.keyboard.press('ControlOrMeta+a')
    await toolbar(page, 'link').click()
    const input = page.locator('.notes-link-row [name="noteLink"]')
    await input.fill('javascript:alert(1)')
    await input.press('Enter')
    await expect(page.locator('.notes-link-row .dialog-error')).toBeVisible()
    await input.fill('ejemplo.com')
    await input.press('Enter')
    await expect(editor(page).locator('a')).toHaveAttribute('href', 'https://ejemplo.com/')
    await expect.poll(() => app.nodeData('Beta', '_noteHtml')).toContain('href="https://ejemplo.com/"')
  })

  test('el tooltip de la nota muestra el formato', async ({ page, maps }) => {
    const data = clone(SAMPLE_TREE)
    Object.assign(data.root.children[1].data, { note: 'Hola mundo', _noteHtml: '<p><b>Hola</b> mundo</p>' })
    const { app } = await setupMap(page, maps, { data })
    await app.node('Beta').locator('.smm-node-note').hover()
    const tip = page.locator('.note-tooltip')
    await expect(tip).toBeVisible()
    await expect(tip.locator('b')).toHaveText('Hola')
  })

  test('cada pausa al escribir es un paso de deshacer; "Quitar notas" quita también el formato', async ({ page, maps }) => {
    const data = clone(SAMPLE_TREE)
    Object.assign(data.root.children[1].data, { note: 'Hola', _noteHtml: '<p><b>Hola</b></p>' })
    const { app } = await setupMap(page, maps, { data })
    await app.selectNode('Beta')
    await app.chooseFromMenu('home', 'clear.format', 'clear.notes')
    await expect.poll(() => app.nodeData('Beta', 'note')).toBeUndefined()
    expect(await app.nodeData('Beta', '_noteHtml')).toBeUndefined()
    await app.qat('edit.undo').click()
    await expect.poll(() => app.nodeData('Beta', '_noteHtml')).toBe('<p><b>Hola</b></p>')
  })

  test('Buscar en notas encuentra el texto de una nota con formato', async ({ page, maps }) => {
    const data = clone(SAMPLE_TREE)
    Object.assign(data.root.children[2].data, { note: 'presupuesto anual', _noteHtml: '<p><i>presupuesto</i> anual</p>' })
    const { app } = await setupMap(page, maps, { data })
    await page.keyboard.press('ControlOrMeta+f')
    await page.locator('.find-bar [data-action="include-notes"]').click()
    await page.locator('.find-bar [name="findText"]').fill('presupuesto anual')
    await expect(page.locator('.find-status')).toHaveText('1 de 1')
  })

  test('[Seguridad] el HTML de una nota se sanea al abrir el mapa y al mostrarlo', async ({ page, maps }) => {
    const data = clone(SAMPLE_TREE)
    Object.assign(data.root.children[1].data, {
      note: 'x',
      _noteHtml: '<p onclick="window.__xss=1">ok<img src=x onerror="window.__xss=2"><script>window.__xss=3</script>' +
        '<a href="javascript:window.__xss=4">mal</a><a href="https://bien.example/">bien</a><iframe src="https://x"></iframe></p>'
    })
    const { app } = await setupMap(page, maps, { data })
    const html = await app.nodeData('Beta', '_noteHtml')
    expect(html).toBe('<p>okmal<a href="https://bien.example/" target="_blank" rel="noopener noreferrer">bien</a></p>')
    await openNotesFor(app, 'Beta')
    await app.node('Beta').locator('.smm-node-note').hover()
    await page.waitForTimeout(300)
    expect(await page.evaluate(() => window.__xss)).toBeUndefined()
  })

  test('[Seguridad] pegar HTML de otra página solo conserva el formato permitido', async ({ page, maps, browserName }) => {
    // Firefox no pasa clipboardData a un ClipboardEvent creado por la prueba (con un pegado real sí)
    test.skip(browserName !== 'chromium', 'el pegado sintético solo funciona en Chromium')
    const { app } = await setupMap(page, maps)
    await openNotesFor(app, 'Beta')
    await editor(page).click()
    await page.evaluate(() => {
      const dt = new DataTransfer()
      dt.setData('text/html', '<meta charset="utf-8"><h1 style="color:red">Título</h1><p onclick="window.__xss=1">Texto <b>clave</b>' +
        '<img src=x onerror="window.__xss=2"><a href="javascript:window.__xss=3">mal</a></p><script>window.__xss=4</script><ul><li>punto</li></ul>')
      dt.setData('text/plain', 'Título Texto clave mal punto')
      document.querySelector('.notes-editor').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    })
    await expect(editor(page).locator('b')).toHaveText('clave')
    await expect(editor(page).locator('li')).toHaveText('punto')
    await expect(editor(page).locator('img, script, h1, [onclick], [style]')).toHaveCount(0)
    await expect.poll(() => app.nodeData('Beta', 'note')).toContain('Texto clave')
    const html = await app.nodeData('Beta', '_noteHtml')
    expect(html).not.toMatch(/<(img|script|h1)|on\w+=|javascript:|style=/i)
    await page.waitForTimeout(300)
    expect(await page.evaluate(() => window.__xss)).toBeUndefined()
  })

  test('exportar a Markdown conserva negrita, cursiva, listas y vínculos', async ({ page, maps }) => {
    const data = clone(SAMPLE_TREE)
    Object.assign(data.root.children[1].data, {
      note: 'Hola\n- uno',
      _noteHtml: '<p><b>Hola</b> <i>mundo</i> <a href="https://e.example/">web</a></p><ul><li>uno</li></ul>'
    })
    const { app } = await setupMap(page, maps, { data })
    const md = await page.evaluate(() => buildMarkdown(mapDocument(Alpine.raw(window.Alpine.$data(document.body).mindMap).getData(false))))
    expect(md).toContain('**Hola** *mundo* [web](<https://e.example/>)')
    expect(md).toContain('- uno')
    void app
  })
})
