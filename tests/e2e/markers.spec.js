// Fase 5 · Marcadores: iconos (panel y desplegable de la cinta) y marcadores de texto con
// categorías (diálogo, panel, desplegable, renombrar/recolorear/borrar en todo el mapa)
const { test, expect, setupMap, SAMPLE_TREE } = require('./fixtures')

const cmd = (app, id) => app.ribbonCmd('home', id)
const iconsOf = async (app, text) => (await app.nodeData(text, 'icon')) || []
const tagsOf = async (app, text) => ((await app.nodeData(text, 'tag')) || []).map(t => typeof t === 'string' ? t : t.text)
const tagColorsOf = async (app, text) => ((await app.nodeData(text, 'tag')) || []).map(t => t.style && t.style.fill)
const defsOf = page => page.evaluate(() => window.Alpine.$data(document.body).mindMap.renderer.root.getData('_textMarkers') || [])
const dialog = page => page.locator('#appDialog')
const paneChip = (page, name) => page.locator(`.task-pane .tag-chip[data-tag="${name}"]`)

async function openDropdown(app, owner) {
  await app.ribbonTab('home').click()
  await app.ribbonPanel('home').locator(`[data-menu-for="${owner}"]`).click()
  await expect(app.menu).toBeVisible()
}

// Crea una categoría desde el panel con los marcadores dados
async function createCategory(page, app, name, markers, color) {
  if (!(await page.locator('.task-pane .text-markers').isVisible())) await app.strip('pane.markers').click()
  await page.locator('[data-action="new-category"]').click()
  await expect(dialog(page)).toBeVisible()
  await dialog(page).locator('[name="categoryName"]').fill(name)
  if (color) await dialog(page).locator(`.category-colors [data-color="${color}"]`).click()
  for (let i = 0; i < markers.length; i++) {
    if (i > 0) await dialog(page).locator('[data-action="add-marker"]').click()
    await dialog(page).locator(`[name="marker-${i}"]`).fill(markers[i])
  }
  await dialog(page).locator('button[type="submit"]').click()
  await expect(dialog(page)).toBeHidden()
}

test.describe('Marcadores de icono', () => {
  test('el comando Marcadores de icono abre el panel', async ({ openMap, page }) => {
    const { app } = openMap
    await cmd(app, 'markers.icons').click()
    await expect(page.locator('.task-pane-header')).toHaveText(/Marcadores/)
    await expect(page.locator('.task-pane .icon-btn').first()).toBeVisible()
  })

  test('asignar y quitar un marcador desde el panel', async ({ openMap, page }) => {
    const { app } = openMap
    await app.strip('pane.markers').click()
    const firstIcon = page.locator('.task-pane .icon-btn').first()
    await expect(firstIcon).toBeDisabled()

    await app.selectRoot()
    await expect(firstIcon).toBeEnabled()
    const iconId = await firstIcon.getAttribute('data-icon')
    const rootHasIcon = () => page.evaluate(id => {
      const node = window.Alpine.$data(document.body).activeNodeList[0]
      return (node.getData('icon') || []).includes(id)
    }, iconId)

    await firstIcon.click()
    await expect.poll(rootHasIcon).toBe(true)
    await expect(firstIcon).toHaveClass(/active/)
    await expect(firstIcon).toHaveAttribute('aria-pressed', 'true')
    await firstIcon.click()
    await expect.poll(rootHasIcon).toBe(false)
  })

  test('el desplegable de la cinta asigna iconos y marca el actual', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNode('Beta')
    await openDropdown(app, 'markers.icons')
    await app.menu.locator('[data-icon="priority_1"]').click()
    await expect(app.menu).toBeHidden()
    await expect.poll(() => iconsOf(app, 'Beta')).toEqual(['priority_1'])

    await openDropdown(app, 'markers.icons')
    await expect(app.menu.locator('[data-icon="priority_1"]')).toHaveAttribute('aria-checked', 'true')
    await expect(app.menu.locator('[data-icon="priority_2"]')).toHaveAttribute('aria-checked', 'false')
    await expect(app.menu.locator('[data-cmd="markers.icons.clear"]')).toBeEnabled()
  })

  test('prioridad y progreso son excluyentes; grupos distintos se combinan', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNode('Gamma')
    await openDropdown(app, 'markers.icons')
    await app.menu.locator('[data-icon="priority_1"]').click()
    await openDropdown(app, 'markers.icons')
    await app.menu.locator('[data-icon="progress_3"]').click()
    await openDropdown(app, 'markers.icons')
    await app.menu.locator('[data-icon="priority_2"]').click()
    await expect.poll(() => iconsOf(app, 'Gamma')).toEqual(['progress_3', 'priority_2'])
  })

  test('con varios temas: el primero decide, y es una sola entrada de historial', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNodes('Alfa', 'Beta')
    await app.recordsHistory(async () => {
      await openDropdown(app, 'markers.icons')
      await app.menu.locator('[data-icon="priority_3"]').click()
    })
    await expect.poll(() => iconsOf(app, 'Alfa')).toEqual(['priority_3'])
    expect(await iconsOf(app, 'Beta')).toEqual(['priority_3'])

    await app.qat('edit.undo').click()
    await expect.poll(() => iconsOf(app, 'Alfa')).toEqual([])
    expect(await iconsOf(app, 'Beta')).toEqual([])
  })

  test('"Quitar todos los iconos" solo se habilita si hay iconos y los quita', async ({ page, maps }) => {
    const data = JSON.parse(JSON.stringify(SAMPLE_TREE))
    data.root.children[1].data.icon = ['priority_1', 'sign_1']
    const { app } = await setupMap(page, maps, { data })
    await app.selectNode('Gamma')
    await openDropdown(app, 'markers.icons')
    await expect(app.menu.locator('[data-cmd="markers.icons.clear"]')).toBeDisabled()
    await page.keyboard.press('Escape')

    await app.selectNodes('Gamma', 'Beta')
    await app.chooseFromMenu('home', 'markers.icons', 'markers.icons.clear')
    await expect.poll(() => iconsOf(app, 'Beta')).toEqual([])
  })
})

test.describe('Biblioteca de iconos', () => {
  test('los grupos nuevos aparecen con nombres en español y se pintan en el tema', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.strip('pane.markers').click()
    const groups = await page.locator('.task-pane details.icon-category > summary').allTextContents()
    expect(groups).toEqual(['Prioridad', 'Progreso', 'Banderas', 'Semáforo', 'Caras', 'Flechas', 'Símbolos', 'Personas', 'Emojis clásicos', 'Símbolos clásicos'])
    await expect(page.locator('.task-pane [data-icon="flag_red"]')).toHaveAttribute('title', 'Bandera roja')
    await expect(page.locator('.task-pane [data-icon="progress_8"]')).toHaveAttribute('title', 'Completado')

    await app.selectNode('Beta')
    await page.locator('.task-pane [data-icon="symbol_idea"]').click()
    await expect.poll(() => iconsOf(app, 'Beta')).toEqual(['symbol_idea'])
    // La librería resuelve el icono propio y lo pinta como SVG dentro del tema
    await expect.poll(() => app.node('Beta').locator('svg').count()).toBeGreaterThan(0)
  })

  test('banderas, semáforo y caras son excluyentes; flechas y símbolos se combinan', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.strip('pane.markers').click()
    await app.selectNode('Gamma')
    for (const id of ['flag_red', 'flag_green', 'traffic_red', 'traffic_green', 'face_happy', 'face_sad', 'arrow_up', 'arrow_down', 'symbol_star', 'symbol_heart']) {
      await page.locator(`.task-pane [data-icon="${id}"]`).click()
    }
    await expect.poll(() => iconsOf(app, 'Gamma'))
      .toEqual(['flag_green', 'traffic_green', 'face_sad', 'arrow_up', 'arrow_down', 'symbol_star', 'symbol_heart'])
  })

  test('el buscador filtra por nombre sin distinguir tildes ni mayúsculas', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.strip('pane.markers').click()
    const search = page.locator('.icon-search')
    await search.fill('TELEFONO')
    await expect(page.locator('.task-pane .icon-btn')).toHaveCount(1)
    await expect(page.locator('.task-pane .icon-btn')).toHaveAttribute('data-icon', 'symbol_phone')

    await search.fill('bandera')
    await expect(page.locator('.task-pane .icon-btn')).toHaveCount(8)
    await search.fill('clásico')
    // Al buscar, los grupos clásicos se despliegan
    await expect(page.locator('.task-pane details.icon-category.classic[open]')).toHaveCount(2)
    await search.fill('zzz')
    await expect(page.locator('.task-pane .icon-btn')).toHaveCount(0)
    await expect(page.locator('.task-pane .markers .empty-hint', { hasText: 'Ningún icono' })).toBeVisible()
  })

  test('los iconos clásicos siguen funcionando, plegados en el panel y fuera del desplegable', async ({ page, maps }) => {
    const data = JSON.parse(JSON.stringify(SAMPLE_TREE))
    data.root.children[1].data.icon = ['expression_1']
    const { app } = await setupMap(page, maps, { data })
    await expect.poll(() => app.node('Beta').locator('svg').count()).toBeGreaterThan(0)
    await app.strip('pane.markers').click()
    await expect(page.locator('.task-pane details[data-group="expression"]')).not.toHaveAttribute('open')

    await app.selectNode('Beta')
    await openDropdown(app, 'markers.icons')
    await expect(app.menu.locator('[data-icon^="expression_"]')).toHaveCount(0)
    await expect(app.menu.locator('[data-icon="flag_red"]')).toBeVisible()
    await page.keyboard.press('Escape')
    // Se puede quitar desde el panel
    await page.locator('.task-pane details[data-group="expression"] > summary').click()
    await page.locator('.task-pane [data-icon="expression_1"]').click()
    await expect.poll(() => iconsOf(app, 'Beta')).toEqual([])
  })
})

test.describe('Marcadores de texto', () => {
  test('"Marcador de texto" sin categorías crea «General» y lo asigna a los seleccionados', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNodes('Beta', 'Gamma')
    await expect(cmd(app, 'markers.tags')).toBeEnabled()
    await app.recordsHistory(async () => {
      await cmd(app, 'markers.tags').click()
      await expect(dialog(page)).toBeVisible()
      await expect(dialog(page).locator('.dialog-hint')).toContainText('General')
      await dialog(page).locator('[name="markerName"]').fill('Urgente')
      await page.keyboard.press('Enter')
      await expect(dialog(page)).toBeHidden()
    })

    await expect.poll(() => tagsOf(app, 'Beta')).toEqual(['Urgente'])
    expect(await tagsOf(app, 'Gamma')).toEqual(['Urgente'])
    const defs = await defsOf(page)
    expect(defs.map(c => [c.name, c.markers.map(m => m.name)])).toEqual([['General', ['Urgente']]])
    expect(await tagColorsOf(app, 'Beta')).toEqual([defs[0].color])
    // Se pinta en el tema
    await expect(app.node('Beta').locator('text', { hasText: 'Urgente' })).toBeVisible()

    // Deshacer en un paso: quita la definición y las etiquetas
    await app.qat('edit.undo').click()
    await expect.poll(() => tagsOf(app, 'Beta')).toEqual([])
    expect(await defsOf(page)).toEqual([])
  })

  test('el diálogo valida el nombre vacío', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNode('Beta')
    await cmd(app, 'markers.tags').click()
    await dialog(page).locator('button[type="submit"]').click()
    await expect(dialog(page).locator('.dialog-error')).toHaveText(/nombre/)
    await expect(dialog(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toBeHidden()
    expect(await tagsOf(app, 'Beta')).toEqual([])
  })

  test('crear una categoría y asignar sus marcadores desde el panel y el desplegable', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await createCategory(page, app, 'Responsable', ['Ana', 'Juan'], '#7030a0')
    await expect(page.locator('.marker-category[data-category="Responsable"] .tag-chip')).toHaveText(['Ana', 'Juan'])
    await expect(paneChip(page, 'Ana')).toBeDisabled()

    await app.selectNode('Alfa')
    await paneChip(page, 'Ana').click()
    await expect.poll(() => tagsOf(app, 'Alfa')).toEqual(['Ana'])
    expect(await tagColorsOf(app, 'Alfa')).toEqual(['#7030a0'])
    await expect(paneChip(page, 'Ana')).toHaveAttribute('aria-pressed', 'true')

    await openDropdown(app, 'markers.tags')
    await expect(app.menu.locator('[data-tag="Ana"]')).toHaveAttribute('aria-checked', 'true')
    await app.menu.locator('[data-tag="Juan"]').click()
    await expect(app.menu).toBeHidden()
    await expect.poll(() => tagsOf(app, 'Alfa')).toEqual(['Ana', 'Juan'])

    // Clic otra vez en el panel: lo quita
    await paneChip(page, 'Ana').click()
    await expect.poll(() => tagsOf(app, 'Alfa')).toEqual(['Juan'])
  })

  test('un marcador existente escrito en el diálogo se asigna sin duplicar la definición', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await createCategory(page, app, 'Estado', ['Pendiente'])
    await app.selectNode('Gamma')
    await cmd(app, 'markers.tags').click()
    await dialog(page).locator('[name="markerName"]').fill('pendiente')
    await expect(dialog(page).locator('[name="categoryId"]')).toBeHidden()
    await page.keyboard.press('Enter')
    await expect.poll(() => tagsOf(app, 'Gamma')).toEqual(['Pendiente'])
    expect((await defsOf(page))[0].markers.map(m => m.name)).toEqual(['Pendiente'])
  })

  test('editar la categoría renombra y recolorea en todos los temas, también en ramas contraídas', async ({ page, maps }) => {
    const data = JSON.parse(JSON.stringify(SAMPLE_TREE))
    const defs = [{ id: 'c1', name: 'Responsable', color: '#2b6fbd', markers: [{ id: 'm1', name: 'Ana' }, { id: 'm2', name: 'Juan' }] }]
    data.root.data._textMarkers = defs
    data.root.children[0].data.expand = false
    data.root.children[0].children[0].data.tag = [{ text: 'Ana', style: { fill: '#2b6fbd' } }]
    data.root.children[1].data.tag = [{ text: 'Ana', style: { fill: '#2b6fbd' } }, { text: 'Juan', style: { fill: '#2b6fbd' } }]
    const { app, map } = await setupMap(page, maps, { data })
    await app.strip('pane.markers').click()

    await page.locator('.marker-category[data-category="Responsable"] [data-action="edit-category"]').click()
    await expect(dialog(page).locator('.dialog-title')).toHaveText('Editar categoría')
    await dialog(page).locator('[name="marker-0"]').fill('Ana María')
    await dialog(page).locator('.category-colors [data-color="#c00000"]').click()
    await app.recordsHistory(() => dialog(page).locator('button[type="submit"]').click())

    await expect.poll(() => tagsOf(app, 'Beta')).toEqual(['Ana María', 'Juan'])
    expect(await tagColorsOf(app, 'Beta')).toEqual(['#c00000', '#c00000'])
    await expect(app.node('Beta').locator('text', { hasText: 'Ana María' })).toBeVisible()
    // Tema dentro de la rama contraída (no está pintado): se comprueba en lo guardado
    await expect.poll(async () => (await maps.get(map.id)).data.root.children[0].children[0].data.tag)
      .toEqual([{ text: 'Ana María', style: { fill: '#c00000' } }])

    await app.qat('edit.undo').click()
    await expect.poll(() => tagsOf(app, 'Beta')).toEqual(['Ana', 'Juan'])
    expect((await defsOf(page))[0].color).toBe('#2b6fbd')
  })

  test('eliminar una categoría quita sus marcadores de los temas', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await createCategory(page, app, 'Fase', ['Diseño'])
    await createCategory(page, app, 'Equipo', ['Ventas'])
    await app.selectNode('Beta')
    await paneChip(page, 'Diseño').click()
    await paneChip(page, 'Ventas').click()
    await expect.poll(() => tagsOf(app, 'Beta')).toEqual(['Diseño', 'Ventas'])

    await page.locator('.marker-category[data-category="Fase"] [data-action="edit-category"]').click()
    await dialog(page).locator('.dialog-remove').click()
    await expect(dialog(page)).toBeHidden()
    await expect.poll(() => tagsOf(app, 'Beta')).toEqual(['Ventas'])
    expect((await defsOf(page)).map(c => c.name)).toEqual(['Equipo'])
    await expect(page.locator('.marker-category[data-category="Fase"]')).toHaveCount(0)
  })

  test('el diálogo de categoría valida nombres vacíos y repetidos', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await createCategory(page, app, 'Responsable', ['Ana'])

    await page.locator('[data-action="new-category"]').click()
    await dialog(page).locator('button[type="submit"]').click()
    await expect(dialog(page).locator('.dialog-error')).toHaveText(/nombre/)

    await dialog(page).locator('[name="categoryName"]').fill('responsable')
    await dialog(page).locator('button[type="submit"]').click()
    await expect(dialog(page).locator('.dialog-error')).toHaveText(/Ya existe/)

    await dialog(page).locator('[name="categoryName"]').fill('Revisor')
    await dialog(page).locator('[name="marker-0"]').fill('ANA')
    await dialog(page).locator('button[type="submit"]').click()
    await expect(dialog(page).locator('.dialog-error')).toHaveText(/repetido/)
    await page.keyboard.press('Escape')
    expect((await defsOf(page)).map(c => c.name)).toEqual(['Responsable'])
  })

  test('"Quitar marcadores de texto" los quita de los seleccionados', async ({ page, maps }) => {
    const data = JSON.parse(JSON.stringify(SAMPLE_TREE))
    data.root.children[1].data.tag = [{ text: 'A', style: { fill: '#2b6fbd' } }]
    data.root.children[2].data.tag = [{ text: 'B', style: { fill: '#2b6fbd' } }]
    const { app } = await setupMap(page, maps, { data })
    await app.selectNodes('Beta', 'Gamma')
    await app.chooseFromMenu('home', 'markers.tags', 'markers.tags.clear')
    await expect.poll(() => tagsOf(app, 'Beta')).toEqual([])
    expect(await tagsOf(app, 'Gamma')).toEqual([])
  })

  test('los marcadores de un mapa importado sin definición aparecen como «Sin categoría»', async ({ page, maps }) => {
    const data = JSON.parse(JSON.stringify(SAMPLE_TREE))
    data.root.children[1].data.tag = ['Antiguo']
    const { app } = await setupMap(page, maps, { data })
    await app.strip('pane.markers').click()
    await expect(paneChip(page, 'Antiguo')).toBeVisible()
    await app.selectNode('Beta')
    await expect(paneChip(page, 'Antiguo')).toHaveAttribute('aria-pressed', 'true')
    await paneChip(page, 'Antiguo').click()
    await expect.poll(() => tagsOf(app, 'Beta')).toEqual([])
    await expect(paneChip(page, 'Antiguo')).toHaveCount(0)
  })

  test('categorías y marcadores persisten tras recargar', async ({ page, maps }) => {
    const { app, map } = await setupMap(page, maps)
    await createCategory(page, app, 'Responsable', ['Ana'])
    await app.selectNode('Gamma')
    await paneChip(page, 'Ana').click()
    await expect.poll(async () => (await maps.get(map.id)).data.root.children[2].data.tag || []).toHaveLength(1)
    await expect.poll(async () => ((await maps.get(map.id)).data.root.data._textMarkers || []).length).toBe(1)

    await page.reload()
    await app.openMapByTitle(map.title)
    expect(await tagsOf(app, 'Gamma')).toEqual(['Ana'])
    await app.strip('pane.markers').click()
    await expect(paneChip(page, 'Ana')).toBeVisible()
  })

  test('los mapas de la Fase 5 (campo «textMarkers») se migran a «_textMarkers» al abrirlos', async ({ page, maps }) => {
    const data = JSON.parse(JSON.stringify(SAMPLE_TREE))
    data.root.data.textMarkers = [{ id: 'c1', name: 'Responsable', color: '#2b6fbd', markers: [{ id: 'm1', name: 'Ana' }] }]
    const { app, map } = await setupMap(page, maps, { data })
    expect((await defsOf(page)).map(c => c.name)).toEqual(['Responsable'])
    expect(await app.nodeData('Raíz', 'textMarkers')).toBeUndefined()
    // Se guarda ya migrado al primer cambio
    await app.selectNode('Beta')
    await app.strip('pane.markers').click()
    await paneChip(page, 'Ana').click()
    await expect.poll(async () => {
      const saved = (await maps.get(map.id)).data.root.data
      return [saved.textMarkers === undefined, (saved._textMarkers || []).length]
    }).toEqual([true, 1])
  })

  test('"Copiar formato" desde el tema central no copia las categorías de marcadores', async ({ page, maps }) => {
    const data = JSON.parse(JSON.stringify(SAMPLE_TREE))
    data.root.data._textMarkers = [{ id: 'c1', name: 'Responsable', color: '#2b6fbd', markers: [{ id: 'm1', name: 'Ana' }] }]
    const { app } = await setupMap(page, maps, { data })
    await app.selectRoot()
    await cmd(app, 'clipboard.formatPainter').click()
    await app.node('Beta').click()
    await expect.poll(() => app.isPainterActive()).toBe(false)
    expect(await app.nodeData('Beta', '_textMarkers')).toBeUndefined()
    expect(await app.nodeData('Beta', 'textMarkers')).toBeUndefined()
    expect((await defsOf(page)).length).toBe(1)
  })

  test('[Seguridad] marcadores malformados o con HTML se sanean y se muestran como texto', async ({ page, maps }) => {
    const data = JSON.parse(JSON.stringify(SAMPLE_TREE))
    const payload = '<img src=x onerror="window.__xss=1">'
    data.root.data._textMarkers = [
      { name: payload, color: 'red;}', markers: [payload, { name: 42 }, null] },
      'basura'
    ]
    data.root.children[0].data.icon = ['priority_1', { evil: true }, 7]
    data.root.children[1].data.tag = [payload, { text: { x: 1 } }, 5, { text: 'Ok', style: { fill: 'url(javascript:alert(1))' } }]
    data.root.children[2].data.tag = 'no es una lista'
    const { app } = await setupMap(page, maps, { data })

    expect((await app.state()).errorMsg).toBe('')
    expect(await iconsOf(app, 'Alfa')).toEqual(['priority_1'])
    expect(await tagsOf(app, 'Beta')).toEqual([payload, 'Ok'])
    expect(await tagColorsOf(app, 'Beta')).toEqual(['#7f7f7f', '#7f7f7f'])
    expect(await tagsOf(app, 'Gamma')).toEqual([])
    const defs = await defsOf(page)
    expect(defs).toHaveLength(1)
    expect(defs[0].color).toMatch(/^#[0-9a-f]{6}$/)
    expect(defs[0].markers.map(m => m.name)).toEqual([payload.slice(0, 40), '42'])

    await app.strip('pane.markers').click()
    await app.selectNode('Beta')
    await openDropdown(app, 'markers.tags')
    await page.waitForTimeout(200)
    await expect(app.node('Beta').locator('text', { hasText: payload })).toBeVisible()
    expect(await page.evaluate(() => window.__xss)).toBeUndefined()
  })
})
