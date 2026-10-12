// Registro de comandos y cinta declarativa (Fase 0)
const { test, expect, setupMap } = require('./fixtures')

test.describe('Registro de comandos y cinta', () => {
  test('la configuración de la cinta es válida', async ({ app, page }) => {
    const problems = await page.evaluate(() => buildRibbon().problems)
    expect(problems).toEqual([])
  })

  test('buildRibbon detecta comandos desconocidos y pestañas repetidas', async ({ app, page }) => {
    const problems = await page.evaluate(() => buildRibbon([
      { id: 'a', label: 'A', groups: [{ label: 'G', items: [{ cmd: 'no.existe' }] }] },
      { id: 'a', label: 'A2', groups: [] }
    ], ['tampoco.existe']).problems)
    expect(problems).toHaveLength(3)
    expect(problems.join(' ')).toContain('no.existe')
    expect(problems.join(' ')).toContain('tampoco.existe')
    expect(problems.join(' ')).toContain('Pestaña repetida')
  })

  test('layoutGroupColumns apila los botones pequeños de 3 en 3', async ({ app, page }) => {
    const columns = await page.evaluate(() => layoutGroupColumns([
      { cmd: 'a' }, { cmd: 'b', size: 'small' }, { cmd: 'c', size: 'small' }, { cmd: 'd', size: 'small' },
      { cmd: 'e', size: 'small' }, { cmd: 'f' }, { cmd: 'g', size: 'small' }
    ]).map(c => `${c.type}:${c.items.map(i => i.cmd).join('')}`))
    expect(columns).toEqual(['large:a', 'small:bcd', 'small:e', 'large:f', 'small:g'])
  })

  test('buildRibbon valida también los comandos de los desplegables', async ({ app, page }) => {
    const problems = await page.evaluate(() => buildRibbon([
      { id: 'a', label: 'A', groups: [{ label: 'G', items: [{ cmd: 'map.new', menu: ['map.new', 'menu.inexistente'] }] }] }
    ], []).problems)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('menu.inexistente')
  })

  test('todos los botones de la interfaz apuntan a comandos registrados y todo comando es accesible', async ({ app, page }) => {
    const { domCmds, menuCmds, registry } = await page.evaluate(() => ({
      domCmds: [...new Set([...document.querySelectorAll('[data-cmd]')].map(el => el.dataset.cmd))],
      // Los comandos de los desplegables solo están en el DOM con el menú abierto
      menuCmds: RIBBON_TABS.flatMap(t => t.groups.flatMap(g => (g.items || []).flatMap(i => i.menu || []))),
      registry: CommandRegistry.ids()
    }))
    const reachable = new Set([...domCmds, ...menuCmds])
    expect(domCmds.filter(id => !registry.includes(id)), 'botones con comando inexistente').toEqual([])
    expect(registry.filter(id => !reachable.has(id)), 'comandos sin botón en la interfaz').toEqual([])
  })

  test('las pestañas muestran solo su panel', async ({ app, page }) => {
    for (const tab of ['home', 'format', 'view', 'export']) {
      await app.ribbonTab(tab).click()
      await expect(app.ribbonTab(tab)).toHaveAttribute('aria-selected', 'true')
      await expect(page.locator('.ribbon-panel:visible')).toHaveCount(1)
      await expect(app.ribbonPanel(tab)).toBeVisible()
    }
  })

  test('Inicio tiene los grupos de MindManager en orden', async ({ app, page }) => {
    const groups = await app.ribbonPanel('home').locator('.ribbon-group-label').allTextContents()
    expect(groups).toEqual(['Portapapeles', 'Insertar', 'Marcadores', 'Formato', 'Estilo', 'Edición'])
  })

  test('los tooltips incluyen el atajo de teclado', async ({ app }) => {
    await expect(app.ribbonCmd('home', 'topic.insertChild')).toHaveAttribute('title', 'Insertar subtema (Tab)')
    await expect(app.qat('edit.undo')).toHaveAttribute('title', 'Deshacer (Ctrl+Z)')
  })

  test('sin mapa abierto solo están habilitados los comandos que no lo necesitan', async ({ app }) => {
    await expect(app.qat('map.new')).toBeEnabled()
    await expect(app.qat('edit.undo')).toBeDisabled()
    await expect(app.ribbonCmd('home', 'topic.insertChild')).toBeDisabled()
    await app.ribbonTab('format').click()
    await expect(app.ribbonCmd('format', 'layout.radial')).toBeDisabled()
    await app.ribbonTab('export').click()
    await expect(app.ribbonCmd('export', 'export.png')).toBeDisabled()
    await app.ribbonTab('view').click()
    await expect(app.ribbonCmd('view', 'pane.maps')).toBeEnabled()
  })

  test('los comandos de tema dependen de la selección', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    const cmd = id => app.ribbonCmd('home', id)
    await expect(cmd('topic.insertChild')).toBeDisabled()

    // El tema central admite subtemas, pero no hermanos ni cortarse
    await app.selectRoot()
    await expect(cmd('topic.insertChild')).toBeEnabled()
    await expect(cmd('topic.insertSibling')).toBeDisabled()
    await expect(cmd('clipboard.cut')).toBeDisabled()
    await expect(cmd('clipboard.copy')).toBeEnabled()

    await app.selectNode('Beta')
    await expect(cmd('topic.insertSibling')).toBeEnabled()
    await expect(cmd('clipboard.cut')).toBeEnabled()

    await app.clickEmptyCanvas()
    await expect(cmd('topic.insertChild')).toBeDisabled()
    await expect(cmd('clipboard.paste')).toBeDisabled()
  })

  test('los conmutadores reflejan su estado (aria-pressed)', async ({ openMap }) => {
    const { app } = openMap
    await app.ribbonTab('format').click()
    await expect(app.ribbonCmd('format', 'layout.radial')).toHaveAttribute('aria-pressed', 'true')
    await expect(app.ribbonCmd('format', 'layout.tree')).toHaveAttribute('aria-pressed', 'false')
    await app.ribbonTab('home').click()
    await app.ribbonCmd('home', 'markers.icons').click()
    await expect(app.ribbonCmd('home', 'markers.icons')).toHaveAttribute('aria-pressed', 'true')
    await expect(app.strip('pane.markers')).toHaveClass(/active/)
  })

  test('un comando que falla muestra el error en la interfaz sin romper la app', async ({ app, page, pageErrors }) => {
    await page.evaluate(() => {
      COMMANDS['test.boom'] = { label: 'Boom', run: () => { throw new Error('fallo simulado') } }
      window.Alpine.$data(document.body).runCommand('test.boom')
    })
    await expect(app.errorBanner).toContainText('No se pudo ejecutar "Boom": fallo simulado')
    // El error se registra en consola a propósito; se descarta para esta prueba
    pageErrors.length = 0
    await expect(app.qat('map.new')).toBeEnabled()
  })
})
