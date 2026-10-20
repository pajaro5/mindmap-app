// Fase 8 · Llamadas: notas flotantes ancladas a un tema (insertar, editar, mover, eliminar)
const { test, expect, setupMap, SAMPLE_TREE } = require('./fixtures')

const clone = o => JSON.parse(JSON.stringify(o))
const cmd = (app, id) => app.ribbonCmd('home', id)
const dialog = page => page.locator('#appDialog')
const calloutsOf = (app, text) => app.nodeData(text, '_callouts')
const bubbles = page => page.locator('.smm-callouts .smm-callout')

const withCallout = (topicIndex, callout) => {
  const data = clone(SAMPLE_TREE)
  data.root.children[topicIndex].data._callouts = [{ id: 'c1', dx: 24, dy: -14, ...callout }]
  return data
}

async function insertCallout(page, app, text) {
  await cmd(app, 'insert.callout').click()
  await expect(dialog(page)).toBeVisible()
  await dialog(page).locator('[name="calloutText"]').fill(text)
  await dialog(page).locator('button[type="submit"]').click()
  await expect(dialog(page)).toBeHidden()
}

test('insertar una llamada en el tema seleccionado; deshacer la quita', async ({ page, maps }) => {
  const { app } = await setupMap(page, maps)
  await expect(cmd(app, 'insert.callout')).toBeDisabled()
  await app.selectNode('Beta')
  await app.recordsHistory(() => insertCallout(page, app, 'Revisar con Ana'))

  await expect.poll(async () => ((await calloutsOf(app, 'Beta')) || []).map(c => c.text)).toEqual(['Revisar con Ana'])
  await expect(bubbles(page)).toHaveCount(1)
  await expect(bubbles(page).first()).toContainText('Revisar con Ana')

  await app.qat('edit.undo').click()
  await expect(bubbles(page)).toHaveCount(0)
  await expect.poll(() => calloutsOf(app, 'Beta')).toBeUndefined()
})

test('el diálogo no acepta una llamada vacía', async ({ page, maps }) => {
  const { app } = await setupMap(page, maps)
  await app.selectNode('Gamma')
  await cmd(app, 'insert.callout').click()
  await dialog(page).locator('[name="calloutText"]').fill('   ')
  await dialog(page).locator('button[type="submit"]').click()
  await expect(dialog(page).locator('.dialog-error')).toHaveText(/Escribe/)
  await page.keyboard.press('Escape')
  expect(await calloutsOf(app, 'Gamma')).toBeUndefined()
})

test('el texto largo y los saltos de línea se reparten en varias líneas', async ({ page, maps }) => {
  const { app } = await setupMap(page, maps, { data: withCallout(1, { text: 'Primera línea\nuna segunda línea bastante más larga que el ancho de la llamada' }) })
  await expect(bubbles(page)).toHaveCount(1)
  expect(await bubbles(page).first().locator('tspan').count()).toBeGreaterThanOrEqual(3)
})

test('clic selecciona la llamada (no el tema) y Supr la elimina sin borrar temas', async ({ page, maps }) => {
  const { app } = await setupMap(page, maps, { data: withCallout(1, { text: 'Ojo' }) })
  await app.selectNode('Beta')
  await bubbles(page).first().click()
  await expect(bubbles(page).first()).toHaveClass(/active/)
  expect((await app.state()).activeCount).toBe(0)

  await app.ribbonPanel('home').locator('[data-menu-for="insert.callout"]').click()
  await expect(app.menu.locator('[data-cmd="callout.edit"]')).toBeEnabled()
  await expect(app.menu.locator('[data-cmd="callout.remove"]')).toBeEnabled()
  await page.keyboard.press('Escape')

  await page.keyboard.press('Delete')
  await expect(bubbles(page)).toHaveCount(0)
  await app.expectNodeCount(5)
  expect(await calloutsOf(app, 'Beta')).toBeUndefined()
})

test('doble clic edita el texto de la llamada', async ({ page, maps }) => {
  const { app } = await setupMap(page, maps, { data: withCallout(2, { text: 'Antes' }) })
  await bubbles(page).first().dblclick()
  await expect(dialog(page)).toBeVisible()
  await expect(dialog(page).locator('[name="calloutText"]')).toHaveValue('Antes')
  await dialog(page).locator('[name="calloutText"]').fill('Después')
  await dialog(page).locator('button[type="submit"]').click()
  await expect.poll(async () => (await calloutsOf(app, 'Gamma'))[0].text).toBe('Después')
  await expect(bubbles(page).first()).toContainText('Después')
})

test('el doble clic funciona aunque antes hubiera un tema seleccionado', async ({ page, maps }) => {
  const { app } = await setupMap(page, maps, { data: withCallout(2, { text: 'Antes' }) })
  await app.selectNode('Alfa')
  await bubbles(page).first().dblclick()
  await expect(dialog(page)).toBeVisible()
  await expect(dialog(page).locator('.dialog-title')).toHaveText('Editar llamada')
})

test('arrastrar mueve la llamada (una entrada de historial) y deshacer la devuelve', async ({ page, maps }) => {
  const { app } = await setupMap(page, maps, { data: withCallout(1, { text: 'Móvil' }) })
  // Con la máquina cargada el mapa puede seguir colocándose: medir cuando el globo esté quieto
  const rect = bubbles(page).first().locator('rect')
  let box = await rect.boundingBox()
  await expect.poll(async () => {
    await page.waitForTimeout(150)
    const now = await rect.boundingBox()
    const still = JSON.stringify(now) === JSON.stringify(box)
    box = now
    return still
  }, { message: 'la llamada debe dejar de moverse' }).toBe(true)
  const scale = await app.scale()
  await app.recordsHistory(async () => {
    await page.mouse.move(box.x + 10, box.y + 10)
    await page.mouse.down()
    await page.mouse.move(box.x + 70, box.y + 50, { steps: 6 })
    await page.mouse.move(box.x + 110, box.y + 60, { steps: 6 })
    await page.mouse.up()
  })
  await expect.poll(async () => {
    const [c] = (await calloutsOf(app, 'Beta')) || []
    if (!c) return null
    return [Math.round((c.dx - 24) * scale), Math.round((c.dy + 14) * scale)]
  }).toEqual([100, 50])
  // El tema no se movió ni se seleccionó por el arrastre
  expect((await app.state()).activeCount).toBe(0)

  await app.qat('edit.undo').click()
  // Mientras el mapa se vuelve a pintar tras deshacer, el tema puede no estar: el poll reintenta
  await expect.poll(async () => ((await calloutsOf(app, 'Beta')) || [])[0]?.dx).toBe(24)
})

test('las llamadas de ramas contraídas no se muestran', async ({ page, maps }) => {
  const data = clone(SAMPLE_TREE)
  data.root.children[0].data.expand = false
  data.root.children[0].children[0].data._callouts = [{ id: 'oculta', text: 'Oculta', dx: 24, dy: -14 }]
  data.root.data._callouts = [{ id: 'visible', text: 'Visible', dx: 24, dy: -14 }]
  await setupMap(page, maps, { data })
  await expect(bubbles(page)).toHaveCount(1)
  await expect(bubbles(page).first()).toContainText('Visible')
})

test('las llamadas persisten tras recargar', async ({ page, maps }) => {
  const { app, map } = await setupMap(page, maps)
  await app.selectNode('Alfa')
  await insertCallout(page, app, 'Guardada')
  await expect.poll(async () => ((await maps.get(map.id)).data.root.children[0].data._callouts || []).length).toBe(1)
  await page.reload()
  await app.openMapByTitle(map.title)
  await expect(bubbles(page)).toHaveCount(1)
  await expect(bubbles(page).first()).toContainText('Guardada')
})

test('"Limpiar todo" quita las llamadas y "Copiar formato" no las copia', async ({ page, maps }) => {
  const { app } = await setupMap(page, maps, { data: withCallout(1, { text: 'Nota' }) })
  await app.selectNode('Beta')
  await cmd(app, 'clipboard.formatPainter').click()
  await app.node('Gamma').click()
  await expect.poll(() => app.isPainterActive()).toBe(false)
  expect(await calloutsOf(app, 'Gamma')).toBeUndefined()

  await app.selectNode('Beta')
  await app.chooseFromMenu('home', 'clear.format', 'clear.all')
  await expect.poll(() => calloutsOf(app, 'Beta')).toBeUndefined()
  await expect(bubbles(page)).toHaveCount(0)
})

test('[Seguridad] llamadas malformadas se sanean y el texto se muestra como texto', async ({ page, maps }) => {
  const data = clone(SAMPLE_TREE)
  const payload = '<img src=x onerror="window.__xss=1">'
  data.root.children[0].data._callouts = [
    { id: 'a', text: payload, dx: 1e9, dy: 'x' },
    { id: 'a', text: 'Duplicada' },
    { text: { evil: true } },
    'basura',
    null
  ]
  data.root.children[1].data._callouts = 'no es una lista'
  const { app } = await setupMap(page, maps, { data })
  expect((await app.state()).errorMsg).toBe('')
  const alfa = await calloutsOf(app, 'Alfa')
  expect(alfa.map(c => c.text)).toEqual([payload, 'Duplicada'])
  expect(alfa[0]).toMatchObject({ dx: 3000, dy: -14 })
  expect(alfa[1].id).not.toBe('a')
  expect(await calloutsOf(app, 'Beta')).toBeUndefined()
  // El texto largo se reparte en líneas (tspan): se juntan con espacios para compararlo
  await expect.poll(() => bubbles(page).first().locator('tspan').allTextContents().then(l => l.join(' '))).toBe(payload)
  await page.waitForTimeout(200)
  expect(await page.evaluate(() => window.__xss)).toBeUndefined()
})
