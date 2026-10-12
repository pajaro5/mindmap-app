// Ciclo de vida de los mapas: crear, renombrar, persistir, eliminar, compatibilidad
const { test, expect } = require('./fixtures')

test('crear un mapa desde la barra de acceso rápido renderiza el tema central', async ({ app, page, maps }) => {
  await app.qat('map.new').click()
  await expect(app.rootNode).toBeVisible()
  const state = await app.state()
  maps.track(state.currentId)
  expect(state.errorMsg).toBe('')
  await app.expectNodeCount(1)
  await expect(app.rootNode).toContainText('Tema central')
  await expect(page.locator('.map-list li.active')).toContainText('Mapa sin título')
})

test('renombrar el mapa persiste en el backend', async ({ openMap, maps }) => {
  const { app, map } = openMap
  await app.titleInput.fill('Renombrado E2E')
  await app.titleInput.press('Enter')
  await app.titleInput.dispatchEvent('change')
  await expect.poll(async () => (await maps.get(map.id)).title).toBe('Renombrado E2E')
})

test('el mapa editado persiste tras recargar la página', async ({ openMap, page, maps }) => {
  const { app, map } = openMap
  await app.selectRoot()
  await page.keyboard.press('Tab')
  await app.typeNewTopic('Hijo persistente')
  await app.expectNodeCount(2)
  await expect.poll(async () => JSON.stringify((await maps.get(map.id)).data.root)).toContain('Hijo persistente')

  await page.reload()
  await app.openMapByTitle(map.title)
  await app.expectNodeCount(2)
  await expect(app.nodes.filter({ hasText: 'Hijo persistente' })).toHaveCount(1)
})

test('eliminar un mapa lo quita de la lista y del backend', async ({ openMap, page, maps }) => {
  const { app, map } = openMap
  await page.locator('.map-list li', { hasText: map.title }).locator('.btn-icon').click()
  await expect(page.locator('.map-list li', { hasText: map.title })).toHaveCount(0)
  await expect(page.locator('.placeholder')).toBeVisible()
  expect(await maps.get(map.id)).toBeNull()
  maps.forget(map.id)
})

test('si el mapa se borra en otra pestaña, el autoguardado lo indica en vez de fallar en silencio', async ({ openMap, page, request, maps, pageErrors }) => {
  const { app, map } = openMap
  await request.delete(`/api/maps/${map.id}`)
  maps.forget(map.id)
  await app.selectRoot()
  await page.keyboard.press('Tab')
  await expect(page.locator('.save-status')).toHaveText('Error al guardar: el mapa ya no existe')
  // El navegador registra el 404 en consola; es el comportamiento esperado en esta prueba
  pageErrors.length = 0
})

test('un mapa antiguo (tema "default") se abre con el tema nuevo', async ({ page, maps, app }) => {
  const legacy = await maps.create({
    data: { layout: 'logicalStructure', root: { data: { text: 'Legado' }, children: [] }, theme: { template: 'default', config: {} }, view: {} }
  })
  await app.goto()
  await app.openMapByTitle(legacy.title)
  await expect(app.rootNode).toContainText('Legado')
  const theme = await page.evaluate(() => {
    const cfg = window.Alpine.$data(document.body).mindMap.themeConfig
    return { second: cfg.second.fillColor, line: cfg.lineStyle }
  })
  expect(theme).toEqual({ second: '#7dc142', line: 'curve' })
  // Conserva su diseño original
  expect((await app.state()).layout).toBe('logicalStructure')
})
