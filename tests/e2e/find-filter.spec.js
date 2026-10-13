// Fase 9 · Vista: Buscar / Reemplazar (Ctrl+F, Ctrl+H) y Filtro
const { test, expect, setupMap, SAMPLE_TREE } = require('./fixtures')

const clone = o => JSON.parse(JSON.stringify(o))
const bar = page => page.locator('.find-bar')
const findInput = page => bar(page).locator('[name="findText"]')
const status = page => bar(page).locator('.find-status')
const selectedTexts = page => page.evaluate(() =>
  window.Alpine.$data(document.body).mindMap.renderer.activeNodeList.map(n => n.getData('text').replace(/<[^>]+>/g, '').trim()))
const marked = (page, cls) => page.locator(`.smm-node.${cls}`)
const filterPane = page => page.locator('.filter-pane')

test.describe('Buscar', () => {
  test('Ctrl+F abre la barra; busca sin distinguir mayúsculas y salta a la primera', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await page.keyboard.press('Control+f')
    await expect(bar(page)).toBeVisible()
    await expect(findInput(page)).toBeFocused()
    await page.keyboard.type('ALFA')
    await expect(status(page)).toHaveText('1 de 2')
    await expect.poll(() => selectedTexts(page)).toEqual(['Alfa'])
    await expect(marked(page, 'smm-search-match')).toHaveCount(2)
    await expect(marked(page, 'smm-search-current')).toHaveCount(1)

    await page.keyboard.press('Enter')
    await expect(status(page)).toHaveText('2 de 2')
    await expect.poll(() => selectedTexts(page)).toEqual(['Alfa uno'])
    await page.keyboard.press('Enter')
    await expect(status(page)).toHaveText('1 de 2')
    await page.keyboard.press('Shift+Enter')
    await expect(status(page)).toHaveText('2 de 2')
    // La búsqueda no toca el mapa
    expect((await app.tree()).c.map(c => c.t)).toEqual(['Alfa', 'Beta', 'Gamma'])
  })

  test('no distingue tildes, y "Aa" exige mayúsculas exactas', async ({ page, maps }) => {
    const data = clone(SAMPLE_TREE)
    data.root.children[1].data.text = 'Diseño'
    const { app } = await setupMap(page, maps, { data })
    await app.ribbonTab('view').click()
    await app.ribbonCmd('view', 'view.find').click()
    await findInput(page).fill('diseno')
    await expect(status(page)).toHaveText('1 de 1')
    await bar(page).locator('[data-action="match-case"]').click()
    await expect(status(page)).toHaveText('Sin resultados')
    await findInput(page).fill('Diseno')
    await expect(status(page)).toHaveText('1 de 1')
  })

  test('encuentra temas en ramas contraídas y las despliega al ir a ellos', async ({ page, maps }) => {
    const data = clone(SAMPLE_TREE)
    data.root.children[0].data.expand = false
    const { app } = await setupMap(page, maps, { data })
    await expect(app.node('Alfa uno')).toHaveCount(0)
    await page.keyboard.press('Control+f')
    await expect(findInput(page)).toBeFocused()
    await page.keyboard.type('uno')
    await expect(status(page)).toHaveText('1 de 1')
    await expect(app.node('Alfa uno')).toBeVisible()
    await expect.poll(() => selectedTexts(page)).toEqual(['Alfa uno'])
  })

  test('la opción "Notas" busca también en las notas', async ({ page, maps }) => {
    const data = clone(SAMPLE_TREE)
    data.root.children[2].data.note = 'Hablar con proveedores'
    await setupMap(page, maps, { data })
    await page.keyboard.press('Control+f')
    await expect(findInput(page)).toBeFocused()
    await page.keyboard.type('proveedor')
    await expect(status(page)).toHaveText('Sin resultados')
    await bar(page).locator('[data-action="include-notes"]').click()
    await expect(status(page)).toHaveText('1 de 1')
    await expect.poll(() => selectedTexts(page)).toEqual(['Gamma'])
  })

  test('Esc cierra la barra, quita el resaltado y los atajos del mapa vuelven a funcionar', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await page.keyboard.press('Control+f')
    await expect(findInput(page)).toBeFocused()
    await page.keyboard.type('Beta')
    await expect(marked(page, 'smm-search-match')).toHaveCount(1)
    await page.keyboard.press('Escape')
    await expect(bar(page)).toBeHidden()
    await expect(marked(page, 'smm-search-match')).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => document.activeElement === document.body)).toBe(true)
    // Beta quedó seleccionado: Tab le añade un subtema
    await page.keyboard.press('Tab')
    await app.typeNewTopic('Hijo de Beta')
    await expect.poll(async () => (await app.tree()).c[1].c.map(c => c.t)).toEqual(['Hijo de Beta'])
  })
})

test.describe('Reemplazar', () => {
  test('reemplaza el actual y luego todos en un solo paso de deshacer', async ({ page, maps }) => {
    const data = clone(SAMPLE_TREE)
    data.root.children[1].data.text = 'Beta alfa'
    const { app } = await setupMap(page, maps, { data })
    await page.keyboard.press('Control+h')
    await expect(bar(page).locator('[name="replaceText"]')).toBeVisible()
    await findInput(page).fill('alfa')
    await expect(status(page)).toHaveText('1 de 3')
    await bar(page).locator('[name="replaceText"]').fill('Omega')

    await bar(page).locator('[data-action="replace-one"]').click()
    await expect.poll(async () => (await app.tree()).c.map(c => c.t)).toEqual(['Omega', 'Beta alfa', 'Gamma'])
    await expect(status(page)).toHaveText(/de 2$/)

    await app.recordsHistory(() => bar(page).locator('[data-action="replace-all"]').click())
    await expect.poll(async () => {
      const t = await app.tree()
      return [t.c[0].c[0].t, t.c[1].t]
    }).toEqual(['Omega uno', 'Beta Omega'])
    await expect(status(page)).toHaveText('Sin resultados')

    await app.qat('edit.undo').click()
    await expect.poll(async () => {
      const t = await app.tree()
      return [t.c[0].t, t.c[0].c[0].t, t.c[1].t]
    }).toEqual(['Omega', 'Alfa uno', 'Beta alfa'])
  })

  test('[Seguridad] el texto de reemplazo se guarda escapado y se muestra como texto', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    const payload = '<img src=x onerror="window.__xss=1">'
    await page.keyboard.press('Control+h')
    await findInput(page).fill('Gamma')
    await bar(page).locator('[name="replaceText"]').fill(payload)
    await bar(page).locator('[data-action="replace-all"]').click()
    await expect(app.node(payload)).toBeVisible()
    expect(await page.evaluate(() => window.Alpine.$data(document.body).mindMap.renderer.root.children[2].getData('text')))
      .toBe('<p>&lt;img src=x onerror=&quot;window.__xss=1&quot;&gt;</p>')
    await page.waitForTimeout(200)
    expect(await page.evaluate(() => window.__xss)).toBeUndefined()
  })

  test('buscar una palabra que aparece en el HTML del tema no lo rompe', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    // Los temas son <p>…</p>: la librería reemplazaba dentro de las etiquetas
    await page.keyboard.press('Control+h')
    await findInput(page).fill('p')
    await expect(status(page)).toHaveText('Sin resultados')
    await findInput(page).fill('a')
    await bar(page).locator('[name="replaceText"]').fill('4')
    await bar(page).locator('[data-action="replace-all"]').click()
    await expect.poll(async () => (await app.tree()).c.map(c => c.t)).toEqual(['4lf4', 'Bet4', 'G4mm4'])
  })
})

test.describe('Filtro', () => {
  const FILTER_DATA = () => {
    const data = clone(SAMPLE_TREE)
    data.root.children[0].data.icon = ['priority_1']                                   // Alfa
    data.root.children[0].children[0].data._task = { resources: ['Ana'], due: '2000-01-01' } // Alfa uno (vencida)
    data.root.children[1].data.tag = [{ text: 'Urgente', style: { fill: '#c00000' } }] // Beta
    data.root.children[2].data._task = { resources: ['Juan'], due: '2999-01-01' }       // Gamma
    return data
  }
  const dimmed = page => page.evaluate(() => [...document.querySelectorAll('.smm-node.smm-filter-dim foreignObject')]
    .map(f => f.textContent.trim()).sort())

  test('filtrar por icono atenúa lo demás pero deja el contexto (antecesores)', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps, { data: FILTER_DATA() })
    const history = await app.historyIndex()
    await app.ribbonTab('view').click()
    await app.ribbonCmd('view', 'pane.filter').click()
    await expect(filterPane(page)).toBeVisible()
    await filterPane(page).locator('.filter-icon[data-icon="priority_1"]').click()
    await expect.poll(() => dimmed(page)).toEqual(['Alfa uno', 'Beta', 'Gamma'])
    await expect(page.locator('.filter-status')).toContainText('Filtro: 1 de 5 temas')
    await expect(app.ribbonCmd('view', 'view.filter.clear')).toBeEnabled()

    // Con "subtemas", también Alfa uno
    await filterPane(page).locator('[name="withSubtopics"]').check()
    await expect.poll(() => dimmed(page)).toEqual(['Beta', 'Gamma'])

    // El filtro no cambia el mapa ni el historial
    expect(await app.historyIndex()).toBe(history)
    await page.locator('[data-action="status-clear-filter"]').click()
    await expect.poll(() => dimmed(page)).toEqual([])
    await expect(page.locator('.filter-status')).toBeHidden()
  })

  test('las llamadas de los temas atenuados también se atenúan', async ({ page, maps }) => {
    const data = FILTER_DATA()
    data.root.children[1].data._callouts = [{ id: 'k1', text: 'De Beta', dx: 24, dy: -14 }]
    data.root.children[0].data._callouts = [{ id: 'k2', text: 'De Alfa', dx: 24, dy: -14 }]
    const { app } = await setupMap(page, maps, { data })
    await app.ribbonTab('view').click()
    await app.ribbonCmd('view', 'pane.filter').click()
    await filterPane(page).locator('.filter-icon[data-icon="priority_1"]').click()
    await expect(page.locator('.smm-callout.smm-filter-dim')).toHaveText(['De Beta'])
  })

  test('un criterio activo se sigue viendo al pasar el ratón', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps, { data: FILTER_DATA() })
    await app.ribbonTab('view').click()
    await app.ribbonCmd('view', 'pane.filter').click()
    const chip = filterPane(page).locator('.filter-resource[data-resource="Ana"]')
    await chip.click()
    await chip.hover()
    // El fondo es el color del marcador (texto blanco), no el gris claro del hover
    await expect.poll(() => chip.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(29, 79, 138)')
  })

  test('marcadores de texto, recursos y "alguno / todos los criterios"', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps, { data: FILTER_DATA() })
    await app.ribbonTab('view').click()
    await app.ribbonCmd('view', 'pane.filter').click()
    await filterPane(page).locator('.filter-tag[data-tag="Urgente"]').click()
    await expect.poll(() => dimmed(page)).toEqual(['Alfa', 'Alfa uno', 'Gamma'])

    await filterPane(page).locator('.filter-resource[data-resource="Juan"]').click()
    // Todos los criterios: ningún tema es Urgente y de Juan a la vez (el central sigue visible)
    await expect.poll(() => dimmed(page)).toEqual(['Alfa', 'Alfa uno', 'Beta', 'Gamma'])
    await expect(page.locator('.filter-status')).toContainText('Filtro: 0 de 5 temas')
    await filterPane(page).locator('[name="filterMode"]').selectOption('any')
    await expect.poll(() => dimmed(page)).toEqual(['Alfa', 'Alfa uno'])
  })

  test('estado de la tarea (vencidas) y texto', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps, { data: FILTER_DATA() })
    await app.ribbonTab('view').click()
    await app.ribbonCmd('view', 'pane.filter').click()
    await filterPane(page).locator('[name="filterStatus"]').selectOption('overdue')
    await expect.poll(() => dimmed(page)).toEqual(['Beta', 'Gamma'])
    await filterPane(page).locator('[name="filterStatus"]').selectOption('')
    await filterPane(page).locator('[name="filterText"]').fill('gam')
    await expect.poll(() => dimmed(page)).toEqual(['Alfa', 'Alfa uno', 'Beta'])
  })

  test('el filtro se mantiene al editar el mapa y se quita al cambiar de mapa', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps, { data: FILTER_DATA() })
    const other = await maps.create({ data: SAMPLE_TREE })
    await app.ribbonTab('view').click()
    await app.ribbonCmd('view', 'pane.filter').click()
    await filterPane(page).locator('.filter-icon[data-icon="priority_1"]').click()
    await expect.poll(() => dimmed(page)).toEqual(['Alfa uno', 'Beta', 'Gamma'])

    // Un tema nuevo no cumple: aparece atenuado
    await app.selectNode('Gamma')
    await page.keyboard.press('Tab')
    await app.typeNewTopic('Nuevo')
    await expect.poll(() => dimmed(page)).toEqual(['Alfa uno', 'Beta', 'Gamma', 'Nuevo'])

    // El otro mapa se creó después de cargar la lista
    await page.evaluate(() => window.Alpine.$data(document.body).loadMapList())
    await app.openMapByTitle(other.title)
    await expect.poll(() => dimmed(page)).toEqual([])
    await expect(page.locator('.filter-status')).toBeHidden()
  })
})
