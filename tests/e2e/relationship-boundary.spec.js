// Fase 4 · Relación (flecha entre temas) y Límite (marco alrededor de temas hermanos)
const { test, expect, setupMap, SAMPLE_TREE } = require('./fixtures')

const cmd = (app, id) => app.ribbonCmd('home', id)
const targetsOf = (page, text) => page.evaluate(text => {
  const mm = window.Alpine.$data(document.body).mindMap
  const strip = s => String(s).replace(/<[^>]+>/g, '').trim()
  const find = n => !n ? null : strip(n.getData('text')) === text ? n : (n.children || []).map(find).find(Boolean)
  const node = find(mm.renderer.root)
  return (node.getData('associativeLineTargets') || []).map(uid => {
    const walk = n => !n ? null : n.getData('uid') === uid ? strip(n.getData('text')) : (n.children || []).map(walk).find(Boolean)
    return walk(mm.renderer.root)
  })
}, text)
const outerFrameOf = (app, text) => app.nodeData(text, 'outerFrame')

test.describe('Relación', () => {
  test('dibujar una relación: clic en Relación y luego en el tema destino', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNode('Alfa')
    await cmd(app, 'insert.relationship').click()
    await expect(page.locator('.status-hint')).toBeVisible()

    // Mover el ratón sobre el destino (dispara el resaltado con retardo de la librería) y
    // hacer clic: sin el parche de patchLibraryBugs esto lanzaba un error JS
    const box = await app.node('Gamma').boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 })
    await app.node('Gamma').click()

    await expect.poll(() => targetsOf(page, 'Alfa')).toEqual(['Gamma'])
    await expect(page.locator('.status-hint')).toBeHidden()
    expect(await app.relationshipCount()).toBe(1)
  })

  test('con dos temas seleccionados, Relación los une directamente', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNodes('Beta', 'Alfa uno')
    await cmd(app, 'insert.relationship').click()
    await expect.poll(() => targetsOf(page, 'Beta')).toEqual(['Alfa uno'])
    await expect(page.locator('.status-hint')).toBeHidden()
  })

  test('Esc cancela el dibujo sin crear la relación', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNode('Alfa')
    await cmd(app, 'insert.relationship').click()
    await expect(page.locator('.status-hint')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.status-hint')).toBeHidden()
    await app.node('Beta').click()
    expect(await targetsOf(page, 'Alfa')).toEqual([])
    expect(await app.relationshipCount()).toBe(0)
  })

  test('seleccionar una relación habilita sus comandos y "Eliminar relación" la quita', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNodes('Alfa', 'Gamma')
    await cmd(app, 'insert.relationship').click()
    await expect.poll(() => app.relationshipCount()).toBe(1)

    await app.ribbonPanel('home').locator('[data-menu-for="insert.relationship"]').click()
    await expect(app.menu.locator('[data-cmd="relationship.remove"]')).toBeDisabled()
    await page.keyboard.press('Escape')

    await app.clickRelationship(0)
    await app.chooseFromMenu('home', 'insert.relationship', 'relationship.remove')
    await expect.poll(() => app.relationshipCount()).toBe(0)
    expect(await targetsOf(page, 'Alfa')).toEqual([])
  })

  test('Supr elimina la relación seleccionada sin borrar temas', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNodes('Alfa', 'Beta')
    await cmd(app, 'insert.relationship').click()
    await expect.poll(() => app.relationshipCount()).toBe(1)
    await app.clickRelationship(0)
    await page.keyboard.press('Delete')
    await expect.poll(() => app.relationshipCount()).toBe(0)
    await app.expectNodeCount(5)
  })

  test('el texto de la relación se edita y se guarda tal cual (sin interpretar HTML)', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNodes('Alfa', 'Gamma')
    await cmd(app, 'insert.relationship').click()
    await expect.poll(() => app.relationshipCount()).toBe(1)
    await app.clickRelationship(0)
    await app.chooseFromMenu('home', 'insert.relationship', 'relationship.text')
    const box = page.locator('.associative-line-text-edit-warp')
    await expect(box).toBeVisible()
    await page.keyboard.type('depende de <b>')
    await page.keyboard.press('Enter')
    await expect(box).toBeHidden()
    await expect.poll(async () => Object.values((await app.nodeData('Alfa', 'associativeLineText')) || {})).toEqual(['depende de <b>'])
  })

  test('[Seguridad] editar el texto de una relación maliciosa no ejecuta código', async ({ page, maps }) => {
    const data = JSON.parse(JSON.stringify(SAMPLE_TREE))
    const payload = '<img src=x onerror="window.__xss=5">'
    data.root.children[2].data.uid = 'gamma-uid'
    Object.assign(data.root.children[0].data, { associativeLineTargets: ['gamma-uid'], associativeLineText: { 'gamma-uid': payload } })
    const { app } = await setupMap(page, maps, { data })
    await expect.poll(() => app.relationshipCount()).toBe(1)
    await app.clickRelationship(0)
    await app.chooseFromMenu('home', 'insert.relationship', 'relationship.text')
    const box = page.locator('.associative-line-text-edit-warp')
    await expect(box).toBeVisible()
    await expect(box).toHaveText(payload)
    await page.waitForTimeout(200)
    expect(await page.evaluate(() => window.__xss)).toBeUndefined()
    await page.keyboard.press('Enter')
    // Al guardar se conserva el texto original
    await expect.poll(async () => (await app.nodeData('Alfa', 'associativeLineText'))['gamma-uid']).toBe(payload)
  })

  test('crear una relación se puede deshacer y persiste tras recargar', async ({ page, maps }) => {
    const { app, map } = await setupMap(page, maps)
    await app.selectNodes('Beta', 'Gamma')
    await app.recordsHistory(() => cmd(app, 'insert.relationship').click())
    await app.qat('edit.undo').click()
    await expect.poll(() => app.relationshipCount()).toBe(0)
    await app.qat('edit.redo').click()
    await expect.poll(() => app.relationshipCount()).toBe(1)

    await expect.poll(async () => ((await maps.get(map.id)).data.root.children[1].data.associativeLineTargets || []).length).toBe(1)
    await page.reload()
    await app.openMapByTitle(map.title)
    await expect.poll(() => app.relationshipCount()).toBe(1)
  })
})

test.describe('Límite', () => {
  test('rodea los temas seleccionados con el estilo por defecto', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNodes('Beta', 'Gamma')
    await cmd(app, 'insert.boundary').click()
    await expect.poll(() => outerFrameOf(app, 'Beta')).toMatchObject({ strokeColor: '#3d8fd8', radius: 14 })
    const beta = await outerFrameOf(app, 'Beta')
    const gamma = await outerFrameOf(app, 'Gamma')
    expect(gamma.groupId).toBe(beta.groupId)
    await expect(page.locator('.smm-outer-frame-container > rect')).toHaveCount(1)
  })

  test('elegir un estilo del desplegable sin límite seleccionado crea uno con ese estilo', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNode('Alfa')
    await app.chooseFromMenu('home', 'insert.boundary', 'boundary.style.dashed')
    await expect.poll(() => outerFrameOf(app, 'Alfa')).toMatchObject({ strokeDasharray: '6,4', strokeColor: '#7f7f7f' })
  })

  test('con un límite seleccionado, el desplegable cambia su estilo; "Eliminar límite" lo quita', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNodes('Beta', 'Gamma')
    await cmd(app, 'insert.boundary').click()
    await expect(page.locator('.smm-outer-frame-container > rect')).toHaveCount(1)

    await app.clickBoundary(0)
    await app.chooseFromMenu('home', 'insert.boundary', 'boundary.style.green')
    await expect.poll(() => outerFrameOf(app, 'Gamma')).toMatchObject({ strokeColor: '#57962a', fill: 'rgba(125, 193, 66, 0.15)' })
    expect((await outerFrameOf(app, 'Beta')).strokeColor).toBe('#57962a')
    await expect(page.locator('.smm-outer-frame-container > rect')).toHaveCount(1)

    await app.clickBoundary(0)
    await app.chooseFromMenu('home', 'insert.boundary', 'boundary.remove')
    await expect.poll(() => outerFrameOf(app, 'Beta')).toBeFalsy()
    await expect(page.locator('.smm-outer-frame-container > rect')).toHaveCount(0)
  })

  test('el texto del límite se edita desde el desplegable', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNode('Beta')
    await cmd(app, 'insert.boundary').click()
    await app.clickBoundary(0)
    await app.chooseFromMenu('home', 'insert.boundary', 'boundary.text')
    const box = page.locator('.outer-frame-text-edit-warp')
    await expect(box).toBeVisible()
    await page.keyboard.type('Fase 1')
    await page.keyboard.press('Enter')
    await expect.poll(async () => ((await outerFrameOf(app, 'Beta')) || {}).text).toBe('Fase 1')
  })

  test('con solo el tema central seleccionado, Límite está deshabilitado', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectRoot()
    await expect(cmd(app, 'insert.boundary')).toBeDisabled()
    await app.ribbonPanel('home').locator('[data-menu-for="insert.boundary"]').click()
    await expect(app.menu.locator('[data-cmd="boundary.style.rect"]')).toBeDisabled()
    await expect(app.menu.locator('[data-cmd="boundary.remove"]')).toBeDisabled()
  })

  test('crear un límite se puede deshacer', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNode('Gamma')
    await app.recordsHistory(() => cmd(app, 'insert.boundary').click())
    await expect(page.locator('.smm-outer-frame-container > rect')).toHaveCount(1)
    await app.qat('edit.undo').click()
    await expect(page.locator('.smm-outer-frame-container > rect')).toHaveCount(0)
    expect(await outerFrameOf(app, 'Gamma')).toBeFalsy()
  })
})
