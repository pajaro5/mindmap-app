// Regresión del bug "el lienzo queda tapado/cortado por el panel lateral".
// Causa raíz original: el <svg> del mapa se dimensionaba antes de que se mostraran la
// barra de herramientas y el panel de iconos, y nunca se volvía a ajustar.
const { test, expect } = require('./fixtures')

test.describe('[Regresión] Tamaño del lienzo', () => {
  test('el SVG del mapa mide lo mismo que su contenedor al abrirlo', async ({ openMap }) => {
    await openMap.app.expectSvgFitsContainer()
  })

  test('editar temas no desplaza la página', async ({ openMap, page }) => {
    const { app } = openMap
    await app.selectRoot()
    await page.keyboard.press('Tab')
    await page.keyboard.type('Nodo de scroll')
    await page.keyboard.press('Enter')
    await app.expectNodeCount(2)
    const g = await app.geometry()
    expect(g.scrollX).toBe(0)
    expect(g.scrollY).toBe(0)
    expect(g.docH).toBeLessThanOrEqual(g.winH)
  })

  test('abrir y cerrar el panel lateral reajusta el lienzo sin solaparse', async ({ openMap, page }) => {
    const { app } = openMap
    const before = await app.geometry()
    await page.locator('.task-pane-close').click()
    await expect.poll(async () => (await app.geometry()).container.w).toBeGreaterThan(before.container.w)
    await app.expectSvgFitsContainer()

    await app.strip('pane.markers').click()
    await expect.poll(async () => (await app.geometry()).container.w).toBe(before.container.w)
    await app.expectSvgFitsContainer()

    const overlap = await page.evaluate(() =>
      document.querySelector('.canvas-wrap').getBoundingClientRect().right -
      document.querySelector('.task-pane').getBoundingClientRect().left)
    expect(overlap).toBeLessThanOrEqual(0)
  })

  test('redimensionar la ventana reajusta el lienzo', async ({ openMap, page }) => {
    const { app } = openMap
    await page.setViewportSize({ width: 1000, height: 600 })
    await app.expectSvgFitsContainer()
    await page.setViewportSize({ width: 1280, height: 720 })
    await app.expectSvgFitsContainer()
  })
})
