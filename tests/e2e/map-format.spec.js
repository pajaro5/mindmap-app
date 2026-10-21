// Fase 16 · Pestaña Formato: temas del mapa, ramas, espaciado, fondo, sombras y más diseños
const { test, expect, setupMap, SAMPLE_TREE } = require('./fixtures')

const clone = o => JSON.parse(JSON.stringify(o))
const cmd = (app, id) => app.ribbonCmd('format', id)

// Formato guardado en el tema central (fuente de verdad) y opciones efectivas de la librería
const savedFormat = app => app.page.evaluate(() =>
  Alpine.raw(window.Alpine.$data(document.body).mindMap).renderer.renderTree.data._mapFormat)
const libTheme = app => app.page.evaluate(() => {
  const mm = Alpine.raw(window.Alpine.$data(document.body).mindMap)
  return { name: mm.opt.theme, config: JSON.parse(JSON.stringify(mm.themeConfig)), rainbow: mm.opt.rainbowLinesConfig.open }
})
const background = app => app.page.evaluate(() => getComputedStyle(document.getElementById('mindMapContainer')).backgroundColor)

// Cómo se pinta un tema: filtro de sombra de su forma y la rama que llega a él
const topicLook = (app, text) => app.page.evaluate(text => {
  const strip = s => String(s).replace(/<[^>]+>/g, '').trim()
  const mm = Alpine.raw(window.Alpine.$data(document.body).mindMap)
  const find = n => !n ? null : strip(n.getData('text')) === text ? n : (n.children || []).map(find).find(Boolean)
  const node = find(mm.renderer.root)
  if (!node || !node.shapeNode) return null
  const parent = node.parent
  const line = parent && parent._lines && parent._lines[parent.children.indexOf(node)]
  const rect = node.group.node.getBoundingClientRect()
  return {
    filter: node.shapeNode.node.getAttribute('filter'),
    fill: node.shapeNode.node.getAttribute('fill'),
    lineColor: line ? line.node.getAttribute('stroke') : null,
    lineWidth: line ? Number(line.node.getAttribute('stroke-width')) : null,
    linePath: line ? line.node.getAttribute('d') : null,
    top: rect.top,
    left: rect.left
  }
}, text)

async function chooseOption(app, owner, value) {
  await app.ribbonTab('format').click()
  await cmd(app, owner).click()
  await expect(app.menu).toBeVisible()
  await app.menu.locator(`[data-option="${value}"]`).click()
  await expect(app.menu).toBeHidden()
}

async function pickFormatColor(app, owner, color) {
  await app.ribbonTab('format').click()
  await app.ribbonPanel('format').locator(`[data-menu-for="${owner}"]`).click()
  await expect(app.menu).toBeVisible()
  await app.menu.locator(`[data-color="${color}"]`).click()
  await expect(app.menu).toBeHidden()
}

test.describe('Temas del mapa', () => {
  test('la galería muestra los temas con vista previa y marca el actual', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.ribbonTab('format').click()
    await cmd(app, 'mapTheme.apply').click()
    // Los 10 temas de serie (los propios, "user:…", pueden venir de otras pruebas en paralelo)
    const options = app.menu.locator('[data-option]:not([data-option^="user:"])')
    await expect(options).toHaveCount(10)
    await expect(options.first().locator('svg')).toBeVisible()
    await expect(app.menu.locator('[data-option="mindmanager"]')).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('Escape')
  })

  test('aplicar un tema cambia colores y fondo, se guarda y sobrevive a recargar', async ({ page, maps }) => {
    const { app, map } = await setupMap(page, maps)
    expect(await background(app)).toBe('rgb(255, 255, 255)')
    await app.recordsHistory(() => chooseOption(app, 'mapTheme.apply', 'mm-night'))

    await expect.poll(() => background(app)).toBe('rgb(30, 37, 48)')
    await expect.poll(async () => (await topicLook(app, 'Beta') || {}).fill).toBe('#34465e')
    expect(await savedFormat(app)).toEqual({ theme: 'mm-night' })

    // En el servidor: el formato en el tema central y el nombre del tema de la librería
    await expect.poll(async () => (await maps.get(map.id)).data.root.data._mapFormat).toEqual({ theme: 'mm-night' })
    expect((await maps.get(map.id)).data.theme.template).toBe('mm-night')

    await page.reload()
    await app.openMapByTitle(map.title)
    expect(await background(app)).toBe('rgb(30, 37, 48)')
    expect((await libTheme(app)).name).toBe('mm-night')
    await app.ribbonTab('format').click()
    await cmd(app, 'mapTheme.apply').click()
    await expect(app.menu.locator('[data-option="mm-night"]')).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('Escape')
  })

  test('Deshacer y Rehacer devuelven el aspecto del mapa', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.recordsHistory(() => chooseOption(app, 'mapTheme.apply', 'mm-forest'))
    await expect.poll(() => background(app)).toBe('rgb(246, 251, 244)')

    await app.qat('edit.undo').click()
    await expect.poll(() => background(app)).toBe('rgb(255, 255, 255)')
    expect((await libTheme(app)).name).toBe('mindmanager')
    expect(await savedFormat(app)).toBeUndefined()
    // La forma del tema vuelve a pintarse con el degradado del tema predeterminado
    await expect.poll(async () => (await topicLook(app, 'Beta') || {}).fill).toMatch(/^url\(/)

    await app.qat('edit.redo').click()
    await expect.poll(() => background(app)).toBe('rgb(246, 251, 244)')
    expect((await libTheme(app)).name).toBe('mm-forest')
  })

  test('aplicar un tema quita los cambios de ramas, fondo y sombras; Restablecer los quita y deja el tema', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.ribbonTab('format').click()
    await expect(cmd(app, 'mapFormat.reset')).toBeDisabled()

    await chooseOption(app, 'mapTheme.apply', 'mm-violet')
    await cmd(app, 'mapFormat.lineStyle').selectOption('direct')
    await expect.poll(() => savedFormat(app)).toEqual({ theme: 'mm-violet', lineStyle: 'direct' })
    await expect(cmd(app, 'mapFormat.reset')).toBeEnabled()

    await cmd(app, 'mapFormat.reset').click()
    await expect.poll(() => savedFormat(app)).toEqual({ theme: 'mm-violet' })
    await expect(cmd(app, 'mapFormat.lineStyle')).toHaveValue('curve')
    await expect(cmd(app, 'mapFormat.reset')).toBeDisabled()

    await pickFormatColor(app, 'mapFormat.background', '#ffff00')
    await expect.poll(() => savedFormat(app)).toEqual({ theme: 'mm-violet', background: '#ffff00' })
    await chooseOption(app, 'mapTheme.apply', 'mm-pastel')
    await expect.poll(() => savedFormat(app)).toEqual({ theme: 'mm-pastel' })
    await expect.poll(() => background(app)).toBe('rgb(255, 253, 248)')
  })

  test('el formato propio de un tema se mantiene al cambiar de tema', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNode('Beta')
    await app.pickColor('format.fillColor', '#ffc000')
    await chooseOption(app, 'mapTheme.apply', 'mm-night')
    await expect.poll(async () => (await topicLook(app, 'Gamma') || {}).fill).toBe('#34465e')
    expect((await topicLook(app, 'Beta')).fill).toBe('#ffc000')
  })
})

test.describe('Ramas', () => {
  test('forma de las ramas: el selector refleja el tema y cambia el trazado', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.ribbonTab('format').click()
    await expect(cmd(app, 'mapFormat.lineStyle')).toHaveValue('curve')
    const curved = (await topicLook(app, 'Gamma')).linePath
    expect(curved).toMatch(/[CQ]/i)

    await cmd(app, 'mapFormat.lineStyle').selectOption('direct')
    await expect.poll(async () => (await topicLook(app, 'Gamma') || {}).linePath).not.toBe(curved)
    expect((await topicLook(app, 'Gamma')).linePath).not.toMatch(/[CQ]/i)
    expect((await libTheme(app)).config.lineStyle).toBe('direct')
    await expect(cmd(app, 'mapFormat.lineStyle')).toHaveValue('direct')

    // El tema Monocromo trae ramas en ángulo
    await chooseOption(app, 'mapTheme.apply', 'mm-mono')
    await expect(cmd(app, 'mapFormat.lineStyle')).toHaveValue('straight')
  })

  test('grosor: finas y gruesas escalan el grosor del tema', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    // Grosor de las ramas del tema en cada nivel; los demás grosores son proporcionales
    const widths = async () => [(await topicLook(app, 'Beta') || {}).lineWidth, (await topicLook(app, 'Alfa uno') || {}).lineWidth]
    const [beta, alfaUno] = await widths()
    expect(beta).toBeGreaterThan(0)
    await app.ribbonTab('format').click()
    await cmd(app, 'mapFormat.lineWidth').selectOption('thick')
    await expect.poll(widths).toEqual([beta * 2, alfaUno * 2])
    await cmd(app, 'mapFormat.lineWidth').selectOption('thin')
    await expect.poll(widths).toEqual([Math.max(0.5, beta / 2), Math.max(0.5, alfaUno / 2)])
    await cmd(app, 'mapFormat.lineWidth').selectOption('normal')
    await expect.poll(widths).toEqual([beta, alfaUno])
    // "Normal" no se guarda: es lo del tema
    expect(await savedFormat(app)).toEqual({ theme: 'mindmanager' })
  })

  test('color de las ramas y "Automático" vuelve al del tema', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    expect((await topicLook(app, 'Beta')).lineColor).toBe('#b9b9b9')
    await pickFormatColor(app, 'mapFormat.lineColor', '#c00000')
    await expect.poll(async () => (await topicLook(app, 'Beta') || {}).lineColor).toBe('#c00000')
    expect((await topicLook(app, 'Alfa uno')).lineColor).toBe('#c00000')

    await app.ribbonPanel('format').locator('[data-menu-for="mapFormat.lineColor"]').click()
    await expect(app.menu.locator('.swatch.current')).toHaveAttribute('data-color', '#c00000')
    await app.menu.locator('[data-color="auto"]').click()
    await expect.poll(async () => (await topicLook(app, 'Beta') || {}).lineColor).toBe('#b9b9b9')
  })

  test('ramas de colores: cada rama principal con su color, en un paso de deshacer', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.ribbonTab('format').click()
    await app.recordsHistory(() => cmd(app, 'mapFormat.rainbow').click())
    await expect(cmd(app, 'mapFormat.rainbow')).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(async () => (await topicLook(app, 'Alfa') || {}).lineColor).not.toBe('#b9b9b9')
    const colors = await Promise.all(['Alfa', 'Beta', 'Gamma'].map(async t => (await topicLook(app, t)).lineColor))
    expect(new Set(colors).size).toBe(3)
    // Los subtemas siguen el color de su rama principal
    expect((await topicLook(app, 'Alfa uno')).lineColor).toBe(colors[0])

    await app.qat('edit.undo').click()
    await expect.poll(async () => (await topicLook(app, 'Alfa') || {}).lineColor).toBe('#b9b9b9')
    await expect(cmd(app, 'mapFormat.rainbow')).toHaveAttribute('aria-pressed', 'false')
  })
})

test.describe('Espaciado y fondo', () => {
  test('el espaciado separa o junta los temas', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    const gap = async () => {
      const a = await topicLook(app, 'Alfa')
      const b = await topicLook(app, 'Beta')
      return a && b ? Math.round(b.top - a.top) : null
    }
    const normal = await gap()
    await app.ribbonTab('format').click()
    await cmd(app, 'mapFormat.spacing').selectOption('wide')
    await expect.poll(gap).toBeGreaterThan(normal + 5)
    await cmd(app, 'mapFormat.spacing').selectOption('compact')
    await expect.poll(gap).toBeLessThan(normal - 5)
    expect(await savedFormat(app)).toEqual({ theme: 'mindmanager', spacing: 'compact' })
  })

  test('color de fondo del mapa con la paleta y "Automático"', async ({ page, maps }) => {
    const { app, map } = await setupMap(page, maps)
    await pickFormatColor(app, 'mapFormat.background', '#dbe8f7')
    await expect.poll(() => background(app)).toBe('rgb(219, 232, 247)')
    await expect.poll(async () => (await maps.get(map.id)).data.root.data._mapFormat).toEqual({ theme: 'mindmanager', background: '#dbe8f7' })

    await app.ribbonPanel('format').locator('[data-menu-for="mapFormat.background"]').click()
    await app.menu.locator('[data-color="auto"]').click()
    await expect.poll(() => background(app)).toBe('rgb(255, 255, 255)')
  })
})

test.describe('Sombras', () => {
  test('Sombras pone y quita la sombra de todos los temas con forma', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.ribbonTab('format').click()
    await expect(cmd(app, 'mapFormat.shadow')).toHaveAttribute('aria-pressed', 'false')
    expect((await topicLook(app, 'Raíz')).filter).toBeNull()

    await cmd(app, 'mapFormat.shadow').click()
    await expect.poll(async () => (await topicLook(app, 'Raíz') || {}).filter).toBe('url(#mm-topic-shadow)')
    expect((await topicLook(app, 'Beta')).filter).toBe('url(#mm-topic-shadow)')
    await expect(page.locator('#mindMapContainer svg defs filter#mm-topic-shadow')).toHaveCount(1)
    await expect(cmd(app, 'mapFormat.shadow')).toHaveAttribute('aria-pressed', 'true')

    await cmd(app, 'mapFormat.shadow').click()
    await expect.poll(async () => (await topicLook(app, 'Raíz') || {}).filter).toBeNull()
    expect(await savedFormat(app)).toEqual({ theme: 'mindmanager', shadow: false })
  })

  test('el tema Relieve trae sombras y se pueden quitar', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await chooseOption(app, 'mapTheme.apply', 'mm-relief')
    await expect.poll(async () => (await topicLook(app, 'Beta') || {}).filter).toBe('url(#mm-topic-shadow)')
    await expect(cmd(app, 'mapFormat.shadow')).toHaveAttribute('aria-pressed', 'true')
    await cmd(app, 'mapFormat.shadow').click()
    await expect.poll(async () => (await topicLook(app, 'Beta') || {}).filter).toBeNull()
  })

  test('sombra de un tema (Inicio › Estilo): se copia con Copiar formato y se quita con Quitar formato', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    const shadowBtn = app.ribbonCmd('home', 'style.shadow')
    await expect(shadowBtn).toBeDisabled()
    await app.selectNode('Beta')
    await expect(shadowBtn).toHaveAttribute('aria-pressed', 'false')
    await shadowBtn.click()
    await expect.poll(() => app.nodeData('Beta', 'shadow')).toBe(true)
    await expect.poll(async () => (await topicLook(app, 'Beta') || {}).filter).toBe('url(#mm-topic-shadow)')
    expect((await topicLook(app, 'Gamma')).filter).toBeNull()
    await expect(shadowBtn).toHaveAttribute('aria-pressed', 'true')

    // Copiar formato de Beta a Gamma
    await app.ribbonCmd('home', 'clipboard.formatPainter').click()
    await app.node('Gamma').click()
    await expect.poll(async () => (await topicLook(app, 'Gamma') || {}).filter).toBe('url(#mm-topic-shadow)')

    await app.selectNode('Beta')
    await app.ribbonCmd('home', 'clear.format').click()
    await expect.poll(() => app.nodeData('Beta', 'shadow')).toBeUndefined()
    await expect.poll(async () => (await topicLook(app, 'Beta') || {}).filter).toBeNull()
  })

  test('las sombras van en el SVG que usan las exportaciones a imagen', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.ribbonTab('format').click()
    await cmd(app, 'mapFormat.shadow').click()
    await expect.poll(async () => (await topicLook(app, 'Raíz') || {}).filter).toBe('url(#mm-topic-shadow)')
    const svg = await page.evaluate(() => Alpine.raw(window.Alpine.$data(document.body).mindMap).getSvgData().svgHTML)
    expect(svg).toContain('id="mm-topic-shadow"')
    expect(svg).toContain('filter="url(#mm-topic-shadow)"')
  })
})

test.describe('Más diseños', () => {
  test('la galería aplica una variante, marca la actual y se guarda', async ({ page, maps }) => {
    const { app, map } = await setupMap(page, maps)
    await app.ribbonTab('format').click()
    await cmd(app, 'layout.more').click()
    await expect(app.menu.locator('[data-option]')).toHaveCount(7)
    await app.menu.locator('[data-option="logicalStructureLeft"]').click()
    await expect.poll(async () => (await app.state()).layout).toBe('logicalStructureLeft')
    // Árbol a la izquierda: los temas principales quedan a la izquierda del central
    await expect.poll(async () => (await topicLook(app, 'Beta') || {}).left < (await topicLook(app, 'Raíz')).left).toBe(true)
    await expect.poll(async () => (await maps.get(map.id)).data.layout).toBe('logicalStructureLeft')

    await cmd(app, 'layout.more').click()
    await expect(app.menu.locator('[data-option="logicalStructureLeft"]')).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('Escape')
    await expect(cmd(app, 'layout.tree')).toHaveAttribute('aria-pressed', 'false')
  })
})

test.describe('Datos del formato', () => {
  test('[Seguridad] un formato manipulado se sanea al abrir el mapa', async ({ page, maps }) => {
    const data = clone(SAMPLE_TREE)
    data.root.data._mapFormat = {
      theme: 'no-existe', lineStyle: 'zigzag', lineWidth: 99, lineColor: 'red;background:url(javascript:alert(1))',
      background: 'url(https://example.com/x.png)', rainbow: 'yes', spacing: { a: 1 }, shadow: 'true', extra: '<img onerror=alert(1)>'
    }
    const { app } = await setupMap(page, maps, { data })
    expect(await savedFormat(app)).toEqual({ theme: 'mindmanager' })
    expect(await background(app)).toBe('rgb(255, 255, 255)')
    expect((await libTheme(app)).name).toBe('mindmanager')
  })

  test('las funciones de formato derivan bien las opciones de la librería', async ({ app }) => {
    const r = await app.page.evaluate(() => ({
      empty: normalizeMapFormat(undefined),
      legacy: normalizeMapFormat(null, { theme: 'default' }),
      compact: compactMapFormat(normalizeMapFormat({ theme: 'mm-night', lineWidth: 'normal', spacing: 'normal', rainbow: false, shadow: false, lineColor: '#ABCDEF' })),
      config: mapFormatThemeConfig(normalizeMapFormat({ lineWidth: 'thick', spacing: 'wide', shadow: true, background: '#000000' })),
      options: mapFormatOptions({ _mapFormat: { theme: 'mm-mono', rainbow: true } }, { template: 'mindmanager' })
    }))
    expect(r.empty).toEqual({ theme: 'mindmanager', lineStyle: null, lineWidth: null, lineColor: null, rainbow: false, spacing: null, background: null, shadow: null, backgroundImage: null, backgroundFit: null })
    expect(r.legacy.theme).toBe('mindmanager')
    expect(r.compact).toEqual({ theme: 'mm-night', lineColor: '#abcdef', shadow: false })
    expect(r.config.backgroundColor).toBe('#000000')
    expect(r.config.lineWidth).toBe(4)
    expect(r.config.root).toEqual({ lineWidth: 10, shadow: true })
    expect(r.config.second).toEqual({ lineWidth: 4, marginX: 135, marginY: 51, shadow: true })
    expect(r.config.node).toEqual({ lineWidth: 2, marginX: 66, marginY: 6, shadow: true })
    expect(r.options).toEqual({ theme: 'mm-mono', themeConfig: {}, rainbowLinesConfig: { open: true, colorsList: [] } })
  })

  test('sin mapa abierto los controles de Formato están deshabilitados', async ({ app }) => {
    await app.ribbonTab('format').click()
    for (const id of ['mapTheme.apply', 'mapFormat.shadow', 'mapFormat.reset', 'mapFormat.lineStyle', 'mapFormat.lineWidth',
      'mapFormat.lineColor', 'mapFormat.rainbow', 'mapFormat.spacing', 'mapFormat.background', 'layout.more']) {
      await expect(cmd(app, id), id).toBeDisabled()
    }
  })
})
