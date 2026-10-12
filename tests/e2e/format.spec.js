// Fase 2 · Formato (fuente, tamaño, B/I/U/S, colores, alineación) y Estilo (forma)
const { test, expect, setupMap } = require('./fixtures')

const cmd = (app, id) => app.ribbonCmd('home', id)

test.describe('Formato: selectores de fuente y tamaño', () => {
  test('reflejan el tema seleccionado y quedan vacíos sin selección', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    const font = cmd(app, 'format.fontFamily')
    const size = cmd(app, 'format.fontSize')
    await expect(font).toBeDisabled()
    await expect(size).toHaveValue('')

    await app.selectNode('Beta') // nivel 2 del tema: 14
    await expect(font).toBeEnabled()
    await expect(font.locator('option:checked')).toHaveText('Segoe UI')
    await expect(size).toHaveValue('14')

    await app.selectNode('Alfa uno') // nivel 3 del tema: 12
    await expect(size).toHaveValue('12')

    await app.clickEmptyCanvas()
    await expect(size).toBeDisabled()
    await expect(size).toHaveValue('')
  })

  test('cambiar la fuente y el tamaño se aplica, se ve y persiste', async ({ page, maps }) => {
    const { app, map } = await setupMap(page, maps)
    await app.selectNode('Beta')
    await cmd(app, 'format.fontFamily').selectOption({ label: 'Georgia' })
    await cmd(app, 'format.fontSize').selectOption('24')

    await expect.poll(() => app.nodeData('Beta', 'fontFamily')).toBe('Georgia, serif')
    expect(await app.nodeData('Beta', 'fontSize')).toBe(24)
    const r = await app.nodeRender('Beta')
    expect(r.fontFamily).toContain('Georgia')
    expect(r.fontSize).toBe('24px')
    await expect(cmd(app, 'format.fontSize')).toHaveValue('24')

    await expect.poll(async () => (await maps.get(map.id)).data.root.children[1].data.fontSize).toBe(24)
  })

  test('A▲ y A▼ recorren la lista de tamaños', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNode('Beta')
    await cmd(app, 'format.growFont').click()
    await expect.poll(() => app.nodeData('Beta', 'fontSize')).toBe(16)
    await cmd(app, 'format.shrinkFont').click()
    await cmd(app, 'format.shrinkFont').click()
    await expect.poll(() => app.nodeData('Beta', 'fontSize')).toBe(12)
  })
})

test.describe('Formato: negrita, cursiva, subrayado, tachado', () => {
  test('Negrita alterna con el botón y con Ctrl+B', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    const bold = cmd(app, 'format.bold')
    await app.selectNode('Beta') // los temas principales del tema son negrita
    await expect(bold).toHaveAttribute('aria-pressed', 'true')

    await bold.click()
    await expect.poll(() => app.nodeData('Beta', 'fontWeight')).toBe('normal')
    await expect(bold).toHaveAttribute('aria-pressed', 'false')
    expect((await app.nodeRender('Beta')).fontWeight).toBe('400')

    await page.keyboard.press('ControlOrMeta+b')
    await expect.poll(() => app.nodeData('Beta', 'fontWeight')).toBe('bold')
    await expect(bold).toHaveAttribute('aria-pressed', 'true')
  })

  test('Cursiva con Ctrl+I no cambia el zoom (antes era "ajustar a la ventana")', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNode('Gamma')
    const scale = await app.scale()
    await page.keyboard.press('ControlOrMeta+i')
    await expect.poll(() => app.nodeData('Gamma', 'fontStyle')).toBe('italic')
    expect(await app.scale()).toBe(scale)
    expect((await app.nodeRender('Gamma')).fontStyle).toBe('italic')
    await expect(cmd(app, 'format.italic')).toHaveAttribute('aria-pressed', 'true')
  })

  test('Subrayado y tachado se combinan y se alternan por separado', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNode('Gamma')
    await page.keyboard.press('ControlOrMeta+u')
    await expect.poll(() => app.nodeData('Gamma', 'textDecoration')).toBe('underline')
    await cmd(app, 'format.strike').click()
    await expect.poll(() => app.nodeData('Gamma', 'textDecoration')).toBe('underline line-through')
    expect((await app.nodeRender('Gamma')).textDecoration).toContain('line-through')

    await cmd(app, 'format.underline').click()
    await expect.poll(() => app.nodeData('Gamma', 'textDecoration')).toBe('line-through')
    await expect(cmd(app, 'format.underline')).toHaveAttribute('aria-pressed', 'false')
    await expect(cmd(app, 'format.strike')).toHaveAttribute('aria-pressed', 'true')
  })
})

test.describe('Formato: colores', () => {
  test('el relleno elegido en la paleta se ve (desactiva el degradado del tema)', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNode('Beta')
    expect((await app.nodeRender('Beta')).fill).toMatch(/^url\(/) // degradado del tema

    await app.pickColor('format.fillColor', '#ffc000')
    await expect.poll(async () => (await app.nodeRender('Beta')).fill).toBe('#ffc000')
    expect(await app.nodeData('Beta', 'gradientStyle')).toBe(false)
  })

  test('el botón principal reaplica el último color y "Automático" vuelve al tema', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNode('Alfa')
    await app.pickColor('format.fillColor', '#00b0f0')
    await app.selectNode('Gamma')
    await cmd(app, 'format.fillColor').click()
    await expect.poll(async () => (await app.nodeRender('Gamma')).fill).toBe('#00b0f0')

    await app.ribbonPanel('home').locator('[data-menu-for="format.fillColor"]').click()
    await app.menu.locator('[data-color="auto"]').click()
    await expect.poll(async () => (await app.nodeRender('Gamma')).fill).toMatch(/^url\(/)
    expect(await app.nodeData('Gamma', 'fillColor')).toBeUndefined()
  })

  test('"Más colores…" aplica un color personalizado', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNode('Beta')
    await app.ribbonPanel('home').locator('[data-menu-for="format.fillColor"]').click()
    await app.menu.locator('[data-color-custom]').fill('#123abc')
    await expect.poll(async () => (await app.nodeRender('Beta')).fill).toBe('#123abc')
  })

  test('color de línea en un subtema sin borde le da grosor visible', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNode('Alfa uno') // nivel 3: sin borde en el tema
    await app.pickColor('format.borderColor', '#c00000')
    await expect.poll(async () => (await app.nodeRender('Alfa uno')).stroke).toBe('#c00000')
    expect(await app.nodeData('Alfa uno', 'borderWidth')).toBe(1)
  })

  test('color de fuente', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNode('Alfa uno')
    await app.pickColor('format.fontColor', '#7030a0')
    await expect.poll(async () => (await app.nodeRender('Alfa uno')).color).toBe('rgb(112, 48, 160)')
  })

  test('la paleta marca el color actual del tema', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNode('Beta')
    await app.pickColor('format.fillColor', '#92d050')
    await app.ribbonPanel('home').locator('[data-menu-for="format.fillColor"]').click()
    await expect(app.menu.locator('.swatch.current')).toHaveAttribute('data-color', '#92d050')
  })
})

test('tras pulsar un botón de la cinta los atajos del mapa siguen funcionando', async ({ page, maps }) => {
  const { app } = await setupMap(page, maps)
  await app.selectNode('Gamma')
  await cmd(app, 'format.italic').click()
  await expect.poll(() => app.nodeData('Gamma', 'fontStyle')).toBe('italic')
  // El foco no se queda en el botón: Tab inserta un subtema en el mapa
  await page.keyboard.press('Tab')
  await app.typeNewTopic('Hijo de Gamma')
  await expect.poll(async () => (await app.tree()).c[2].c.map(c => c.t)).toEqual(['Hijo de Gamma'])
})

test.describe('Formato: alineación, selección múltiple y estado deshabilitado', () => {
  test('los botones de alineación son excluyentes', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNode('Beta')
    await cmd(app, 'format.alignCenter').click()
    await expect.poll(() => app.nodeData('Beta', 'textAlign')).toBe('center')
    await expect(cmd(app, 'format.alignCenter')).toHaveAttribute('aria-pressed', 'true')
    await expect(cmd(app, 'format.alignLeft')).toHaveAttribute('aria-pressed', 'false')

    await cmd(app, 'format.alignRight').click()
    await expect(cmd(app, 'format.alignRight')).toHaveAttribute('aria-pressed', 'true')
    await expect(cmd(app, 'format.alignCenter')).toHaveAttribute('aria-pressed', 'false')
  })

  test('con varios temas seleccionados se aplica a todos en un solo paso de deshacer', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNodes('Beta', 'Gamma')
    await app.recordsHistory(() => app.pickColor('format.fontColor', '#c00000'))
    expect(await app.nodeData('Beta', 'color')).toBe('#c00000')
    expect(await app.nodeData('Gamma', 'color')).toBe('#c00000')

    await app.qat('edit.undo').click()
    await expect.poll(() => app.nodeData('Beta', 'color')).toBeUndefined()
    expect(await app.nodeData('Gamma', 'color')).toBeUndefined()
  })

  test('sin tema seleccionado todos los controles de formato están deshabilitados', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    for (const id of ['format.fontFamily', 'format.fontSize', 'format.growFont', 'format.bold', 'format.italic',
      'format.underline', 'format.strike', 'format.fillColor', 'format.borderColor', 'format.fontColor',
      'format.alignLeft', 'style.shape']) {
      await expect(cmd(app, id), id).toBeDisabled()
    }
    await expect(app.ribbonPanel('home').locator('[data-menu-for="format.fillColor"]')).toBeDisabled()
  })
})

test.describe('Estilo: forma del tema', () => {
  test('la galería aplica la forma, marca la actual y persiste tras recargar', async ({ page, maps }) => {
    const { app, map } = await setupMap(page, maps)
    await app.selectNode('Beta')
    await cmd(app, 'style.shape').click()
    await expect(app.menu.locator('[data-option]')).toHaveCount(9)
    await app.menu.locator('[data-option="ellipse"]').click()
    await expect(app.menu).toBeHidden()
    await expect.poll(() => app.nodeData('Beta', 'shape')).toBe('ellipse')

    await cmd(app, 'style.shape').click()
    await expect(app.menu.locator('[data-option="ellipse"]')).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('Escape')

    await expect.poll(async () => (await maps.get(map.id)).data.root.children[1].data.shape).toBe('ellipse')
    await page.reload()
    await app.openMapByTitle(map.title)
    expect(await app.nodeData('Beta', 'shape')).toBe('ellipse')
  })
})
