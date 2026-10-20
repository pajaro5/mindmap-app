// Fase 25 · Vista Gantt y calendario laborable
const { test, expect, setupMap, SAMPLE_TREE } = require('./fixtures')

const clone = o => JSON.parse(JSON.stringify(o))
const DAY = 24

// Fechas relativas a hoy (AAAA-MM-DD), para que "vencida" no dependa del día de la prueba
const dayOffset = n => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  const pad = v => String(v).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function taskMap() {
  const data = clone(SAMPLE_TREE)
  const [alfa, beta, gamma] = data.root.children
  alfa.data._task = { start: dayOffset(-10), due: dayOffset(-5) } // vencida
  alfa.children[0].data._task = { start: dayOffset(-8), due: dayOffset(-6) }
  alfa.children[0].data.icon = ['progress_8'] // completada
  beta.data._task = { start: dayOffset(2), due: dayOffset(2), milestone: true }
  void gamma // sin fechas: no sale
  return data
}

const ganttRows = page => page.locator('.gantt .gantt-row')

test.describe('Vista Gantt', () => {
  test('muestra las tareas con fechas, con barras proporcionales y su estado', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps, { data: taskMap() })
    await app.clickRibbon('view', 'view.gantt')
    await expect(page.locator('.gantt')).toBeVisible()
    await expect(ganttRows(page).locator('.gantt-name')).toHaveText(['Alfa', 'Alfa uno', 'Beta'])
    const bar = uid => page.locator(`.gantt .gantt-bar[data-uid="${uid}"]`)
    const uids = await page.evaluate(() => {
      const root = Alpine.raw(window.Alpine.$data(document.body).mindMap).renderer.renderTree
      return { alfa: root.children[0].data.uid, uno: root.children[0].children[0].data.uid, beta: root.children[1].data.uid }
    })
    // Alfa: 6 días; empieza el primer día de la escala más uno (la escala tiene un día de margen)
    const alfa = await bar(uids.alfa).evaluate(el => ({ left: parseFloat(el.style.left), width: parseFloat(el.style.width) }))
    expect(alfa).toEqual({ left: DAY, width: 6 * DAY })
    const uno = await bar(uids.uno).evaluate(el => ({ left: parseFloat(el.style.left), width: parseFloat(el.style.width) }))
    expect(uno).toEqual({ left: 3 * DAY, width: 3 * DAY })
    await expect(bar(uids.alfa)).toHaveClass(/gantt-overdue/)
    await expect(bar(uids.uno)).toHaveClass(/gantt-done/)
    await expect(bar(uids.beta)).toHaveClass(/gantt-milestone/)
    await expect(ganttRows(page).nth(0).locator('.gantt-duration')).toHaveText('6 d')

    // Volver al mapa
    await app.clickRibbon('view', 'view.map')
    await expect(page.locator('.gantt')).toBeHidden()
  })

  test('clic en una fila selecciona el tema; doble clic abre Información de tarea', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps, { data: taskMap() })
    await app.clickRibbon('view', 'view.gantt')
    await ganttRows(page).filter({ hasText: 'Beta' }).click()
    await expect.poll(() => page.evaluate(() => {
      const list = window.Alpine.$data(document.body).activeNodeList
      return list.length === 1 ? list[0].getData('text').replace(/<[^>]+>/g, '') : null
    })).toBe('Beta')
    await expect(ganttRows(page).filter({ hasText: 'Beta' })).toHaveClass(/selected/)
    await ganttRows(page).filter({ hasText: 'Beta' }).dblclick()
    await expect.poll(async () => (await app.state()).pane).toBe('taskInfo')
  })

  test('sin tareas con fecha muestra cómo empezar', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.clickRibbon('view', 'view.gantt')
    await expect(page.locator('.gantt .gantt-empty')).toContainText('Información de tarea')
  })
})

test.describe('Calendario laborable', () => {
  test('contar solo de lunes a viernes cambia la duración en el panel y en el Gantt; se deshace', async ({ page, maps }) => {
    const data = clone(SAMPLE_TREE)
    // Lunes 2 de marzo de 2026 a lunes 9: 8 días naturales, 6 laborables
    data.root.children[1].data._task = { start: '2026-03-02', due: '2026-03-09' }
    const { app } = await setupMap(page, maps, { data })
    await app.selectNode('Beta')
    await app.ribbonCmd('home', 'pane.taskInfo').click()
    const pane = page.locator('.task-pane')
    await expect(pane.locator('.task-duration')).toContainText('8')
    await app.recordsHistory(() => pane.locator('[name="workweek"]').check())
    await expect(pane.locator('.task-duration')).toContainText('6')
    expect(await page.evaluate(() => Alpine.raw(window.Alpine.$data(document.body).mindMap).renderer.renderTree.data._workweek)).toBe(true)
    await app.clickRibbon('view', 'view.gantt')
    await expect(ganttRows(page).first().locator('.gantt-duration')).toHaveText('6 d')
    await expect(page.locator('.gantt .gantt-day.weekend').first()).toBeVisible()
    await app.qat('edit.undo').click()
    await expect(ganttRows(page).first().locator('.gantt-duration')).toHaveText('8 d')
  })
})
