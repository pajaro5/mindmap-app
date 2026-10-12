// Marcadores de icono
const { test, expect } = require('./fixtures')

test('el comando Marcadores de icono abre el panel', async ({ openMap, page }) => {
  const { app } = openMap
  await app.ribbonCmd('home', 'markers.icons').click()
  await expect(page.locator('.task-pane-header')).toHaveText(/Marcadores/)
  await expect(page.locator('.task-pane .icon-btn').first()).toBeVisible()
})

test('asignar y quitar un marcador a un tema', async ({ openMap, page }) => {
  const { app } = openMap
  await app.strip('pane.markers').click()
  const firstIcon = page.locator('.task-pane .icon-btn').first()
  await expect(firstIcon).toBeDisabled()

  await app.selectRoot()
  await expect(firstIcon).toBeEnabled()
  const iconId = await firstIcon.getAttribute('title')
  const rootHasIcon = () => page.evaluate(id => {
    const node = window.Alpine.$data(document.body).activeNodeList[0]
    return (node.getData('icon') || []).includes(id)
  }, iconId)

  await firstIcon.click()
  await expect.poll(rootHasIcon).toBe(true)
  await expect(firstIcon).toHaveClass(/active/)
  await firstIcon.click()
  await expect.poll(rootHasIcon).toBe(false)
})
