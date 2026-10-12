// Zoom (cinta y barra de estado) y diseño del mapa
const { test, expect } = require('./fixtures')

test('zoom desde la cinta: acercar, alejar y tamaño real', async ({ openMap }) => {
  const { app } = openMap
  const initial = await app.scale()
  await app.clickRibbon('view', 'view.zoomIn')
  await expect.poll(() => app.scale()).toBeGreaterThan(initial)
  const zoomed = await app.scale()
  await app.ribbonCmd('view', 'view.zoomOut').click()
  await app.ribbonCmd('view', 'view.zoomOut').click()
  await expect.poll(() => app.scale()).toBeLessThan(zoomed)
  await app.ribbonCmd('view', 'view.actualSize').click()
  await expect.poll(() => app.scale()).toBeCloseTo(1, 2)
})

test('la barra de estado refleja y controla el zoom', async ({ openMap }) => {
  const { app } = openMap
  await app.status('view.actualSize').click()
  await expect(app.zoomValue).toHaveText('100%')
  await app.status('view.zoomIn').click()
  await expect(app.zoomValue).not.toHaveText('100%')
  expect(parseInt(await app.zoomValue.textContent())).toBeGreaterThan(100)

  await app.zoomSlider.fill('50')
  await expect.poll(() => app.scale()).toBeCloseTo(0.5, 2)
  await expect(app.zoomValue).toHaveText('50%')
})

test('ajustar a la ventana cambia la vista', async ({ openMap }) => {
  const { app } = openMap
  await app.status('view.zoomIn').click()
  await app.status('view.zoomIn').click()
  const before = await app.scale()
  await app.status('view.fit').click()
  await expect.poll(() => app.scale()).not.toBe(before)
})

test('cambiar el diseño Radial/Árbol y persistirlo', async ({ openMap, maps }) => {
  const { app, map } = openMap
  await app.clickRibbon('format', 'layout.tree')
  await expect.poll(async () => (await maps.get(map.id)).data.layout).toBe('logicalStructure')
  await expect(app.ribbonCmd('format', 'layout.tree')).toHaveAttribute('aria-pressed', 'true')
  await app.ribbonCmd('format', 'layout.radial').click()
  await expect.poll(async () => (await maps.get(map.id)).data.layout).toBe('mindMap')
})

test('los mapas nuevos usan el tema mindmanager', async ({ openMap, page, maps }) => {
  const { map } = openMap
  const theme = await page.evaluate(() => {
    const cfg = window.Alpine.$data(document.body).mindMap.themeConfig
    return { second: cfg.second.fillColor, line: cfg.lineStyle }
  })
  expect(theme).toEqual({ second: '#7dc142', line: 'curve' })
  expect((await maps.get(map.id)).data.theme.template).toBe('mindmanager')
})
