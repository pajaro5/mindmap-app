// Fase 17 · Formato de relaciones (color, grosor, trazo, flechas) y de límites (color,
// relleno, trazo, forma de nube)
const { test, expect, setupMap, SAMPLE_TREE } = require('./fixtures')

const clone = o => JSON.parse(JSON.stringify(o))
const cmd = (app, id) => app.ribbonCmd('format', id)

// Mapa de ejemplo con una relación Alfa → Gamma y un límite alrededor de Alfa uno (lejos de la\n// relación: si el clic en su punto medio cayera sobre el límite, lo seleccionaría a él)
function sampleWithRelationAndBoundary() {
  const data = clone(SAMPLE_TREE)
  data.root.children[2].data.uid = 'gamma-uid'
  Object.assign(data.root.children[0].data, { associativeLineTargets: ['gamma-uid'] })
  data.root.children[0].children[0].data.outerFrame = { groupId: 'g1', radius: 14, strokeWidth: 2, strokeColor: '#3d8fd8', strokeDasharray: 'none', fill: 'rgba(61, 143, 216, 0.06)' }
  return data
}

// Trazo de la relación `index` tal como se pinta
const relationLook = (page, index = 0) => page.evaluate(i => {
  const plugin = window.Alpine.$data(document.body).mindMap.associativeLine
  const entry = plugin.lineList[i]
  if (!entry) return null
  const el = entry[0].node
  return {
    stroke: el.getAttribute('stroke'),
    width: Number(el.getAttribute('stroke-width')),
    dash: el.getAttribute('stroke-dasharray'),
    markerStart: !!el.getAttribute('marker-start'),
    markerEnd: !!el.getAttribute('marker-end')
  }
}, index)

const relationData = app => app.nodeData('Alfa', 'associativeLineStyle')
const boundaryData = app => app.nodeData('Alfa uno', 'outerFrame')
const boundaryEls = page => page.locator('.smm-outer-frame-container > rect, .smm-outer-frame-container > path')

async function selectBoundary(app) {
  const el = boundaryEls(app.page).first()
  const box = await el.boundingBox()
  // En la nube, los arcos sobresalen del rectángulo: el clic va un poco más adentro
  const inset = (await el.evaluate(e => e.tagName)) === 'path' ? 12 : 4
  await app.page.mouse.click(box.x + inset, box.y + box.height / 2)
  await app.page.waitForFunction(() => window.Alpine.$data(document.body).boundaryActive)
}

async function pickColor(app, owner, color) {
  await app.ribbonPanel('format').locator(`[data-menu-for="${owner}"]`).click()
  await expect(app.menu).toBeVisible()
  await app.menu.locator(`[data-color="${color}"]`).click()
  await expect(app.menu).toBeHidden()
}

test.describe('Formato de la relación', () => {
  test('sin relación seleccionada los controles están deshabilitados; al seleccionarla reflejan su estilo', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps, { data: sampleWithRelationAndBoundary() })
    await app.ribbonTab('format').click()
    for (const id of ['relationship.color', 'relationship.width', 'relationship.dash', 'relationship.arrows']) {
      await expect(cmd(app, id), id).toBeDisabled()
    }
    await expect.poll(() => app.relationshipCount()).toBe(1)
    await app.clickRelationship(0)
    await app.ribbonTab('format').click()
    await expect(cmd(app, 'relationship.width')).toBeEnabled()
    await expect(cmd(app, 'relationship.width')).toHaveValue('2')
    await expect(cmd(app, 'relationship.dash')).toHaveValue('6,4')
    await expect(cmd(app, 'relationship.arrows')).toHaveValue('end')
    const look = await relationLook(page)
    expect(look.markerEnd).toBe(true)
    expect(look.markerStart).toBe(false)
  })

  test('color, grosor y trazo se aplican a la relación, se guardan y se deshacen', async ({ page, maps }) => {
    const { app, map } = await setupMap(page, maps, { data: sampleWithRelationAndBoundary() })
    await expect.poll(() => app.relationshipCount()).toBe(1)
    await app.clickRelationship(0)
    await app.ribbonTab('format').click()

    await pickColor(app, 'relationship.color', '#c00000')
    await expect.poll(async () => (await relationLook(page) || {}).stroke).toBe('#c00000')
    await cmd(app, 'relationship.width').selectOption('4')
    await expect.poll(async () => (await relationLook(page) || {}).width).toBe(4)
    await app.recordsHistory(() => cmd(app, 'relationship.dash').selectOption('none'))
    await expect.poll(async () => (await relationLook(page) || {}).dash).toBe('none')
    // La relación sigue seleccionada tras cada cambio
    expect(await page.evaluate(() => window.Alpine.$data(document.body).relationshipActive)).toBe(true)

    expect(await relationData(app)).toEqual({ 'gamma-uid': { associativeLineColor: '#c00000', associativeLineWidth: 4, associativeLineDasharray: 'none' } })
    await expect.poll(async () => (await maps.get(map.id)).data.root.children[0].data.associativeLineStyle).toEqual(
      { 'gamma-uid': { associativeLineColor: '#c00000', associativeLineWidth: 4, associativeLineDasharray: 'none' } })

    await app.qat('edit.undo').click()
    await expect.poll(async () => (await relationLook(page) || {}).dash).toBe('6,4')
    expect((await relationLook(page)).stroke).toBe('#c00000')
  })

  test('flechas: en los dos extremos, al principio o ninguna; se mantienen al recargar', async ({ page, maps }) => {
    const { app, map } = await setupMap(page, maps, { data: sampleWithRelationAndBoundary() })
    await expect.poll(() => app.relationshipCount()).toBe(1)
    await app.clickRelationship(0)
    await app.ribbonTab('format').click()

    await cmd(app, 'relationship.arrows').selectOption('both')
    await expect.poll(() => relationLook(page)).toMatchObject({ markerStart: true, markerEnd: true })
    await cmd(app, 'relationship.arrows').selectOption('start')
    await expect.poll(() => relationLook(page)).toMatchObject({ markerStart: true, markerEnd: false })
    await cmd(app, 'relationship.arrows').selectOption('none')
    await expect.poll(() => relationLook(page)).toMatchObject({ markerStart: false, markerEnd: false })
    await cmd(app, 'relationship.arrows').selectOption('both')

    await expect.poll(async () => (((await maps.get(map.id)).data.root.children[0].data.associativeLineStyle || {})['gamma-uid'] || {}).arrows).toBe('both')
    await page.reload()
    await app.openMapByTitle(map.title)
    await expect.poll(() => relationLook(page)).toMatchObject({ markerStart: true, markerEnd: true })
    // Mover un tema vuelve a pintar las relaciones: las flechas se conservan
    await app.selectNode('Beta')
    await page.keyboard.press('Tab')
    await app.typeNewTopic('Nuevo')
    await expect.poll(() => relationLook(page)).toMatchObject({ markerStart: true, markerEnd: true })
  })

  test('"Automático" devuelve el color del tema', async ({ page, maps }) => {
    const data = sampleWithRelationAndBoundary()
    data.root.children[0].data.associativeLineStyle = { 'gamma-uid': { associativeLineColor: '#00b050' } }
    const { app } = await setupMap(page, maps, { data })
    await expect.poll(async () => (await relationLook(page) || {}).stroke).toBe('#00b050')
    await app.clickRelationship(0)
    await app.ribbonTab('format').click()
    await app.ribbonPanel('format').locator('[data-menu-for="relationship.color"]').click()
    await expect(app.menu.locator('.swatch.current')).toHaveAttribute('data-color', '#00b050')
    await app.menu.locator('[data-color="auto"]').click()
    await expect.poll(async () => (await relationLook(page) || {}).stroke).toBe('#333333')
    expect(await relationData(app)).toEqual({})
  })
})

test.describe('Formato del límite', () => {
  test('color de línea, relleno y trazo del límite seleccionado', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps, { data: sampleWithRelationAndBoundary() })
    await app.ribbonTab('format').click()
    await expect(cmd(app, 'boundary.shape')).toBeDisabled()
    await selectBoundary(app)
    await app.ribbonTab('format').click()
    await expect(cmd(app, 'boundary.shape')).toHaveValue('rounded')
    await expect(cmd(app, 'boundary.dash')).toHaveValue('none')

    await pickColor(app, 'boundary.color', '#c00000')
    await expect.poll(async () => ((await boundaryData(app)) || {}).strokeColor).toBe('#c00000')
    await expect(boundaryEls(page).first()).toHaveAttribute('stroke', '#c00000')
    await pickColor(app, 'boundary.fill', '#fdeada')
    await expect.poll(async () => ((await boundaryData(app)) || {}).fill).toBe('#fdeada')
    await expect(boundaryEls(page).first()).toHaveAttribute('fill', '#fdeada')
    await cmd(app, 'boundary.dash').selectOption('2,3')
    await expect.poll(async () => ((await boundaryData(app)) || {}).strokeDasharray).toBe('2,3')
    expect(await page.evaluate(() => window.Alpine.$data(document.body).boundaryActive)).toBe(true)

    // "Automático" vuelve al estilo por defecto del límite
    await app.ribbonPanel('format').locator('[data-menu-for="boundary.fill"]').click()
    await app.menu.locator('[data-color="auto"]').click()
    await expect.poll(async () => ((await boundaryData(app)) || {}).fill).toBe('rgba(61, 143, 216, 0.06)')
  })

  test('forma de nube: se dibuja como contorno, sigue seleccionado, se guarda y se deshace', async ({ page, maps }) => {
    const { app, map } = await setupMap(page, maps, { data: sampleWithRelationAndBoundary() })
    await selectBoundary(app)
    await app.ribbonTab('format').click()
    await app.recordsHistory(() => cmd(app, 'boundary.shape').selectOption('cloud'))
    await expect(page.locator('.smm-outer-frame-container > path')).toHaveCount(1)
    await expect(page.locator('.smm-outer-frame-container > rect')).toHaveCount(0)
    const d = await page.locator('.smm-outer-frame-container > path').getAttribute('d')
    expect((d.match(/a/g) || []).length).toBeGreaterThan(6)
    expect(await page.evaluate(() => window.Alpine.$data(document.body).boundaryActive)).toBe(true)
    await expect(cmd(app, 'boundary.shape')).toHaveValue('cloud')
    expect((await boundaryData(app)).shape).toBe('cloud')
    await expect.poll(async () => (await maps.get(map.id)).data.root.children[0].children[0].data.outerFrame.shape).toBe('cloud')

    // Con el límite en forma de nube se pueden seguir cambiando colores
    await pickColor(app, 'boundary.color', '#00b050')
    await expect(page.locator('.smm-outer-frame-container > path')).toHaveAttribute('stroke', '#00b050')

    await app.qat('edit.undo').click()
    await app.qat('edit.undo').click()
    await expect(page.locator('.smm-outer-frame-container > rect')).toHaveCount(1)
    await expect(page.locator('.smm-outer-frame-container > path')).toHaveCount(0)

    await app.qat('edit.redo').click()
    await expect(page.locator('.smm-outer-frame-container > path')).toHaveCount(1)
    // Pasar de nube a rectángulo
    await selectBoundary(app)
    await app.ribbonTab('format').click()
    await cmd(app, 'boundary.shape').selectOption('rect')
    await expect(page.locator('.smm-outer-frame-container > rect')).toHaveCount(1)
    await expect.poll(async () => ((await boundaryData(app)) || {}).radius).toBe(0)
    expect((await boundaryData(app)).shape).toBeUndefined()
  })

  test('el texto de un límite en nube se edita y se coloca encima', async ({ page, maps }) => {
    const data = sampleWithRelationAndBoundary()
    Object.assign(data.root.children[0].children[0].data.outerFrame, { shape: 'cloud', text: 'Grupo' })
    const { app } = await setupMap(page, maps, { data })
    await expect(page.locator('.smm-outer-frame-container > path')).toHaveCount(1)
    await expect(page.locator('.smm-outer-frame-container text')).toHaveText('Grupo')
    const frame = await page.locator('.smm-outer-frame-container > path').boundingBox()
    const label = await page.locator('.smm-outer-frame-container text').boundingBox()
    expect(label.y).toBeLessThan(frame.y + 4)
  })
})

test('[Seguridad] estilos de relación y límite malformados no rompen el mapa', async ({ page, maps }) => {
  const data = sampleWithRelationAndBoundary()
  data.root.children[0].data.associativeLineStyle = { 'gamma-uid': { arrows: '<script>', associativeLineColor: 'red' }, otro: 5 }
  Object.assign(data.root.children[0].children[0].data.outerFrame, { shape: { evil: true } })
  const { app } = await setupMap(page, maps, { data })
  await expect.poll(() => app.relationshipCount()).toBe(1)
  // Flecha desconocida: la de siempre (al final)
  await expect.poll(() => relationLook(page)).toMatchObject({ markerEnd: true, markerStart: false })
  await expect(page.locator('.smm-outer-frame-container > rect')).toHaveCount(1)
})
