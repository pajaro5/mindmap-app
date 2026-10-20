// Fase 22 · Llamadas con subtemas y temas flotantes (sin ancla visible)
const { test, expect, setupMap, SAMPLE_TREE } = require('./fixtures')

const clone = o => JSON.parse(JSON.stringify(o))
const dialog = page => page.locator('#appDialog')
const calloutsOf = (app, text) => app.nodeData(text, '_callouts')
const balloons = page => page.locator('#mindMapContainer .smm-callouts .smm-callout')

test.describe('Llamadas con subtemas', () => {
  test('la llamada guarda y dibuja sus subtemas como viñetas; se editan', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNode('Beta')
    await app.ribbonCmd('home', 'insert.callout').click()
    await dialog(page).locator('[name="calloutText"]').fill('Riesgos')
    await dialog(page).locator('[name="calloutItems"]').fill('Plazo\n\n  Coste  \nCalidad')
    await dialog(page).getByRole('button', { name: 'Aceptar' }).click()
    await expect.poll(async () => ((await calloutsOf(app, 'Beta')) || [])[0]).toMatchObject({ text: 'Riesgos', items: ['Plazo', 'Coste', 'Calidad'] })
    await expect(balloons(page).locator('tspan')).toHaveText(['Riesgos', '• Plazo', '• Coste', '• Calidad'])

    await balloons(page).first().dblclick()
    await expect(dialog(page).locator('[name="calloutItems"]')).toHaveValue('Plazo\nCoste\nCalidad')
    await dialog(page).locator('[name="calloutItems"]').fill('Plazo')
    await dialog(page).getByRole('button', { name: 'Aceptar' }).click()
    await expect(balloons(page).locator('tspan')).toHaveText(['Riesgos', '• Plazo'])
  })
})

test.describe('Temas flotantes', () => {
  test('se insertan sin conector, se mueven, se editan y se borran; todo se deshace', async ({ page, maps }) => {
    const { app, map } = await setupMap(page, maps)
    await app.chooseFromMenu('home', 'insert.callout', 'insert.floating')
    await expect(dialog(page).locator('#appDialogTitle')).toHaveText('Nuevo tema flotante')
    await dialog(page).locator('[name="calloutText"]').fill('Ideas sueltas')
    await dialog(page).locator('[name="calloutItems"]').fill('Una\nOtra')
    await app.recordsHistory(() => dialog(page).getByRole('button', { name: 'Aceptar' }).click())

    const floating = balloons(page).filter({ hasText: 'Ideas sueltas' })
    await expect(floating).toHaveCount(1)
    await expect(floating).toHaveClass(/smm-floating/)
    await expect(floating.locator('line')).toHaveCount(0) // sin conector
    const saved = (await calloutsOf(app, 'Raíz'))[0]
    expect(saved).toMatchObject({ text: 'Ideas sueltas', items: ['Una', 'Otra'], floating: true })

    // Arrastrar
    const box = await floating.locator('.smm-callout-box').boundingBox()
    await page.mouse.move(box.x + 10, box.y + 10)
    await page.mouse.down()
    await page.mouse.move(box.x + 70, box.y + 50, { steps: 5 })
    await page.mouse.up()
    await expect.poll(async () => (await calloutsOf(app, 'Raíz'))[0].dx).toBe(saved.dx + 60)
    await expect.poll(async () => ((await maps.get(map.id)).data.root.data._callouts || [])[0].dx).toBe(saved.dx + 60)

    // Seleccionado: Supr lo borra y Deshacer lo recupera
    await floating.locator('.smm-callout-box').click()
    await page.keyboard.press('Delete')
    await expect(balloons(page)).toHaveCount(0)
    await app.qat('edit.undo').click()
    await expect(balloons(page)).toHaveCount(1)
  })

  test('sin mapa no se puede insertar; con mapa no hace falta tener un tema seleccionado', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.ribbonPanel('home').locator('[data-menu-for="insert.callout"]').click()
    await expect(app.menu.locator('[data-cmd="insert.floating"]')).toBeEnabled()
  })

  test('las exportaciones incluyen temas flotantes y subtemas de las llamadas', async ({ page, maps }) => {
    const data = clone(SAMPLE_TREE)
    data.root.data._callouts = [{ id: 'f1', text: 'Flotante', items: ['x'], floating: true, dx: 300, dy: 200 }]
    data.root.children[1].data._callouts = [{ id: 'c1', text: 'Llamada', items: ['uno', 'dos'], dx: 20, dy: -10 }]
    const { app } = await setupMap(page, maps, { data })
    const md = await page.evaluate(() => buildMarkdown(mapDocument(Alpine.raw(window.Alpine.$data(document.body).mindMap).getData(false))))
    expect(md).toContain('> **Tema flotante:** Flotante\n> - x')
    expect(md).toContain('> **Llamada:** Llamada\n> - uno\n> - dos')
    void app
  })

  test('[Seguridad] subtemas con HTML se muestran como texto y los datos raros se limpian', async ({ page, maps }) => {
    const data = clone(SAMPLE_TREE)
    data.root.children[1].data._callouts = [{
      id: 'c1', text: 'ok', floating: 'yes',
      items: ['<img src=x onerror="window.__xss=1">', 5, null, 'a'.repeat(400), ...Array.from({ length: 30 }, (_, i) => `i${i}`)]
    }]
    const { app } = await setupMap(page, maps, { data })
    const c = (await calloutsOf(app, 'Beta'))[0]
    expect(c.floating).toBeUndefined()
    expect(c.items.length).toBe(20)
    expect(c.items[0]).toBe('<img src=x onerror="window.__xss=1">')
    expect(c.items[1].length).toBe(200)
    // Se pinta como texto SVG (en varias líneas si es largo), nunca como HTML
    await expect(balloons(page).first()).toContainText('• <img src=x')
    await expect(balloons(page).first().locator('img')).toHaveCount(0)
    await page.waitForTimeout(200)
    expect(await page.evaluate(() => window.__xss)).toBeUndefined()
  })
})
