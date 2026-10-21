// Fase 20 · Pendientes de Formato: temas propios, imagen de fondo y equilibrar el mapa
const { test, expect, setupMap, SAMPLE_TREE } = require('./fixtures')

const clone = o => JSON.parse(JSON.stringify(o))
const cmd = (app, id) => app.ribbonCmd('format', id)
const dialog = page => page.locator('#appDialog')
const savedFormat = app => app.page.evaluate(() =>
  Alpine.raw(window.Alpine.$data(document.body).mindMap).renderer.renderTree.data._mapFormat)

test.describe('Temas propios', () => {
  test('guardar el formato actual como tema, aplicarlo en otro mapa y borrarlo', async ({ page, maps, request }) => {
    const { app } = await setupMap(page, maps)
    await app.ribbonTab('format').click()
    await cmd(app, 'mapTheme.apply').click()
    await app.menu.locator('[data-option="mm-night"]').click()
    await cmd(app, 'mapFormat.lineStyle').selectOption('direct')
    await cmd(app, 'mapFormat.shadow').click()
    await expect.poll(() => savedFormat(app)).toEqual({ theme: 'mm-night', lineStyle: 'direct', shadow: true })

    await cmd(app, 'mapTheme.save').click()
    const name = `Tema E2E ${Date.now().toString(36)}`
    await dialog(page).locator('[name="themeName"]').fill(name)
    await dialog(page).getByRole('button', { name: 'Guardar' }).click()
    await expect(dialog(page)).toBeHidden()

    // En otro mapa: la galería lo ofrece en "Mis temas" y lo aplica entero
    const other = await maps.create()
    await app.openMapByTitle(other.title)
    await app.ribbonTab('format').click()
    await cmd(app, 'mapTheme.apply').click()
    const option = app.menu.locator('.ribbon-menu-item[data-option^="user:"]', { hasText: name })
    await expect(option).toHaveCount(1)
    await option.click()
    await expect.poll(() => savedFormat(app)).toEqual({ theme: 'mm-night', lineStyle: 'direct', shadow: true })
    await cmd(app, 'mapTheme.apply').click()
    await expect(app.menu.locator('.ribbon-menu-item[data-option^="user:"]', { hasText: name })).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('Escape')

    // Borrar desde el diálogo
    await cmd(app, 'mapTheme.save').click()
    const row = dialog(page).locator('.user-theme', { hasText: name })
    await expect(row).toHaveCount(1)
    await row.locator('[data-action="delete-theme"]').click()
    await expect(row).toHaveCount(0)
    await dialog(page).getByRole('button', { name: 'Cancelar' }).click()
    const list = await (await request.get('/api/themes')).json()
    expect(list.some(t => t.title === name)).toBe(false)
  })

  test('el nombre es obligatorio', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.clickRibbon('format', 'mapTheme.save')
    await dialog(page).getByRole('button', { name: 'Guardar' }).click()
    await expect(dialog(page).locator('.dialog-error')).toHaveText(/nombre/)
  })

  test('[Seguridad] la API valida el formato y el nombre se muestra como texto', async ({ page, maps, request }) => {
    const bad = await request.post('/api/themes', { data: { title: 'x', format: { theme: 'a', evil: '<script>' } } })
    expect(bad.status()).toBe(400)
    const big = await request.post('/api/themes', { data: { title: 'x', format: { theme: 'a'.repeat(5000) } } })
    expect(big.status()).toBe(400)
    const noName = await request.post('/api/themes', { data: { title: '  ', format: { theme: 'mm-night' } } })
    expect(noName.status()).toBe(400)
    const payload = '<img src=x onerror="window.__xss=1">'
    const ok = await request.post('/api/themes', { data: { title: payload, format: { theme: 'nope', lineStyle: 'zigzag' } } })
    expect(ok.status()).toBe(201)
    const created = await ok.json()
    try {
      const { app } = await setupMap(page, maps)
      await app.clickRibbon('format', 'mapTheme.apply')
      const option = app.menu.locator(`[data-option="user:${created.id}"]`)
      await expect(option).toContainText(payload)
      await option.click()
      // Un formato con valores desconocidos se normaliza al aplicarlo
      await expect.poll(() => savedFormat(app)).toEqual({ theme: 'mindmanager' })
      await page.waitForTimeout(200)
      expect(await page.evaluate(() => window.__xss)).toBeUndefined()
    } finally {
      await request.delete(`/api/themes/${created.id}`)
    }
  })
})

test.describe('Imagen de fondo', () => {
  test('se sube, se ajusta (cubrir, mosaico, centrada), se quita y se deshace', async ({ page, maps }) => {
    const { app, map } = await setupMap(page, maps)
    const png = await app.makePng(64, 48)
    await app.ribbonTab('format').click()
    await app.chooseFile(() => cmd(app, 'mapFormat.backgroundImage').click(), { name: 'fondo.png', mimeType: 'image/png', buffer: png })
    const bg = () => page.evaluate(() => {
      const s = getComputedStyle(document.getElementById('mindMapContainer'))
      return { image: s.backgroundImage, size: s.backgroundSize, repeat: s.backgroundRepeat }
    })
    await expect.poll(async () => (await bg()).image).toMatch(/\/api\/files\/[0-9a-f-]{36}/)
    expect((await bg()).size).toBe('cover')
    const url = (await savedFormat(app)).backgroundImage
    expect(url).toMatch(/^\/api\/files\/[0-9a-f-]{36}$/)
    // Hasta el autoguardado el mapa guardado aún no tiene formato: el poll reintenta
    await expect.poll(async () => ((await maps.get(map.id)).data.root.data._mapFormat || {}).backgroundImage).toBe(url)

    // La imagen es del mapa: cambiar de tema la conserva
    await cmd(app, 'mapTheme.apply').click()
    await app.menu.locator('[data-option="mm-night"]').click()
    await expect.poll(async () => (await savedFormat(app)).theme).toBe('mm-night')
    expect((await savedFormat(app)).backgroundImage).toBe(url)

    await app.chooseFromMenu('format', 'mapFormat.backgroundImage', 'mapFormat.backgroundFit.repeat')
    await expect.poll(async () => (await bg()).repeat).toBe('repeat')
    await app.chooseFromMenu('format', 'mapFormat.backgroundImage', 'mapFormat.backgroundFit.center')
    await expect.poll(async () => (await bg()).size).toBe('auto')
    expect((await bg()).repeat).toBe('no-repeat')

    await app.recordsHistory(() => app.chooseFromMenu('format', 'mapFormat.backgroundImage', 'mapFormat.backgroundImage.remove'))
    await expect.poll(async () => (await bg()).image).toBe('none')
    await app.qat('edit.undo').click()
    await expect.poll(async () => (await bg()).image).toMatch(/\/api\/files\//)
  })

  test('solo se admiten imágenes', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.ribbonTab('format').click()
    await app.chooseFile(() => cmd(app, 'mapFormat.backgroundImage').click(), { name: 'x.txt', mimeType: 'text/plain', buffer: Buffer.from('hola') })
    await expect(app.errorBanner).toContainText(/imagen/)
    expect(await savedFormat(app)).toBeUndefined()
  })

  test('[Seguridad] una imagen de fondo que no es un archivo de la app se descarta', async ({ page, maps }) => {
    const data = clone(SAMPLE_TREE)
    data.root.data._mapFormat = { theme: 'mindmanager', backgroundImage: 'https://evil.example/x.png', backgroundFit: 'repeat' }
    const { app } = await setupMap(page, maps, { data })
    expect(await savedFormat(app)).toEqual({ theme: 'mindmanager' })
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('mindMapContainer')).backgroundImage)).toBe('none')
  })
})

test.describe('Equilibrar el mapa', () => {
  // Pesos (temas de cada rama): A 6, B 1, C 1, D 5. Sin `dir`, la app pone a la derecha la
  // primera mitad de las ramas: con este orden A y D a la derecha y B y C a la izquierda
  const leaf = t => ({ data: { text: t }, children: [] })
  const UNBALANCED = {
    layout: 'mindMap',
    root: {
      data: { text: 'Centro' },
      children: [
        { data: { text: 'A' }, children: ['a1', 'a2', 'a3', 'a4', 'a5'].map(leaf) },
        { data: { text: 'D' }, children: ['d1', 'd2', 'd3', 'd4'].map(leaf) },
        { data: { text: 'B' }, children: [] },
        { data: { text: 'C' }, children: [] }
      ]
    },
    theme: { template: 'mindmanager', config: {} },
    view: {}
  }
  const sides = page => page.evaluate(() => {
    const root = Alpine.raw(window.Alpine.$data(document.body).mindMap).renderer.root
    const weight = n => 1 + (n.children || []).reduce((s, c) => s + weight(c), 0)
    const out = { right: 0, left: 0 }
    root.children.forEach(n => { out[n.left > root.left ? 'right' : 'left'] += weight(n) })
    return out
  })

  test('reparte las ramas para que los dos lados pesen lo mismo; un paso de deshacer', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps, { data: UNBALANCED })
    // Sin equilibrar: A y D a la derecha (11), B y C a la izquierda (2)
    const before = await sides(page)
    expect(before).toEqual({ right: 11, left: 2 })
    await app.ribbonTab('format').click()
    await app.recordsHistory(() => cmd(app, 'layout.balance').click())
    await expect.poll(async () => { const s = await sides(page); return Math.abs(s.right - s.left) }).toBeLessThanOrEqual(1)
    await app.qat('edit.undo').click()
    await expect.poll(() => sides(page)).toEqual(before)
  })

  test('solo está disponible en el diseño radial', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps) // árbol
    await app.ribbonTab('format').click()
    await expect(cmd(app, 'layout.balance')).toBeDisabled()
    await cmd(app, 'layout.radial').click()
    await expect(cmd(app, 'layout.balance')).toBeEnabled()
  })
})
