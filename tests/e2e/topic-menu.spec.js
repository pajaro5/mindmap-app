// Fase 1 · Botón dividido "Tema": después, antes y tema padre
const { test, expect, setupMap } = require('./fixtures')

const rootChildren = async app => (await app.tree()).c.map(c => c.t)

test.describe('Desplegable de Tema', () => {
  test('el desplegable muestra las tres opciones con su atajo y no queda recortado', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNode('Beta')
    await app.ribbonPanel('home').locator('[data-menu-for="topic.insertSibling"]').click()
    await expect(app.menu).toBeVisible()

    const items = app.menu.locator('[role="menuitem"]')
    await expect(items).toHaveCount(3)
    await expect(items.nth(0)).toContainText('Tema después')
    await expect(items.nth(0)).toContainText('Enter')
    await expect(items.nth(1)).toContainText('Tema antes')
    await expect(items.nth(1)).toContainText('Shift+Enter')
    await expect(items.nth(2)).toContainText('Tema padre')
    await expect(items.nth(2)).toContainText('Shift+Tab')

    // El menú se dibuja por encima del lienzo, fuera de la cinta
    const menuBox = await app.menu.boundingBox()
    const ribbonBox = await page.locator('.ribbon').boundingBox()
    expect(menuBox.y + menuBox.height).toBeGreaterThan(ribbonBox.y + ribbonBox.height)
    await expect(items.nth(2)).toBeInViewport()
  })

  test('Esc y clic fuera cierran el desplegable', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    const arrow = app.ribbonPanel('home').locator('[data-menu-for="topic.insertSibling"]')
    await arrow.click()
    await expect(app.menu).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(app.menu).toBeHidden()

    await arrow.click()
    await expect(app.menu).toBeVisible()
    await page.locator('.statusbar').click()
    await expect(app.menu).toBeHidden()

    await arrow.click()
    await arrow.click()
    await expect(app.menu).toBeHidden()
  })

  test('el botón principal inserta el tema después', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNode('Beta')
    await app.ribbonCmd('home', 'topic.insertSibling').click()
    await app.typeNewTopic('Nuevo')
    await expect.poll(() => rootChildren(app)).toEqual(['Alfa', 'Beta', 'Nuevo', 'Gamma'])
  })

  test('Tema antes inserta el tema delante del seleccionado', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNode('Beta')
    await app.chooseFromMenu('home', 'topic.insertSibling', 'topic.insertBefore')
    await app.typeNewTopic('Antes de Beta')
    await expect.poll(() => rootChildren(app)).toEqual(['Alfa', 'Antes de Beta', 'Beta', 'Gamma'])
  })

  test('Tema antes funciona con el primer hijo', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNode('Alfa')
    await app.chooseFromMenu('home', 'topic.insertSibling', 'topic.insertBefore')
    await app.typeNewTopic('Primero')
    await expect.poll(() => rootChildren(app)).toEqual(['Primero', 'Alfa', 'Beta', 'Gamma'])
  })

  test('Shift+Enter inserta el tema antes', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNode('Gamma')
    await page.keyboard.press('Shift+Enter')
    await app.typeNewTopic('Antes de Gamma')
    await expect.poll(() => rootChildren(app)).toEqual(['Alfa', 'Beta', 'Antes de Gamma', 'Gamma'])
  })

  test('Tema antes queda en el historial', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNode('Beta')
    // Solo la inserción (sin escribir texto), para tener exactamente una entrada de historial
    await app.recordsHistory(async () => {
      await app.chooseFromMenu('home', 'topic.insertSibling', 'topic.insertBefore')
      await expect(app.editBox).toBeVisible()
      await page.keyboard.press('Escape')
    })
    expect(await rootChildren(app)).toEqual(['Alfa', 'Tema principal', 'Beta', 'Gamma'])

    await app.qat('edit.undo').click()
    await expect.poll(() => rootChildren(app)).toEqual(['Alfa', 'Beta', 'Gamma'])
  })

  test('Tema padre inserta un nivel entre el tema y su padre', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNode('Gamma')
    await app.chooseFromMenu('home', 'topic.insertSibling', 'topic.insertParent')
    await app.typeNewTopic('Contenedor')
    await expect.poll(async () => (await app.tree()).c.map(c => `${c.t}[${c.c.map(x => x.t).join(',')}]`))
      .toEqual(['Alfa[Alfa uno]', 'Beta[]', 'Contenedor[Gamma]'])
  })

  test('con el tema central seleccionado, las opciones del desplegable están deshabilitadas', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectRoot()
    await app.ribbonPanel('home').locator('[data-menu-for="topic.insertSibling"]').click()
    const items = app.menu.locator('[role="menuitem"]')
    await expect(items).toHaveCount(3)
    for (let i = 0; i < 3; i++) await expect(items.nth(i)).toBeDisabled()
  })
})
