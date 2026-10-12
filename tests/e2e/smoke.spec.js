// Carga inicial, marca (logo cerebro) y estado vacío
const { test, expect } = require('./fixtures')

test('la app carga sin errores y muestra el panel Mis mapas', async ({ app, page }) => {
  await expect(page.locator('.task-pane-header')).toHaveText(/Mis mapas/)
  await expect(app.errorBanner).toBeHidden()
  await expect(page.locator('.placeholder')).toBeVisible()
})

test('el logo es el cerebro estilizado (sin marca de terceros)', async ({ app, page }) => {
  const logo = page.locator('.app-logo svg')
  await expect(logo).toBeVisible()
  // Dos hemisferios + circunvoluciones, sin texto dentro del logo
  expect(await logo.locator('path').count()).toBeGreaterThanOrEqual(4)
  expect(await logo.locator('text').count()).toBe(0)
  const box = await logo.boundingBox()
  expect(Math.round(box.width)).toBeGreaterThanOrEqual(24)
})

test('el favicon se sirve como SVG', async ({ request, page, app }) => {
  const res = await request.get('/favicon.svg')
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toContain('image/svg+xml')
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon.svg')
})

test('la lista de mapas se carga desde la API', async ({ page, maps }) => {
  const map = await maps.create()
  await page.goto('/')
  await expect(page.locator('.map-list li', { hasText: map.title })).toBeVisible()
})
