// Fase 23 · Vista: mostrar hasta un nivel, enfoque en un tema, buscar en marcadores y
// filtros guardados con nombre
const { test, expect, setupMap } = require('./fixtures')

const cmd = (app, id) => app.ribbonCmd('view', id)

// Raíz › A (A1, A2 › A2a), B (B1), C
const DEEP_TREE = {
  layout: 'logicalStructure',
  root: {
    data: { text: 'Raíz' },
    children: [
      { data: { text: 'A', tag: ['Urgente'] }, children: [{ data: { text: 'A1' }, children: [] }, { data: { text: 'A2' }, children: [{ data: { text: 'A2a' }, children: [] }] }] },
      { data: { text: 'B', icon: ['flag_red'] }, children: [{ data: { text: 'B1' }, children: [] }] },
      { data: { text: 'C' }, children: [] }
    ]
  },
  theme: { template: 'mindmanager', config: {} },
  view: {}
}
const visibleTexts = async app => (await app.nodeTexts()).map(t => t.trim()).sort()

test.describe('Mostrar nivel', () => {
  test('nivel 1 deja solo los temas principales; nivel 2 uno más; "Todos" despliega todo; se deshace', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps, { data: DEEP_TREE })
    await expect.poll(() => visibleTexts(app)).toEqual(['A', 'A1', 'A2', 'A2a', 'B', 'B1', 'C', 'Raíz'])
    await app.recordsHistory(() => app.chooseFromMenu('view', 'view.showLevels', 'view.level.1'))
    await expect.poll(() => visibleTexts(app)).toEqual(['A', 'B', 'C', 'Raíz'])
    await app.chooseFromMenu('view', 'view.showLevels', 'view.level.2')
    await expect.poll(() => visibleTexts(app)).toEqual(['A', 'A1', 'A2', 'B', 'B1', 'C', 'Raíz'])
    await app.chooseFromMenu('view', 'view.showLevels', 'view.level.all')
    await expect.poll(() => visibleTexts(app)).toEqual(['A', 'A1', 'A2', 'A2a', 'B', 'B1', 'C', 'Raíz'])
    await app.qat('edit.undo').click()
    await expect.poll(() => visibleTexts(app)).toEqual(['A', 'A1', 'A2', 'B', 'B1', 'C', 'Raíz'])
  })
})

test.describe('Enfoque en el tema', () => {
  test('contrae las demás ramas, despliega la del tema y lo deja seleccionado', async ({ page, maps }) => {
    const data = JSON.parse(JSON.stringify(DEEP_TREE))
    data.root.children[0].children[1].data.expand = false // A2 contraído
    const { app } = await setupMap(page, maps, { data })
    await app.selectNode('A')
    await expect(cmd(app, 'view.focus')).toBeEnabled()
    await app.recordsHistory(() => app.clickRibbon('view', 'view.focus'))
    await expect.poll(() => visibleTexts(app)).toEqual(['A', 'A1', 'A2', 'A2a', 'B', 'C', 'Raíz'])
    await expect.poll(() => page.evaluate(() => {
      const list = window.Alpine.$data(document.body).activeNodeList
      return list.length === 1 ? list[0].getData('text').replace(/<[^>]+>/g, '') : null
    })).toBe('A')
    await app.qat('edit.undo').click()
    await expect.poll(() => visibleTexts(app)).toEqual(['A', 'A1', 'A2', 'B', 'B1', 'C', 'Raíz'])
  })

  test('sin tema seleccionado está deshabilitado', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps, { data: DEEP_TREE })
    await app.ribbonTab('view').click()
    await expect(cmd(app, 'view.focus')).toBeDisabled()
  })
})

test.describe('Buscar en marcadores', () => {
  test('con "Marcadores" la búsqueda encuentra marcadores de texto y nombres de iconos', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps, { data: DEEP_TREE })
    await page.keyboard.press('ControlOrMeta+f')
    const input = page.locator('.find-bar [name="findText"]')
    await input.fill('urgente')
    await expect(page.locator('.find-status')).toHaveText('Sin resultados')
    await page.locator('.find-bar [data-action="include-markers"]').click()
    await expect(page.locator('.find-bar [data-action="include-markers"]')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.find-status')).toHaveText('1 de 1')
    await input.fill('bandera roja')
    await expect(page.locator('.find-status')).toHaveText('1 de 1')
    await expect(page.locator('#mindMapContainer .smm-search-current')).toContainText('B')
  })
})

test.describe('Filtros guardados', () => {
  test('guardar, aplicar, sustituir y borrar un filtro con nombre; viaja con el mapa', async ({ page, maps }) => {
    const { app, map } = await setupMap(page, maps, { data: DEEP_TREE })
    await app.clickRibbon('view', 'pane.filter')
    const pane = page.locator('.filter-pane')
    await expect(pane).toBeVisible()
    await expect(pane.locator('[data-action="save-filter"]')).toBeDisabled()
    await pane.locator('.filter-tag[data-tag="Urgente"]').click()
    await pane.locator('[name="filterName"]').fill('Lo urgente')
    await app.recordsHistory(() => pane.locator('[data-action="save-filter"]').click())
    await expect(pane.locator('.saved-filter')).toHaveText(['Lo urgente'])

    await pane.locator('[data-action="clear-filter"]').click()
    await expect(page.locator('#mindMapContainer .smm-filter-dim')).toHaveCount(0)
    await pane.locator('.saved-filter', { hasText: 'Lo urgente' }).click()
    // Cumple A (y se ve la raíz): se atenúan A1, A2, A2a, B, B1 y C
    await expect.poll(() => page.locator('#mindMapContainer .smm-node.smm-filter-dim').count()).toBe(6)
    expect(await page.evaluate(() => window.Alpine.$data(document.body).filter.tags)).toEqual(['Urgente'])

    // Mismo nombre: se sustituye
    await pane.locator('[name="filterMode"]').selectOption('any')
    await pane.locator('.filter-icon[data-icon="flag_red"]').click()
    await pane.locator('[name="filterName"]').fill('lo URGENTE')
    await pane.locator('[data-action="save-filter"]').click()
    await expect(pane.locator('.saved-filter')).toHaveText(['lo URGENTE'])

    await expect.poll(async () => ((await maps.get(map.id)).data.root.data._savedFilters || []).map(f => f.name)).toEqual(['lo URGENTE'])
    await page.reload()
    await app.openMapByTitle(map.title)
    await app.clickRibbon('view', 'pane.filter')
    await expect(page.locator('.filter-pane .saved-filter')).toHaveText(['lo URGENTE'])
    await page.locator('.filter-pane [data-action="delete-saved-filter"]').first().click()
    await expect(page.locator('.filter-pane .saved-filter')).toHaveCount(0)
  })

  test('[Seguridad] filtros guardados malformados se descartan y los nombres se muestran como texto', async ({ page, maps }) => {
    const data = JSON.parse(JSON.stringify(DEEP_TREE))
    data.root.data._savedFilters = [
      { name: '<img src=x onerror="window.__xss=1">', filter: { tags: ['Urgente'] } },
      { name: 'Vacío', filter: {} },
      { name: 5, filter: { tags: ['x'] } },
      'basura',
      { name: 'Iconos raros', filter: { icons: ['<b>'], mode: 'nope', status: 'x' } }
    ]
    const { app } = await setupMap(page, maps, { data })
    await app.clickRibbon('view', 'pane.filter')
    await expect(page.locator('.filter-pane .saved-filter')).toHaveText(['<img src=x onerror="window.__xss=1">'])
    // También los datos del mapa quedan limpios al abrirlo (es lo que se guarda y se exporta)
    expect((await app.nodeData('Raíz', '_savedFilters')).map(f => f.name)).toEqual(['<img src=x onerror="window.__xss=1">'])
    await page.waitForTimeout(200)
    expect(await page.evaluate(() => window.__xss)).toBeUndefined()
  })
})
