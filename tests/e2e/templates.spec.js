// Fase 11 · Plantillas: galería "Nuevo desde plantilla" (de serie y propias), "Guardar como
// plantilla", API /api/templates y diseños de organigrama, línea de tiempo y espina de pez
const { test, expect, setupMap, SAMPLE_TREE } = require('./fixtures')

const dialog = page => page.locator('#appDialog')
const cards = page => dialog(page).locator('.template-card')
const card = (page, key) => dialog(page).locator(`.template-card[data-template="${key}"]`)

// Fecha local de hoy + n días (AAAA-MM-DD), como la calcula la app
const inDays = n => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  const pad = x => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

async function openGallery(page, app) {
  await app.showMapsPane()
  await page.locator('[data-action="open-templates"]').click()
  await expect(dialog(page).locator('.template-gallery')).toBeVisible()
}

// El mapa creado desde la galería se registra para borrarlo al terminar
async function trackCurrentMap(page, maps) {
  const id = await page.evaluate(() => window.Alpine.$data(document.body).currentId)
  maps.track(id)
  return id
}

test.describe('Galería de plantillas', () => {
  test('muestra las plantillas de serie por categorías', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await openGallery(page, app)
    await expect(cards(page)).toHaveCount(50)
    await expect(dialog(page).locator('.template-card .template-preview svg')).toHaveCount(50)
    for (const [category, count] of [['meetings', 10], ['projects', 9], ['strategy', 15], ['personal', 10], ['layouts', 6]]) {
      await dialog(page).locator(`[data-category="${category}"]`).click()
      await expect(cards(page), category).toHaveCount(count)
    }
    await dialog(page).locator('[data-category="all"]').click()
    await expect(card(page, 'builtin:project-plan').locator('.template-name')).toHaveText('Plan de proyecto')
    await expect(card(page, 'builtin:project-plan').locator('.template-preview svg')).toBeVisible()
    // Mis plantillas solo muestra las propias (otras pruebas pueden estar creando alguna en paralelo)
    await dialog(page).locator('[data-category="mine"]').click()
    await expect(dialog(page).locator('.template-card[data-template^="builtin:"]')).toHaveCount(0)
  })

  test('los botones del diálogo no tapan las tarjetas', async ({ page, maps }) => {
    await page.setViewportSize({ width: 1300, height: 760 })
    const { app } = await setupMap(page, maps)
    await openGallery(page, app)
    const grid = await dialog(page).locator('.template-grid').boundingBox()
    const actions = await dialog(page).locator('.dialog-actions').boundingBox()
    expect(actions.y, 'los botones van debajo de la lista de plantillas').toBeGreaterThanOrEqual(grid.y + grid.height - 1)
  })

  test('el mapa creado desde una plantilla se ajusta a la ventana', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await openGallery(page, app)
    await card(page, 'builtin:event-full').dblclick()
    await expect(dialog(page)).toBeHidden()
    await trackCurrentMap(page, maps)
    await expect.poll(() => page.evaluate(() => {
      const c = document.getElementById('mindMapContainer').getBoundingClientRect()
      return [...document.querySelectorAll('#mindMapContainer .smm-node')].every(n => {
        const r = n.getBoundingClientRect()
        return r.left >= c.left - 1 && r.right <= c.right + 1 && r.top >= c.top - 1 && r.bottom <= c.bottom + 1
      })
    }), { message: 'todos los temas dentro del lienzo' }).toBe(true)
  })

  test('todas las plantillas de serie son válidas según las reglas de saneado', async ({ page, maps }) => {
    await setupMap(page, maps)
    const result = await page.evaluate(() => BUILTIN_TEMPLATES.map(t => {
      const data = instantiateTemplate(t, '2030-01-01')
      const fixed = sanitizeMapTree(JSON.parse(JSON.stringify(data.root)))
      return { id: t.id, fixed, category: t.category, root: data.root.data.text }
    }))
    expect(result.filter(r => r.fixed !== 0)).toEqual([])
    expect(result.every(r => r.root)).toBe(true)
  })

  test('catálogo coherente: ids únicos, categorías existentes y ninguna categoría vacía', async ({ page, maps }) => {
    await setupMap(page, maps)
    const { ids, categories, used } = await page.evaluate(() => ({
      ids: BUILTIN_TEMPLATES.map(t => t.id),
      categories: TEMPLATE_CATEGORIES.map(c => c.id),
      used: [...new Set(BUILTIN_TEMPLATES.map(t => t.category))]
    }))
    expect(new Set(ids).size).toBe(ids.length)
    expect(used.filter(c => !categories.includes(c))).toEqual([])
    expect(categories.filter(c => !used.includes(c))).toEqual([])
  })

  test('todas las plantillas de serie se dibujan en el mapa sin errores', async ({ page, maps }) => {
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await setupMap(page, maps)
    const result = await page.evaluate(async () => {
      const mm = window.Alpine.raw(window.Alpine.$data(document.body).mindMap)
      // setFullData dispara varios renderizados (datos, diseño, tema): esperar a que acaben
      const settled = () => new Promise(resolve => {
        let timer
        const done = () => { mm.off('node_tree_render_end', onEnd); resolve() }
        const onEnd = () => { clearTimeout(timer); timer = setTimeout(done, 250) }
        mm.on('node_tree_render_end', onEnd)
      })
      const out = []
      for (const t of BUILTIN_TEMPLATES) {
        const rendered = settled()
        const { view, ...data } = instantiateTemplate(t) // view vacío: setFullData no lo admite
        mm.setFullData(data)
        await rendered
        const visible = 1 + t.root.children.length // tema central + principales (siempre visibles)
        out.push({ id: t.id, layout: mm.opt.layout, nodes: document.querySelectorAll('#mindMapContainer .smm-node').length, visible, want: t.layout || 'mindMap' })
      }
      return out
    })
    expect(result.filter(r => r.nodes < r.visible || r.layout !== r.want)).toEqual([])
    expect(errors).toEqual([])
  })

  test('crear un mapa desde "Plan de proyecto": estructura, marcadores y fechas desde hoy', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await openGallery(page, app)
    await card(page, 'builtin:project-plan').click()
    await dialog(page).locator('[data-action="create-from-template"]').click()
    await expect(dialog(page)).toBeHidden()
    await trackCurrentMap(page, maps)

    await expect(page.locator('.title-input')).toHaveValue('Plan de proyecto')
    await expect(app.node('Proyecto: [nombre]')).toBeVisible()
    expect((await app.tree()).c.map(c => c.t))
      .toEqual(['Objetivos', 'Alcance', 'Fases', 'Equipo', 'Riesgos', 'Presupuesto', 'Comunicación'])
    expect((await app.nodeData('Proyecto: [nombre]', '_textMarkers')).map(c => c.name)).toEqual(['Estado'])
    expect(await app.nodeData('Reunión de arranque', '_task')).toEqual({ due: inDays(7), milestone: true })
    expect(await app.nodeData('Entregable 1', '_task')).toEqual({ start: inDays(21), due: inDays(40) })
    expect((await app.nodeData('Acta de constitución', 'tag')).map(t => t.text)).toEqual(['Pendiente'])
    await expect(page.locator('.smm-callouts .smm-callout')).toHaveCount(1)
    // Queda guardado en el servidor
    const map = await maps.get(await page.evaluate(() => window.Alpine.$data(document.body).currentId))
    expect(map.title).toBe('Plan de proyecto')
    expect(map.data.root.children).toHaveLength(7)
  })

  test('doble clic en una tarjeta crea el mapa; la lista de tareas usa el diseño en árbol', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await openGallery(page, app)
    await dialog(page).locator('[data-category="projects"]').click()
    await card(page, 'builtin:task-list').dblclick()
    await expect(dialog(page)).toBeHidden()
    await trackCurrentMap(page, maps)
    await expect(app.node('Tarea 1')).toBeVisible()
    expect((await app.state()).layout).toBe('logicalStructure')
  })

  test('buscar plantillas: en todas las categorías y sin distinguir tildes ni mayúsculas', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await openGallery(page, app)
    const search = dialog(page).locator('[name="templateQuery"]')
    await expect(search).toBeFocused()
    await dialog(page).locator('[data-category="meetings"]').click()

    await search.fill('ANALISIS')
    await expect(card(page, 'builtin:swot')).toBeVisible()
    await expect(card(page, 'builtin:five-whys')).toBeVisible()
    const texts = await cards(page).evaluateAll(els => els.map(e => e.textContent.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()))
    expect(texts.length).toBeGreaterThan(2)
    expect(texts.every(t => t.includes('analisis'))).toBe(true)
    await expect(dialog(page).locator('.template-category[aria-pressed="true"]')).toHaveCount(0)
    // Enter en el buscador no crea ningún mapa
    await search.press('Enter')
    await expect(dialog(page)).toBeVisible()

    await search.fill('zzzz')
    await expect(cards(page)).toHaveCount(0)
    await expect(dialog(page).locator('.empty-hint')).toHaveText('Ninguna plantilla coincide con la búsqueda.')

    // Elegir una categoría vacía el buscador
    await dialog(page).locator('[data-category="personal"]').click()
    await expect(search).toHaveValue('')
    await expect(cards(page)).toHaveCount(10)
  })

  for (const [key, layout, topic] of [
    ['org-chart', 'organizationStructure', 'Dirección general'],
    ['project-timeline', 'timeline', 'Lanzamiento'],
    ['fishbone-6m', 'fishbone', 'Mano de obra']
  ]) {
    test(`la plantilla ${key} crea el mapa con el diseño ${layout}, ajustado a la ventana`, async ({ page, maps }) => {
      const { app } = await setupMap(page, maps)
      await openGallery(page, app)
      await dialog(page).locator('[data-category="layouts"]').click()
      await card(page, `builtin:${key}`).dblclick()
      await expect(dialog(page)).toBeHidden()
      const id = await trackCurrentMap(page, maps)
      await expect(app.node(topic)).toBeVisible()
      expect((await app.state()).layout).toBe(layout)
      await expect.poll(async () => (await maps.get(id)).data.layout).toBe(layout)
      await expect.poll(() => page.evaluate(() => {
        const c = document.getElementById('mindMapContainer').getBoundingClientRect()
        return [...document.querySelectorAll('#mindMapContainer .smm-node')].every(n => {
          const r = n.getBoundingClientRect()
          return r.left >= c.left - 1 && r.right <= c.right + 1 && r.top >= c.top - 1 && r.bottom <= c.bottom + 1
        })
      }), { message: 'todos los temas dentro del lienzo' }).toBe(true)
    })
  }

  test('Línea de tiempo de proyecto: fechas e hitos calculados desde hoy', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await openGallery(page, app)
    await dialog(page).locator('[name="templateQuery"]').fill('línea de tiempo')
    await card(page, 'builtin:project-timeline').dblclick()
    await expect(dialog(page)).toBeHidden()
    await trackCurrentMap(page, maps)
    expect(await app.nodeData('Análisis', '_task')).toEqual({ start: inDays(14), due: inDays(35) })
    expect(await app.nodeData('Lanzamiento', '_task')).toEqual({ due: inDays(100), milestone: true })
  })

  test('Búsqueda de empleo trae su categoría de marcadores «Candidatura»', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await openGallery(page, app)
    await dialog(page).locator('[name="templateQuery"]').fill('empleo')
    await card(page, 'builtin:job-search').dblclick()
    await expect(dialog(page)).toBeHidden()
    await trackCurrentMap(page, maps)
    const [cat] = await app.nodeData('Búsqueda de empleo', '_textMarkers')
    expect(cat.name).toBe('Candidatura')
    expect(cat.markers.map(m => m.name)).toEqual(['Enviada', 'Entrevista', 'Oferta', 'Descartada'])
    expect((await app.nodeData('Puesto en empresa 2', 'tag')).map(t => t.text)).toEqual(['Entrevista'])
  })
})

test.describe('Plantillas propias', () => {
  test('guardar un mapa como plantilla (sin fechas), crear otro desde ella y eliminarla', async ({ page, maps, request }) => {
    const data = JSON.parse(JSON.stringify(SAMPLE_TREE))
    Object.assign(data.root.children[1].data, { icon: ['flag_red'], _task: { due: '2030-01-01', resources: ['Ana'] } })
    const { app } = await setupMap(page, maps, { data })

    await app.ribbonTab('export').click()
    await app.ribbonCmd('export', 'map.saveAsTemplate').click()
    await dialog(page).locator('[name="templateTitle"]').fill('Mi proceso')
    await dialog(page).locator('[name="templateDescription"]').fill('Pasos de mi equipo')
    await dialog(page).locator('[name="stripTasks"]').check()
    await dialog(page).locator('button[type="submit"]').click()
    await expect(dialog(page)).toBeHidden()

    const saved = (await (await request.get('/api/templates')).json()).find(t => t.title === 'Mi proceso')
    expect(saved).toBeTruthy()
    expect(saved.data.root.children[1].data._task).toBeUndefined()
    expect(saved.data.root.children[1].data.icon).toEqual(['flag_red'])

    await openGallery(page, app)
    await dialog(page).locator('[data-category="mine"]').click()
    await expect(card(page, `user:${saved.id}`).locator('.template-desc')).toHaveText('Pasos de mi equipo')
    await card(page, `user:${saved.id}`).dblclick()
    await expect(dialog(page)).toBeHidden()
    await trackCurrentMap(page, maps)
    await expect(page.locator('.title-input')).toHaveValue('Mi proceso')
    expect((await app.tree()).c.map(c => c.t)).toEqual(['Alfa', 'Beta', 'Gamma'])

    // Eliminar pide un segundo clic
    await openGallery(page, app)
    await dialog(page).locator('[data-category="mine"]').click()
    const del = card(page, `user:${saved.id}`).locator('[data-action="delete-template"]')
    await del.click()
    await expect(del).toHaveText(/Pulsa otra vez/)
    await del.click()
    await expect(card(page, `user:${saved.id}`)).toHaveCount(0)
    expect((await (await request.get('/api/templates')).json()).find(t => t.id === saved.id)).toBeUndefined()
  })

  test('guardar como plantilla exige un nombre', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.ribbonTab('export').click()
    await app.ribbonCmd('export', 'map.saveAsTemplate').click()
    await dialog(page).locator('[name="templateTitle"]').fill('   ')
    await dialog(page).locator('button[type="submit"]').click()
    await expect(dialog(page).locator('.dialog-error')).toHaveText(/nombre/)
  })

  test('[Seguridad] el nombre de una plantilla se muestra como texto y su contenido se sanea', async ({ page, maps, request }) => {
    const payload = '<img src=x onerror="window.__xss=1">'
    const data = JSON.parse(JSON.stringify(SAMPLE_TREE))
    data.root.children[0].data.hyperlink = 'javascript:window.__xss=2'
    const res = await request.post('/api/templates', { data: { title: payload, description: payload, data } })
    expect(res.status()).toBe(201)
    const tpl = await res.json()
    try {
      const { app } = await setupMap(page, maps)
      await openGallery(page, app)
      await dialog(page).locator('[data-category="mine"]').click()
      await expect(card(page, `user:${tpl.id}`).locator('.template-name')).toHaveText(payload)
      await card(page, `user:${tpl.id}`).dblclick()
      await expect(dialog(page)).toBeHidden()
      await trackCurrentMap(page, maps)
      await page.waitForTimeout(200)
      expect(await page.evaluate(() => window.__xss)).toBeUndefined()
      expect(await app.nodeData('Alfa', 'hyperlink')).toBeUndefined()
    } finally {
      await request.delete(`/api/templates/${tpl.id}`)
    }
  })
})

test.describe('API de plantillas y validación', () => {
  test('POST /api/templates valida nombre y datos; DELETE de una inexistente da 404', async ({ request }) => {
    const ok = { root: { data: { text: 'R' }, children: [] } }
    expect((await request.post('/api/templates', { data: { title: '', data: ok } })).status()).toBe(400)
    expect((await request.post('/api/templates', { data: { title: 42, data: ok } })).status()).toBe(400)
    expect((await request.post('/api/templates', { data: { title: 'X', data: { root: 'no' } } })).status()).toBe(400)
    expect((await request.post('/api/templates', { data: { title: 'X', data: { root: { data: {}, children: 'x' } } } })).status()).toBe(400)
    expect((await request.delete('/api/templates/no-existe')).status()).toBe(404)
  })

  test('POST y PUT /api/maps rechazan datos con forma inválida', async ({ request, maps }) => {
    expect((await request.post('/api/maps', { data: { title: 'X', data: { root: null } } })).status()).toBe(400)
    expect((await request.post('/api/maps', { data: { title: ['x'] } })).status()).toBe(400)
    const created = await maps.create()
    expect((await request.put(`/api/maps/${created.id}`, { data: { data: { root: { children: [] } } } })).status()).toBe(400)
    expect((await request.put(`/api/maps/${created.id}`, { data: { title: { a: 1 } } })).status()).toBe(400)
    // Lo válido sigue funcionando
    const res = await request.post('/api/maps', { data: { title: '  Con datos  ', data: { root: { data: { text: 'Hola' }, children: [] } } } })
    expect(res.status()).toBe(201)
    const map = await res.json()
    maps.track(map.id)
    expect(map.title).toBe('Con datos')
    expect(map.data.root.data.text).toBe('Hola')
  })
})

test.describe('Nuevos diseños', () => {
  for (const [cmd, layout] of [['layout.org', 'organizationStructure'], ['layout.timeline', 'timeline'], ['layout.fishbone', 'fishbone']]) {
    test(`${cmd} cambia el diseño y se guarda`, async ({ page, maps }) => {
      const { app, map } = await setupMap(page, maps)
      await app.ribbonTab('format').click()
      await app.ribbonCmd('format', cmd).click()
      await expect(app.ribbonCmd('format', cmd)).toHaveAttribute('aria-pressed', 'true')
      await app.expectNodeCount(5)
      await expect.poll(async () => (await maps.get(map.id)).data.layout).toBe(layout)
    })
  }
})
