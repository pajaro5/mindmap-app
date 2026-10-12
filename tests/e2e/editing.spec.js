// Edición de temas con teclado y con la cinta; deshacer/rehacer
const { test, expect } = require('./fixtures')

test('editar el texto del tema central', async ({ openMap, page }) => {
  const { app } = openMap
  await app.rootNode.dblclick()
  const editBox = page.locator('.smm-richtext-node-edit-wrap')
  await expect(editBox).toBeVisible()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.type('Mi Proyecto')
  await page.keyboard.press('Enter')
  await expect(app.rootNode).toContainText('Mi Proyecto')
})

test('Tab crea un subtema y Enter un tema hermano', async ({ openMap, page }) => {
  const { app } = openMap
  await app.selectRoot()
  await page.keyboard.press('Tab')
  await page.keyboard.type('Subtema 1')
  await page.keyboard.press('Enter')
  await app.expectNodeCount(2)

  await app.nodes.filter({ hasText: 'Subtema 1' }).click()
  await page.keyboard.press('Enter')
  await page.keyboard.type('Subtema 2')
  await page.keyboard.press('Enter')
  await app.expectNodeCount(3)
  await expect(app.nodes.filter({ hasText: 'Subtema 2' })).toHaveCount(1)
})

test('deshacer y rehacer desde la barra de acceso rápido', async ({ openMap, page }) => {
  const { app } = openMap
  await app.selectRoot()
  await page.keyboard.press('Tab')
  await app.expectNodeCount(2)
  await app.clickEmptyCanvas()

  await app.qat('edit.undo').click()
  await app.expectNodeCount(1)
  await app.qat('edit.redo').click()
  await app.expectNodeCount(2)
})

test('cinta: Subtema, Tema y Eliminar', async ({ openMap, page }) => {
  const { app } = openMap
  await app.selectRoot()
  await app.ribbonCmd('home', 'topic.insertChild').click()
  await app.expectNodeCount(2)
  await page.keyboard.press('Escape')

  // El nodo recién creado queda activo: insertar un hermano
  await app.ribbonCmd('home', 'topic.insertSibling').click()
  await app.expectNodeCount(3)
  await page.keyboard.press('Escape')

  await app.ribbonCmd('home', 'topic.remove').click()
  await app.expectNodeCount(2)
})
