// Fase 7 · Información de tarea: prioridad y % (como iconos), fechas, hito y recursos;
// panel "Info. de tarea" y etiqueta en el lienzo
const { test, expect, setupMap, SAMPLE_TREE } = require('./fixtures')

const clone = o => JSON.parse(JSON.stringify(o))
const pane = page => page.locator('.task-info-pane')
const field = (page, name) => pane(page).locator(`[name="${name}"]`)
const taskOf = (app, text) => app.nodeData(text, '_task')
const iconsOf = async (app, text) => (await app.nodeData(text, 'icon')) || []
const badge = (app, text) => app.node(text).locator('.smm-task-info')

async function openTaskPane(app, page) {
  await app.ribbonTab('home').click()
  await app.ribbonCmd('home', 'pane.taskInfo').click()
  await expect(pane(page)).toBeVisible()
}

test('el panel se abre desde Inicio y pide seleccionar un tema', async ({ page, maps }) => {
  const { app } = await setupMap(page, maps)
  await openTaskPane(app, page)
  await expect(page.locator('.task-pane-header')).toHaveText(/Info\. de tarea/)
  await expect(pane(page).locator('.icon-sidebar-hint')).toBeVisible()
  await expect(field(page, 'priority')).toHaveCount(0)
  await app.selectNode('Beta')
  await expect(field(page, 'priority')).toBeVisible()
})

test('prioridad y % completado se guardan como marcadores de icono', async ({ page, maps }) => {
  const data = clone(SAMPLE_TREE)
  data.root.children[1].data.icon = ['flag_red']
  const { app } = await setupMap(page, maps, { data })
  await openTaskPane(app, page)
  await app.selectNode('Beta')

  await app.recordsHistory(() => field(page, 'priority').selectOption('3'))
  await expect.poll(() => iconsOf(app, 'Beta')).toEqual(['flag_red', 'priority_3'])
  await field(page, 'progress').selectOption('50')
  await expect.poll(() => iconsOf(app, 'Beta')).toEqual(['flag_red', 'priority_3', 'progress_4'])
  await expect(field(page, 'priority')).toHaveValue('3')
  await expect(field(page, 'progress')).toHaveValue('50')

  // Un icono de prioridad puesto desde Marcadores se refleja en el panel
  await field(page, 'priority').selectOption('0')
  await expect.poll(() => iconsOf(app, 'Beta')).toEqual(['flag_red', 'progress_4'])
  await field(page, 'progress').selectOption('0')
  await expect.poll(() => iconsOf(app, 'Beta')).toEqual(['flag_red'])
})

test('fechas: se guardan, muestran la duración y se pintan en el tema', async ({ page, maps }) => {
  const { app } = await setupMap(page, maps)
  await openTaskPane(app, page)
  await app.selectNode('Gamma')
  await field(page, 'start').fill('2030-01-10')
  await field(page, 'due').fill('2030-01-20')
  await expect.poll(() => taskOf(app, 'Gamma')).toEqual({ start: '2030-01-10', due: '2030-01-20' })
  await expect(pane(page).locator('.task-duration')).toHaveText('Duración: 11 días')
  await expect(badge(app, 'Gamma')).toHaveText('10 ene → 20 ene')
  await expect(badge(app, 'Gamma')).toHaveAttribute('data-state', 'normal')

  // Deshacer quita la última fecha
  await app.qat('edit.undo').click()
  await expect.poll(() => taskOf(app, 'Gamma')).toEqual({ start: '2030-01-10' })
  await expect(badge(app, 'Gamma')).toHaveText('Inicio 10 ene')
})

test('no se acepta un vencimiento anterior al inicio', async ({ page, maps }) => {
  const data = clone(SAMPLE_TREE)
  data.root.children[2].data._task = { start: '2030-03-10' }
  const { app } = await setupMap(page, maps, { data })
  await openTaskPane(app, page)
  await app.selectNode('Gamma')
  await field(page, 'due').fill('2030-03-01')
  await expect(pane(page).locator('.task-error')).toHaveText(/anterior/)
  await expect(field(page, 'due')).toHaveValue('')
  expect(await taskOf(app, 'Gamma')).toEqual({ start: '2030-03-10' })
})

test('una tarea vencida se marca en rojo y una completada en verde', async ({ page, maps }) => {
  const data = clone(SAMPLE_TREE)
  data.root.children[1].data._task = { due: '2000-01-05' }
  data.root.children[2].data._task = { due: '2000-01-05' }
  data.root.children[2].data.icon = ['progress_8']
  const { app } = await setupMap(page, maps, { data })
  await expect(badge(app, 'Beta')).toHaveAttribute('data-state', 'overdue')
  await expect(badge(app, 'Beta')).toHaveText('Vence 5 ene')
  await expect(badge(app, 'Gamma')).toHaveAttribute('data-state', 'done')
})

test('hito y recursos: añadir, sugerir y quitar', async ({ page, maps }) => {
  const data = clone(SAMPLE_TREE)
  data.root.children[2].data._task = { resources: ['Lucía'] }
  const { app } = await setupMap(page, maps, { data })
  await openTaskPane(app, page)
  await app.selectNode('Beta')

  await field(page, 'milestone').check()
  await expect.poll(() => taskOf(app, 'Beta')).toEqual({ milestone: true })
  await expect(badge(app, 'Beta')).toHaveText('◆ Hito')

  // Se sugieren los recursos usados en el mapa
  await expect(pane(page).locator('#taskResources option')).toHaveCount(1)
  await expect(pane(page).locator('#taskResources option')).toHaveAttribute('value', 'Lucía')

  for (const name of ['Ana', 'Juan', 'ana']) {
    await field(page, 'resource').fill(name)
    await field(page, 'resource').press('Enter')
  }
  await expect.poll(async () => (await taskOf(app, 'Beta')).resources).toEqual(['Ana', 'Juan'])
  await expect(field(page, 'resource')).toHaveValue('')
  await expect(pane(page).locator('.resource-chip > span')).toHaveText(['Ana', 'Juan'])
  await expect(badge(app, 'Beta')).toHaveText('◆ Ana, Juan')

  await pane(page).locator('.resource-chip[data-resource="Ana"] button').click()
  await expect.poll(async () => (await taskOf(app, 'Beta')).resources).toEqual(['Juan'])
})

test('con varios temas, cada cambio se aplica a todos sin copiar el resto de datos', async ({ page, maps }) => {
  const data = clone(SAMPLE_TREE)
  data.root.children[1].data._task = { resources: ['Ana'] }
  const { app } = await setupMap(page, maps, { data })
  await openTaskPane(app, page)
  await app.selectNodes('Beta', 'Gamma')
  await expect(pane(page).locator('.task-count')).toHaveText('Los cambios se aplican a 2 temas')
  await app.recordsHistory(() => field(page, 'due').fill('2031-05-01'))
  await expect.poll(() => taskOf(app, 'Gamma')).toEqual({ due: '2031-05-01' })
  expect(await taskOf(app, 'Beta')).toEqual({ due: '2031-05-01', resources: ['Ana'] })

  // Una sola entrada de historial para los dos temas
  await app.qat('edit.undo').click()
  await expect.poll(() => taskOf(app, 'Gamma')).toBeUndefined()
  expect(await taskOf(app, 'Beta')).toEqual({ resources: ['Ana'] })
})

test('"Quitar información de tarea" borra fechas, recursos, prioridad y progreso, pero no otros iconos', async ({ page, maps }) => {
  const data = clone(SAMPLE_TREE)
  Object.assign(data.root.children[1].data, { _task: { due: '2030-01-01', resources: ['Ana'] }, icon: ['priority_1', 'flag_red', 'progress_2'] })
  const { app } = await setupMap(page, maps, { data })
  await app.selectNode('Gamma')
  await app.ribbonPanel('home').locator('[data-menu-for="clear.format"]').click()
  await expect(app.menu.locator('[data-cmd="clear.task"]')).toBeDisabled()
  await page.keyboard.press('Escape')

  await app.selectNode('Beta')
  await app.chooseFromMenu('home', 'clear.format', 'clear.task')
  await expect.poll(() => taskOf(app, 'Beta')).toBeUndefined()
  expect(await iconsOf(app, 'Beta')).toEqual(['flag_red'])
  await expect(badge(app, 'Beta')).toHaveCount(0)
})

test('"Limpiar todo" también quita la información de tarea', async ({ page, maps }) => {
  const data = clone(SAMPLE_TREE)
  data.root.children[1].data._task = { due: '2030-01-01' }
  const { app } = await setupMap(page, maps, { data })
  await app.selectNode('Beta')
  await app.chooseFromMenu('home', 'clear.format', 'clear.all')
  await expect.poll(() => taskOf(app, 'Beta')).toBeUndefined()
})

test('"Copiar formato" no copia la información de tarea', async ({ page, maps }) => {
  const data = clone(SAMPLE_TREE)
  data.root.children[1].data._task = { due: '2030-01-01', resources: ['Ana'] }
  const { app } = await setupMap(page, maps, { data })
  await app.selectNode('Beta')
  await app.ribbonCmd('home', 'clipboard.formatPainter').click()
  await app.node('Gamma').click()
  await expect.poll(() => app.isPainterActive()).toBe(false)
  expect(await taskOf(app, 'Gamma')).toBeUndefined()
})

test('la información de tarea persiste tras recargar', async ({ page, maps }) => {
  const { app, map } = await setupMap(page, maps)
  await openTaskPane(app, page)
  await app.selectNode('Alfa')
  await field(page, 'start').fill('2030-06-01')
  await expect.poll(async () => (await maps.get(map.id)).data.root.children[0].data._task).toEqual({ start: '2030-06-01' })
  await page.reload()
  await app.openMapByTitle(map.title)
  await expect(badge(app, 'Alfa')).toHaveText('Inicio 1 jun')
})

test('[Seguridad] datos de tarea malformados se sanean y los recursos se muestran como texto', async ({ page, maps }) => {
  const data = clone(SAMPLE_TREE)
  const payload = '<img src=x onerror="window.__xss=1">'
  data.root.children[0].data._task = { start: 'x', due: '2030-02-30', milestone: 'yes', resources: [payload, {}, 5, 'Ana', 'ANA'] }
  data.root.children[1].data._task = 'basura'
  data.root.children[2].data._task = { start: '2030-01-01', evil: '<script>' }
  const { app } = await setupMap(page, maps, { data })
  expect((await app.state()).errorMsg).toBe('')
  expect(await taskOf(app, 'Alfa')).toEqual({ resources: [payload, '5', 'Ana'] })
  expect(await taskOf(app, 'Beta')).toBeUndefined()
  expect(await taskOf(app, 'Gamma')).toEqual({ start: '2030-01-01' })
  await expect(badge(app, 'Alfa')).toContainText(payload)
  await page.waitForTimeout(200)
  expect(await page.evaluate(() => window.__xss)).toBeUndefined()
})
