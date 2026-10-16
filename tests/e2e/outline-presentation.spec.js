// Fase 14 · Vista: Esquema (el mapa como lista con sangría), Subir/Bajar de nivel y Presentación
const { test, expect, setupMap, SAMPLE_TREE } = require('./fixtures')

const outline = page => page.locator('.outline')
const rows = page => page.locator('.outline .outline-row')
const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const row = (page, text) => rows(page).filter({ has: page.locator('.outline-text', { hasText: new RegExp(`^${escapeRegExp(text)}$`) }) })

// Filas del esquema como "nivel:texto"
const outlineLines = page => rows(page).evaluateAll(els => els.map(el =>
  `${el.getAttribute('aria-level')}:${(el.querySelector('.outline-text') || {}).textContent || ''}`))

const selectedTexts = page => page.evaluate(() => window.Alpine.$data(document.body).activeNodeList
  .map(n => n.getData('text').replace(/<[^>]+>/g, '').trim()).sort())

const appState = (page, key) => page.evaluate(k => window.Alpine.$data(document.body)[k], key)

async function openOutline(app, page) {
  await app.clickRibbon('view', 'view.outline')
  await expect(outline(page)).toBeVisible()
  await expect(outline(page)).toBeFocused()
}

async function clickRow(page, text, modifiers) {
  await row(page, text).locator('.outline-text').click({ modifiers })
}

test.describe('Vista Esquema', () => {
  test('muestra el mapa como lista con sangría y vuelve al mapa', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await expect(app.ribbonCmd('view', 'view.map')).toHaveClass(/pressed/)
    await openOutline(app, page)
    expect(await outlineLines(page)).toEqual(['1:Raíz', '2:Alfa', '3:Alfa uno', '2:Beta', '2:Gamma'])
    await expect(app.ribbonCmd('view', 'view.outline')).toHaveClass(/pressed/)
    await expect(app.status('view.outline')).toHaveAttribute('aria-pressed', 'true')
    // Lo que se hace con el ratón sobre el lienzo no está disponible en el esquema
    await expect(app.ribbonCmd('view', 'view.zoomIn')).toBeDisabled()
    await expect(app.ribbonCmd('view', 'view.fit')).toBeDisabled()
    await expect(page.locator('.zoom-control')).toBeHidden()
    // El lienzo sigue debajo con su tamaño (no se destruye)
    await app.expectSvgFitsContainer()

    await app.status('view.map').click()
    await expect(outline(page)).toBeHidden()
    await expect(page.locator('.zoom-control')).toBeVisible()
    await expect(app.ribbonCmd('view', 'view.zoomIn')).toBeEnabled()
  })

  test('clic, Ctrl+clic y Mayús+clic seleccionan temas del mapa', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await openOutline(app, page)
    await clickRow(page, 'Alfa')
    await expect.poll(() => selectedTexts(page)).toEqual(['Alfa'])
    await expect(row(page, 'Alfa')).toHaveAttribute('aria-selected', 'true')
    await clickRow(page, 'Gamma', ['Control'])
    await expect.poll(() => selectedTexts(page)).toEqual(['Alfa', 'Gamma'])
    await clickRow(page, 'Alfa', ['Control'])
    await expect.poll(() => selectedTexts(page)).toEqual(['Gamma'])
    await clickRow(page, 'Alfa uno', ['Shift'])
    await expect.poll(() => selectedTexts(page)).toEqual(['Alfa uno', 'Beta', 'Gamma'])
    // La selección es la del mapa: al volver, siguen seleccionados
    await app.status('view.map').click()
    await expect.poll(() => page.locator('#mindMapContainer .smm-node.active').count()).toBe(3)
  })

  test('teclado: flechas para moverse, desplegar y contraer (también en el mapa)', async ({ page, maps }) => {
    const { app, map } = await setupMap(page, maps)
    await openOutline(app, page)
    // Sin selección, ↓ empieza por el tema central
    await page.keyboard.press('ArrowDown')
    await expect.poll(() => selectedTexts(page)).toEqual(['Raíz'])
    await page.keyboard.press('ArrowDown')
    await expect.poll(() => selectedTexts(page)).toEqual(['Alfa'])
    await page.keyboard.press('End')
    await expect.poll(() => selectedTexts(page)).toEqual(['Gamma'])
    await page.keyboard.press('ArrowUp')
    await expect.poll(() => selectedTexts(page)).toEqual(['Beta'])
    await page.keyboard.press('Home')
    await expect.poll(() => selectedTexts(page)).toEqual(['Raíz'])

    // ← contrae la rama de Alfa: desaparece Alfa uno del esquema y del mapa
    await clickRow(page, 'Alfa')
    await page.keyboard.press('ArrowLeft')
    await expect.poll(() => outlineLines(page)).toEqual(['1:Raíz', '2:Alfa', '2:Beta', '2:Gamma'])
    await expect(row(page, 'Alfa')).toHaveAttribute('aria-expanded', 'false')
    expect(await app.nodeData('Alfa', 'expand')).toBe(false)
    // Otra vez ←: al tema padre
    await page.keyboard.press('ArrowLeft')
    await expect.poll(() => selectedTexts(page)).toEqual(['Raíz'])
    // → despliega, y → otra vez entra en el primer subtema
    await clickRow(page, 'Alfa')
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => outlineLines(page)).toEqual(['1:Raíz', '2:Alfa', '3:Alfa uno', '2:Beta', '2:Gamma'])
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => selectedTexts(page)).toEqual(['Alfa uno'])
    // El botón ▸/▾ de la fila hace lo mismo y se guarda
    await row(page, 'Alfa').locator('button.outline-toggle').click()
    await expect.poll(async () => (await maps.get(map.id)).data.root.children[0].data.expand).toBe(false)
  })

  test('Enter, Tab y Mayús+Enter insertan temas y se escriben en la fila (no en el lienzo)', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await openOutline(app, page)
    await clickRow(page, 'Beta')
    await page.keyboard.press('Enter')
    const edit = page.locator('.outline .outline-edit')
    await expect(edit).toBeFocused()
    await expect(app.editBox).toBeHidden()
    await page.keyboard.type('Delta')
    await page.keyboard.press('Enter')
    await expect(edit).toHaveCount(0)
    await expect(outline(page)).toBeFocused()
    await expect.poll(async () => (await app.tree()).c.map(c => c.t)).toEqual(['Alfa', 'Beta', 'Delta', 'Gamma'])

    // Tab: subtema del seleccionado (Delta)
    await page.keyboard.press('Tab')
    await expect(edit).toBeFocused()
    await page.keyboard.type('Delta uno')
    await page.keyboard.press('Enter')
    await expect.poll(async () => (await app.tree()).c[2].c.map(c => c.t)).toEqual(['Delta uno'])

    // Mayús+Enter: tema antes
    await clickRow(page, 'Alfa')
    await page.keyboard.press('Shift+Enter')
    await expect(edit).toBeFocused()
    await page.keyboard.type('Primero')
    await page.keyboard.press('Enter')
    await expect.poll(async () => (await app.tree()).c.map(c => c.t)).toEqual(['Primero', 'Alfa', 'Beta', 'Delta', 'Gamma'])

    // Enter en el tema central: subtema (no tiene hermanos)
    await clickRow(page, 'Raíz')
    await page.keyboard.press('Enter')
    await expect(edit).toBeFocused()
    await page.keyboard.press('Escape')
    await expect.poll(async () => (await app.tree()).c.map(c => c.t)).toEqual(['Primero', 'Alfa', 'Beta', 'Delta', 'Gamma', 'Tema principal'])
    // Los botones de la cinta también editan en la fila
    await clickRow(page, 'Gamma')
    await app.clickRibbon('home', 'topic.insertChild')
    await expect(edit).toBeFocused()
    await page.keyboard.type('Hijo de Gamma')
    await page.keyboard.press('Enter')
    await expect.poll(async () => (await app.tree()).c[4].c.map(c => c.t)).toEqual(['Hijo de Gamma'])
    await expect(app.editBox).toBeHidden()
  })

  test('F2 y doble clic editan el texto; Esc cancela; Supr y Ctrl+Z funcionan con el foco en el esquema', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await openOutline(app, page)
    await clickRow(page, 'Beta')
    await page.keyboard.press('F2')
    const edit = page.locator('.outline .outline-edit')
    await expect(edit).toHaveValue('Beta')
    await page.keyboard.type('Beta cambiada')
    await page.keyboard.press('Escape')
    await expect(edit).toHaveCount(0)
    expect((await app.tree()).c.map(c => c.t)).toEqual(['Alfa', 'Beta', 'Gamma'])

    await row(page, 'Gamma').locator('.outline-text').dblclick()
    await expect(edit).toHaveValue('Gamma')
    await app.recordsHistory(async () => {
      await edit.fill('Gamma nueva')
      await page.keyboard.press('Enter')
    })
    await expect.poll(async () => (await app.tree()).c.map(c => c.t)).toEqual(['Alfa', 'Beta', 'Gamma nueva'])

    // Supr (lo atiende la librería) borra el tema seleccionado
    await clickRow(page, 'Beta')
    await app.recordsHistory(() => page.keyboard.press('Delete'))
    await expect.poll(async () => (await app.tree()).c.map(c => c.t)).toEqual(['Alfa', 'Gamma nueva'])
    await expect(outline(page)).toBeFocused()
    await page.keyboard.press('Control+z')
    await expect.poll(async () => (await app.tree()).c.map(c => c.t)).toEqual(['Alfa', 'Beta', 'Gamma nueva'])
    await page.keyboard.press('Control+z')
    await expect.poll(async () => (await app.tree()).c.map(c => c.t)).toEqual(['Alfa', 'Beta', 'Gamma'])
  })

  test('[Seguridad] el texto escrito en el esquema se guarda escapado y se muestra como texto', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await openOutline(app, page)
    await clickRow(page, 'Beta')
    await page.keyboard.press('F2')
    const payload = '<img src=x onerror="window.__xss=1"><b>negrita</b>'
    await page.locator('.outline .outline-edit').fill(payload)
    await page.keyboard.press('Enter')
    await expect(row(page, payload)).toHaveCount(1)
    await app.status('view.map').click()
    await expect(app.node(payload)).toHaveCount(1)
    expect(await page.evaluate(() => window.__xss)).toBeUndefined()
    expect(await page.locator('#mindMapContainer img[src="x"], .outline img[src="x"]').count()).toBe(0)
    // Guardado como texto enriquecido escapado (o texto plano), nunca como HTML activo
    const raw = await page.evaluate(() => window.Alpine.$data(document.body).mindMap.renderer.root.children[1].getData('text'))
    expect(raw === payload || (raw.includes('&lt;img') && !raw.includes('<img'))).toBe(true)
  })

  test('el filtro atenúa filas y la búsqueda marca la coincidencia', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await openOutline(app, page)
    await app.clickRibbon('view', 'pane.filter')
    await page.locator('.filter-pane [name="filterText"]').fill('beta')
    await expect.poll(() => rows(page).evaluateAll(els => els.filter(e => e.classList.contains('dim'))
      .map(e => e.querySelector('.outline-text').textContent))).toEqual(['Alfa', 'Alfa uno', 'Gamma'])
    await app.clickRibbon('view', 'view.filter.clear')
    await expect(page.locator('.outline .outline-row.dim')).toHaveCount(0)

    await outline(page).focus()
    await page.keyboard.press('Control+f')
    await page.locator('.find-bar [name="findText"]').fill('gamma')
    await expect(row(page, 'Gamma')).toHaveClass(/search-current/)
    await expect.poll(() => selectedTexts(page)).toEqual(['Gamma'])
  })

  test('columnas de Información de tarea cuando algún tema tiene fechas o recursos', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await openOutline(app, page)
    await expect(page.locator('.outline-head span')).toHaveCount(1)
    await page.evaluate(() => {
      const mm = window.Alpine.$data(document.body).mindMap
      const beta = mm.renderer.root.children[1]
      // SET_NODE_DATA no vuelve a pintar; el panel Info. de tarea usa un comando que sí
      mm.execCommand('SET_NODE_DATA', beta, { _task: { start: '2026-03-02', due: '2026-03-09', resources: ['Ana', 'Juan'] } })
      mm.render()
    })
    await expect(page.locator('.outline-head span')).toHaveText(['Tema', 'Inicio', 'Vencimiento', 'Recursos'])
    await expect(row(page, 'Beta').locator('[data-col="start"]')).toHaveText('02/03/2026')
    await expect(row(page, 'Beta').locator('[data-col="due"]')).toHaveText('09/03/2026')
    await expect(row(page, 'Beta').locator('[data-col="resources"]')).toHaveText('Ana, Juan')
    await expect(row(page, 'Gamma').locator('[data-col="start"]')).toHaveText('')
  })

  test('cambiar de mapa conserva la vista Esquema', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    const other = await maps.create({ data: { ...SAMPLE_TREE, root: { data: { text: 'Otro' }, children: [{ data: { text: 'Uno' }, children: [] }] } } })
    await openOutline(app, page)
    await app.goto()
    await app.openMapByTitle(other.title)
    // Tras recargar se vuelve a la vista Mapa (la vista no se guarda en el mapa)
    await expect(outline(page)).toBeHidden()
    await openOutline(app, page)
    await app.showMapsPane()
    await page.locator('.map-list li', { hasText: other.title }).click()
    await expect.poll(() => outlineLines(page)).toEqual(['1:Otro', '2:Uno'])
  })
})

test.describe('Subir y bajar de nivel', () => {
  test('Alt+Mayús+→ baja un tema bajo su hermano anterior y Alt+Mayús+← lo sube (un paso de historial)', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await openOutline(app, page)
    await clickRow(page, 'Alfa')
    // El primero de sus hermanos no puede bajar; un tema principal no puede subir
    await expect(app.ribbonCmd('home', 'topic.demote')).toBeDisabled()
    await expect(app.ribbonCmd('home', 'topic.promote')).toBeDisabled()

    await clickRow(page, 'Beta')
    await app.recordsHistory(() => page.keyboard.press('Alt+Shift+ArrowRight'))
    await expect.poll(() => outlineLines(page)).toEqual(['1:Raíz', '2:Alfa', '3:Alfa uno', '3:Beta', '2:Gamma'])
    await expect.poll(() => selectedTexts(page)).toEqual(['Beta'])

    await app.recordsHistory(() => page.keyboard.press('Alt+Shift+ArrowLeft'))
    await expect.poll(() => outlineLines(page)).toEqual(['1:Raíz', '2:Alfa', '3:Alfa uno', '2:Beta', '2:Gamma'])

    await page.keyboard.press('Control+z')
    await expect.poll(() => outlineLines(page)).toEqual(['1:Raíz', '2:Alfa', '3:Alfa uno', '3:Beta', '2:Gamma'])
  })

  test('varios temas bajan juntos y en orden; también desde la cinta en la vista Mapa', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNodes('Beta', 'Gamma')
    await app.clickRibbon('home', 'topic.demote')
    await expect.poll(async () => (await app.tree()).c.map(c => c.t)).toEqual(['Alfa'])
    expect((await app.tree()).c[0].c.map(c => c.t)).toEqual(['Alfa uno', 'Beta', 'Gamma'])

    await app.clickRibbon('home', 'topic.promote')
    await expect.poll(async () => (await app.tree()).c.map(c => c.t)).toEqual(['Alfa', 'Beta', 'Gamma'])
    expect((await app.tree()).c[0].c.map(c => c.t)).toEqual(['Alfa uno'])
  })

  test('un tema baja con toda su rama y conserva sus datos', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.setNodeStyle('Alfa', 'color', '#c00000')
    await app.selectNode('Alfa')
    await app.chooseFromMenu('home', 'topic.insertSibling', 'topic.insertBefore')
    await app.typeNewTopic('Cero')
    await app.selectNodes('Alfa', 'Alfa uno')
    // Alfa uno va dentro de Alfa (también seleccionado): baja con su padre, no por su cuenta
    await app.clickRibbon('home', 'topic.demote')
    await expect.poll(async () => (await app.tree()).c.map(c => c.t)).toEqual(['Cero', 'Beta', 'Gamma'])
    expect((await app.tree()).c[0].c).toEqual([{ t: 'Alfa', c: [{ t: 'Alfa uno', c: [] }] }])
    expect(await app.nodeData('Alfa', 'color')).toBe('#c00000')
  })
})

test.describe('Presentación', () => {
  const presenting = page => appState(page, 'presenting')

  test('recorre el mapa tema a tema a toda la ventana y al salir lo deja como estaba', async ({ page, maps }) => {
    const { app, map } = await setupMap(page, maps)
    const historyBefore = await app.historyIndex()
    const viewBefore = await page.evaluate(() => JSON.stringify(window.Alpine.$data(document.body).mindMap.view.getTransformData()))
    await app.clickRibbon('view', 'view.presentation')
    const bar = page.locator('.presentation-bar')
    await expect(bar).toBeVisible()
    await expect(bar.locator('.presentation-count')).toHaveText('1 / 6')
    await expect(page.locator('body')).toHaveClass(/presenting/)
    // El lienzo ocupa toda la ventana (con pantalla completa real la ventana puede cambiar de tamaño)
    await expect.poll(() => page.evaluate(() => {
      const r = document.querySelector('.canvas-wrap').getBoundingClientRect()
      return [r.x, r.y, r.width - window.innerWidth, r.height - window.innerHeight].map(Math.round)
    })).toEqual([0, 0, 0, 0])
    // Empieza con las ramas contraídas: el tema central y los principales
    await expect.poll(() => app.nodeCount()).toBe(4)
    await expect(bar.locator('[data-action="present-prev"]')).toBeDisabled()

    // → y AvPág avanzan; ← retrocede; Fin va al último; Inicio al primero.
    // Pasos: Raíz, sus temas principales, Alfa, Alfa uno, Beta, Gamma
    await page.keyboard.press('ArrowRight')
    await expect(bar.locator('.presentation-count')).toHaveText('2 / 6')
    await page.keyboard.press('PageDown')
    await expect(bar.locator('.presentation-count')).toHaveText('3 / 6')
    await page.keyboard.press('Space')
    await expect(bar.locator('.presentation-count')).toHaveText('4 / 6')
    // Para enseñar Alfa uno despliega su rama
    await expect.poll(() => app.nodeCount()).toBe(5)
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await expect(bar.locator('.presentation-count')).toHaveText('2 / 6')
    await page.keyboard.press('End')
    await expect(bar.locator('.presentation-count')).toHaveText('6 / 6')
    await expect(bar.locator('[data-action="present-next"]')).toBeDisabled()
    await bar.locator('[data-action="present-prev"]').click()
    await expect(bar.locator('.presentation-count')).toHaveText('5 / 6')
    await page.keyboard.press('Home')
    await expect(bar.locator('.presentation-count')).toHaveText('1 / 6')

    // Los atajos de edición no hacen nada durante la presentación
    await page.keyboard.press('Delete')
    await page.keyboard.press('Control+f')
    await expect(page.locator('.find-bar')).toBeHidden()

    await page.keyboard.press('Escape')
    await expect(bar).toBeHidden()
    await expect.poll(() => presenting(page)).toBe(null)
    await expect(page.locator('body')).not.toHaveClass(/presenting/)
    // Todo como antes: temas desplegados, encuadre, historial y lo guardado
    await expect.poll(() => app.nodeCount()).toBe(5)
    await app.expectSvgFitsContainer()
    expect(await page.evaluate(() => JSON.stringify(window.Alpine.$data(document.body).mindMap.view.getTransformData()))).toBe(viewBefore)
    expect(await app.historyIndex()).toBe(historyBefore)
    await page.waitForTimeout(1200)
    const saved = (await maps.get(map.id)).data.root
    expect(saved.children.map(c => c.data.expand)).not.toContain(false)
    expect(saved.children.map(c => c.data.text.replace(/<[^>]+>/g, ''))).toEqual(['Alfa', 'Beta', 'Gamma'])
  })

  test('un autoguardado pendiente no guarda el mapa contraído de la presentación; se guarda al salir', async ({ page, maps }) => {
    const { app, map } = await setupMap(page, maps)
    const expandsOf = async () => (await maps.get(map.id)).data.root.children.map(c => c.data.expand)
    // Cambio con el autoguardado aún pendiente (800 ms) y presentación en seguida
    await app.setNodeStyle('Beta', 'color', '#c00000')
    await app.clickRibbon('view', 'view.presentation')
    await expect(page.locator('.presentation-count')).toHaveText('1 / 6')
    await page.waitForTimeout(1500)
    expect(await expandsOf()).not.toContain(false)
    await page.keyboard.press('Escape')
    await expect(page.locator('.presentation-bar')).toBeHidden()
    // Al salir se guarda el cambio, con las ramas como estaban
    await expect.poll(async () => (await maps.get(map.id)).data.root.children[1].data.color).toBe('#c00000')
    expect(await expandsOf()).not.toContain(false)
  })

  test('el botón Salir termina la presentación y se vuelve a la vista Esquema', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await openOutline(app, page)
    await app.clickRibbon('view', 'view.presentation')
    const bar = page.locator('.presentation-bar')
    await expect(bar.locator('.presentation-count')).toHaveText('1 / 6')
    await expect(outline(page)).toBeHidden()
    await bar.locator('[data-action="present-next"]').click()
    await expect(bar.locator('.presentation-count')).toHaveText('2 / 6')
    await bar.locator('[data-action="present-exit"]').click()
    await expect(bar).toBeHidden()
    await expect(outline(page)).toBeVisible()
    expect(await outlineLines(page)).toEqual(['1:Raíz', '2:Alfa', '3:Alfa uno', '2:Beta', '2:Gamma'])
    // Después se sigue editando con normalidad
    await clickRow(page, 'Gamma')
    await page.keyboard.press('Delete')
    await expect.poll(async () => (await app.tree()).c.map(c => c.t)).toEqual(['Alfa', 'Beta'])
  })
})
