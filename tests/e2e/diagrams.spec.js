// Fase 13 · Diagramas: matrices, Venn, embudos, cebolla, cuarto de círculo, carriles y mapa
// conceptual. Temas colocados libremente sobre un fondo de zonas, con reglas por zona.
const { test, expect, setupMap, SAMPLE_TREE } = require('./fixtures')

const dialog = page => page.locator('#appDialog')
const layer = page => page.locator('#mindMapContainer .smm-diagram')

async function createFromTemplate(page, app, maps, id) {
  await app.showMapsPane()
  await page.locator('[data-action="open-templates"]').click()
  await dialog(page).locator('[data-category="diagrams"]').click()
  await dialog(page).locator(`.template-card[data-template="builtin:${id}"]`).dblclick()
  await expect(dialog(page)).toBeHidden()
  // El diálogo se cierra antes de abrir el mapa nuevo: esperar a que esté cargado
  await page.waitForFunction(() => {
    const d = window.Alpine.$data(document.body)
    return !!d.currentId && d.mindMapId === d.currentId && !d.currentTitle.startsWith('E2E ')
  })
  const mapId = await page.evaluate(() => window.Alpine.$data(document.body).currentId)
  maps.track(mapId)
  // El mapa conceptual no tiene fondo: la capa existe pero está vacía
  await expect(layer(page)).toHaveCount(1)
  // Esperar a que estén todos los temas y el título ya centrado (tras abrir hay un render más)
  await page.waitForFunction(id => {
    const mm = window.Alpine.raw(window.Alpine.$data(document.body).mindMap)
    const root = mm && mm.renderer.root
    const tpl = BUILTIN_TEMPLATES.find(t => t.id === id)
    if (!root || root.children.length !== tpl.root.children.length) return false
    return Math.abs(root.left + root.width / 2 - diagramOf(mm).width / 2) <= 1
  }, id)
  return mapId
}

// Igual, con un desplazamiento (en unidades del lienzo) para no soltar encima de otro tema
async function freeSpot(page, zone, dx, dy) {
  const p = await page.evaluate(({ zone, dx, dy }) => {
    const mm = window.Alpine.raw(window.Alpine.$data(document.body).mindMap)
    const a = diagramZoneAnchor(diagramOf(mm), zone)
    return { x: a.x + TOPIC_GUESS.w / 2 + dx, y: a.y + TOPIC_GUESS.h / 2 + dy }
  }, { zone, dx, dy })
  return toScreen(page, p.x, p.y)
}

// Punto del diagrama (coordenadas del lienzo) en la pantalla
function toScreen(page, x, y) {
  return page.evaluate(({ x, y }) => {
    const mm = window.Alpine.$data(document.body).mindMap
    const t = mm.draw.transform()
    const r = mm.el.getBoundingClientRect()
    return { x: r.left + x * t.scaleX + t.translateX, y: r.top + y * t.scaleY + t.translateY }
  }, { x, y })
}

// Centro aproximado de una zona en pantalla
async function zoneCenter(page, zone) {
  const p = await page.evaluate(zone => {
    const mm = window.Alpine.raw(window.Alpine.$data(document.body).mindMap)
    const a = diagramZoneAnchor(diagramOf(mm), zone)
    return { x: a.x + TOPIC_GUESS.w / 2, y: a.y + TOPIC_GUESS.h / 2 }
  }, zone)
  return toScreen(page, p.x, p.y)
}

// Zona en la que está el centro de un tema
function zoneOf(page, text) {
  return page.evaluate(text => {
    const mm = window.Alpine.raw(window.Alpine.$data(document.body).mindMap)
    const strip = s => String(s).replace(/<[^>]+>/g, '').trim()
    const node = mm.renderer.root.children.find(n => strip(n.getData('text')) === text)
    return node ? diagramZoneAt(diagramOf(mm), node.left + node.width / 2, node.top + node.height / 2) : null
  }, text)
}

async function dragNodeTo(page, app, text, target) {
  const box = await app.node(text).boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 15, box.y + box.height / 2 + 15, { steps: 4 })
  await page.mouse.move(target.x, target.y, { steps: 12 })
  await page.mouse.up()
}

const rootLinesVisible = page => page.evaluate(() => {
  const root = window.Alpine.$data(document.body).mindMap.renderer.root
  return (root._lines || []).filter(l => l.visible()).length
})

test.describe('Matrices y reglas por zona', () => {
  test('Matriz DAFO: fondo con 4 cuadrantes, sin líneas desde el título y cada tema con el icono de su zona', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await createFromTemplate(page, app, maps, 'swot-matrix')
    await expect(layer(page)).toHaveAttribute('data-type', 'matrix')
    await expect(layer(page).locator('[data-zone]')).toHaveCount(4)
    await expect(layer(page).locator('.smm-diagram-label')).toHaveText(['Fortalezas', 'Debilidades', 'Oportunidades', 'Amenazas'])
    expect(await rootLinesVisible(page)).toBe(0)
    for (const [text, zone, icon] of [['Fortaleza', 'f', 'flag_green'], ['Debilidad', 'd', 'flag_red'], ['Oportunidad', 'o', 'arrow_rising'], ['Amenaza', 'a', 'symbol_warning']]) {
      expect(await zoneOf(page, text), text).toBe(zone)
      expect(await app.nodeData(text, 'icon'), text).toEqual([icon])
    }
    // El fondo queda detrás de los temas
    expect(await page.evaluate(() => document.querySelector('#mindMapContainer .smm-diagram').previousElementSibling)).toBeNull()
  })

  test('arrastrar un tema a otro cuadrante cambia su icono en un solo paso; Deshacer lo devuelve', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await createFromTemplate(page, app, maps, 'swot-matrix')
    await app.settleHistory()
    await app.recordsHistory(async () => dragNodeTo(page, app, 'Fortaleza', await freeSpot(page, 'a', 40, 110)))
    await expect.poll(() => zoneOf(page, 'Fortaleza')).toBe('a')
    await expect.poll(() => app.nodeData('Fortaleza', 'icon')).toEqual(['symbol_warning'])
    expect(await app.nodeData('Fortaleza', '_diagramRule')).toEqual({ icon: 'symbol_warning' })
    // Sigue siendo un tema del diagrama (no se reordenó ni se convirtió en subtema)
    expect((await app.tree()).c.map(c => c.t)).toEqual(['Fortaleza', 'Debilidad', 'Oportunidad', 'Amenaza'])

    await app.qat('edit.undo').click()
    await expect.poll(() => zoneOf(page, 'Fortaleza')).toBe('f')
    await expect.poll(() => app.nodeData('Fortaleza', 'icon')).toEqual(['flag_green'])
  })

  test('un icono puesto a mano se conserva al cambiar de zona; la prioridad de la regla sustituye a la anterior', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await createFromTemplate(page, app, maps, 'urgency-importance')
    await expect.poll(() => app.nodeData('Tarea urgente e importante', 'icon')).toEqual(['priority_1'])
    await app.setNodeStyle('Tarea importante', 'icon', ['priority_2', 'symbol_heart'])
    await dragNodeTo(page, app, 'Tarea importante', await freeSpot(page, 'delegate', 40, 110))
    await expect.poll(() => app.nodeData('Tarea importante', 'icon')).toEqual(['priority_3', 'symbol_heart'])
  })

  test('valor/esfuerzo: el color de relleno lo pone la regla y se quita al salir de la zona', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await createFromTemplate(page, app, maps, 'value-effort')
    await expect.poll(() => app.nodeData('Iniciativa A', 'fillColor')).toBe('#d3f9d8')
    // Como Formato › Color de relleno: sin degradado, y texto oscuro sobre un relleno claro
    expect(await app.nodeData('Iniciativa A', 'gradientStyle')).toBe(false)
    expect(await app.nodeData('Iniciativa A', 'color')).toBe('#1e2a3a')
    await dragNodeTo(page, app, 'Iniciativa A', await freeSpot(page, 'big', 40, 110))
    await expect.poll(() => app.nodeData('Iniciativa A', 'fillColor')).toBe('#d0ebff')
    expect(await app.nodeData('Iniciativa A', 'icon')).toEqual([])
    // Fuera de todas las zonas (a la derecha de la matriz): sin regla
    const outside = await toScreen(page, 700, 100)
    await dragNodeTo(page, app, 'Iniciativa A', outside)
    await expect.poll(() => app.nodeData('Iniciativa A', '_diagramRule')).toBeUndefined()
    expect(await app.nodeData('Iniciativa A', 'fillColor')).toBeUndefined()
    expect(await app.nodeData('Iniciativa A', 'gradientStyle')).toBeUndefined()
    expect(await app.nodeData('Iniciativa A', 'color')).toBeUndefined()
  })

  test('el título queda centrado encima del diagrama, también al cambiar su texto', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await createFromTemplate(page, app, maps, 'venn-2')
    const centered = () => page.evaluate(() => {
      const mm = window.Alpine.raw(window.Alpine.$data(document.body).mindMap)
      const root = mm.renderer.root
      if (!root) return false // en pleno render
      return Math.abs(root.left + root.width / 2 - diagramOf(mm).width / 2) <= 1 && root.top + root.height < 0
    })
    await expect.poll(centered).toBe(true)
    await app.setNodeStyle('Comparar: [A] y [B]', 'fontSize', 30)
    await expect.poll(centered).toBe(true)
  })
})

test.describe('Añadir y editar en un diagrama', () => {
  test('doble clic en un hueco crea un tema en ese punto, con la regla de la zona', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await createFromTemplate(page, app, maps, 'swot-matrix')
    const target = await zoneCenter(page, 'o')
    await page.mouse.dblclick(target.x + 60, target.y + 70)
    await app.typeNewTopic('Mercado nuevo')
    await expect(app.node('Mercado nuevo')).toBeVisible()
    expect(await zoneOf(page, 'Mercado nuevo')).toBe('o')
    expect(await app.nodeData('Mercado nuevo', 'icon')).toEqual(['arrow_rising'])
    expect((await app.tree()).c).toHaveLength(5)
  })

  test('Enter en un tema del diagrama crea otro debajo, en la misma zona; Tab crea un subtema normal', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await createFromTemplate(page, app, maps, 'swot-matrix')
    await app.selectNode('Debilidad')
    await page.keyboard.press('Enter')
    await app.typeNewTopic('Otra debilidad')
    expect(await zoneOf(page, 'Otra debilidad')).toBe('d')
    expect(await app.nodeData('Otra debilidad', 'icon')).toEqual(['flag_red'])
    const [a, b] = await Promise.all([app.node('Debilidad').boundingBox(), app.node('Otra debilidad').boundingBox()])
    expect(b.y).toBeGreaterThan(a.y + a.height - 1)

    await app.selectNode('Otra debilidad')
    await page.keyboard.press('Tab')
    await app.typeNewTopic('Detalle')
    expect(await app.nodeData('Detalle', 'customLeft')).toBeUndefined()
    expect(await app.nodeData('Detalle', '_diagramRule')).toBeUndefined()
    expect(await app.nodeData('Detalle', 'icon')).toBeFalsy()
  })

  test('soltar un tema sobre otro lo convierte en subtema y pierde la posición y la regla', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await createFromTemplate(page, app, maps, 'swot-matrix')
    const box = await app.node('Debilidad').boundingBox()
    await dragNodeTo(page, app, 'Amenaza', { x: box.x + box.width / 2, y: box.y + box.height / 2 })
    await expect.poll(async () => (await app.tree()).c.map(c => c.t)).toEqual(['Fortaleza', 'Debilidad', 'Oportunidad'])
    expect((await app.tree()).c[1].c.map(c => c.t)).toEqual(['Amenaza'])
    expect(await app.nodeData('Amenaza', 'customLeft')).toBeUndefined()
    expect(await app.nodeData('Amenaza', '_diagramRule')).toBeUndefined()
    expect(await app.nodeData('Amenaza', 'icon')).toEqual([])

    // Y al sacarlo a un hueco vuelve a ser un tema del diagrama, con la regla de esa zona
    await dragNodeTo(page, app, 'Amenaza', await freeSpot(page, 'o', 40, 110))
    await expect.poll(async () => (await app.tree()).c.map(c => c.t)).toEqual(['Fortaleza', 'Debilidad', 'Oportunidad', 'Amenaza'])
    expect(await zoneOf(page, 'Amenaza')).toBe('o')
    expect(await app.nodeData('Amenaza', 'icon')).toEqual(['arrow_rising'])
  })

  test('doble clic en el rótulo de una zona permite cambiar su nombre y color (se puede deshacer)', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    const mapId = await createFromTemplate(page, app, maps, 'swot-matrix')
    await layer(page).locator('.smm-diagram-label', { hasText: 'Fortalezas' }).dblclick()
    await expect(dialog(page).locator('.dialog-title')).toHaveText('Zona del diagrama')
    await expect(dialog(page).locator('.dialog-hint')).toContainText('icono')
    await dialog(page).locator('[name="diagramLabel"]').fill('Puntos fuertes')
    await dialog(page).locator('[name="diagramColor"]').fill('#123456')
    await dialog(page).locator('button[type="submit"]').click()
    await expect(layer(page).locator('.smm-diagram-label').first()).toHaveText('Puntos fuertes')
    await expect.poll(async () => (await maps.get(mapId)).data.root.data._diagram.items[0])
      .toEqual({ id: 'f', label: 'Puntos fuertes', color: '#123456' })

    await app.qat('edit.undo').click()
    await expect(layer(page).locator('.smm-diagram-label').first()).toHaveText('Fortalezas')
  })
})

test.describe('Otros diagramas', () => {
  test('Venn de 2 círculos: la intersección tiene su propio color e icono', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await createFromTemplate(page, app, maps, 'venn-2')
    await expect(layer(page).locator('circle[data-zone]')).toHaveCount(2)
    expect(await zoneOf(page, 'En común')).toBe('a+b')
    expect(await app.nodeData('En común', 'fillColor')).toBe('#fff3bf')
    expect(await app.nodeData('En común', 'icon')).toEqual(['symbol_star'])
    await dragNodeTo(page, app, 'En común', await freeSpot(page, 'a', 0, 70))
    await expect.poll(() => app.nodeData('En común', 'fillColor')).toBe('#d0ebff')
    expect(await app.nodeData('En común', 'icon')).toEqual([])
  })

  for (const [id, type, zones] of [
    ['venn-3', 'venn', 3], ['venn-3-rules', 'venn', 3], ['matrix-3x3', 'matrix', 9], ['funnel', 'funnel', 5],
    ['sales-funnel', 'funnel', 5], ['ecommerce-funnel', 'funnel', 5], ['onion', 'onion', 4],
    ['quarter-circle-plot', 'quarter', 3], ['quarter-onion-plot', 'quarter', 3],
    ['swimlanes-horizontal', 'lanes', 4], ['swimlanes-vertical', 'lanes', 3], ['risk-reward', 'matrix', 4]
  ]) {
    test(`${id}: se dibuja como ${type} y cada tema cae en la zona prevista`, async ({ page, maps }) => {
      const { app } = await setupMap(page, maps)
      await createFromTemplate(page, app, maps, id)
      await expect(layer(page)).toHaveAttribute('data-type', type)
      await expect(layer(page).locator('[data-zone]')).toHaveCount(zones)
      const result = await page.evaluate(id => {
        const mm = window.Alpine.raw(window.Alpine.$data(document.body).mindMap)
        const tpl = BUILTIN_TEMPLATES.find(t => t.id === id)
        const d = diagramOf(mm)
        return mm.renderer.root.children.map((n, i) => {
          const want = tpl.root.children[i].zone
          const got = diagramZoneAt(d, n.left + n.width / 2, n.top + n.height / 2)
          return { text: n.getData('text'), ok: !want || got === want }
        })
      }, id)
      expect(result.filter(r => !r.ok)).toEqual([])
      expect(await rootLinesVisible(page)).toBe(0)
    })
  }

  test('cuarto de círculo: el tamaño de letra cambia según el anillo', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await createFromTemplate(page, app, maps, 'quarter-circle-plot')
    await expect.poll(() => app.nodeData('Elemento clave', 'fontSize')).toBe(20)
    expect(await app.nodeData('Detalle', 'fontSize')).toBe(11)
    await dragNodeTo(page, app, 'Detalle', await freeSpot(page, 'high', -40, 34))
    await expect.poll(() => app.nodeData('Detalle', 'fontSize')).toBe(20)
  })

  test('mapa conceptual: conceptos libres unidos por relaciones con texto', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await createFromTemplate(page, app, maps, 'concept-map')
    await expect(layer(page)).toHaveAttribute('data-type', 'concept')
    expect(await app.relationshipCount()).toBe(5)
    expect(Object.values(await app.nodeData('Plantas', 'associativeLineText'))).toEqual(['necesitan', 'necesitan', 'realizan'])
    await expect(page.locator('#mindMapContainer text', { hasText: 'produce' })).toHaveCount(2)
    expect(await rootLinesVisible(page)).toBe(0)
  })
})

test.describe('Persistencia y robustez', () => {
  test('las posiciones no dependen del tamaño de la ventana y se mantienen al reabrir', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    const mapId = await createFromTemplate(page, app, maps, 'swot-matrix')
    // Posición de cada tema respecto a la primera zona, en unidades del lienzo (sin zoom)
    const offsets = () => page.evaluate(() => {
      const scale = window.Alpine.$data(document.body).mindMap.view.scale
      const zone = document.querySelector('#mindMapContainer .smm-diagram [data-zone="f"]').getBoundingClientRect()
      return [...document.querySelectorAll('#mindMapContainer .smm-node')].map(n => {
        const r = n.getBoundingClientRect()
        return [Math.round((r.left - zone.left) / scale), Math.round((r.top - zone.top) / scale)]
      })
    })
    const before = await offsets()
    // Otro tamaño de ventana (el lienzo cambia de tamaño) y se vuelve a abrir el mapa
    await page.setViewportSize({ width: 1500, height: 900 })
    await expect.poll(offsets).toEqual(before)
    await app.goto()
    await app.openMapByTitle('Matriz DAFO')
    await expect(layer(page)).toBeVisible()
    // Con otro zoom el redondeo puede variar algún píxel
    const close = (a, b) => a.length === b.length && a.every(([x, y], i) => Math.abs(x - b[i][0]) <= 4 && Math.abs(y - b[i][1]) <= 4)
    await expect.poll(async () => close(await offsets(), before)).toBe(true)
    expect((await maps.get(mapId)).data.root.data._diagram.type).toBe('matrix')
  })

  test('[Seguridad] rótulos con HTML se muestran como texto y los datos inválidos se sanean', async ({ page, maps }) => {
    const data = JSON.parse(JSON.stringify(SAMPLE_TREE))
    const payload = '<img src=x onerror="window.__xss=1">'
    data.root.data._diagram = {
      type: 'matrix', rows: 99, cols: 2, width: 'x',
      items: [{ id: 'a', label: payload, color: 'red;}' }, { id: '<b>', label: 7 }],
      rules: { a: { icon: 'javascript:alert(1)', fill: '#00ff00', fontSize: 'enorme' }, zz: { fill: '#000000' } }
    }
    data.root.children[0].data.customLeft = 'evil'
    data.root.children[0].data.customTop = 10
    data.root.children[1].data._diagramRule = { icon: '<x>', fill: 3 }
    const { app } = await setupMap(page, maps, { data })
    await expect(layer(page)).toBeVisible()
    const d = await page.evaluate(() => window.Alpine.$data(document.body).mindMap.renderer.renderTree.data._diagram)
    expect(d.rows).toBe(5)
    expect(d.width).toBe(640)
    expect(d.items).toHaveLength(10)
    expect(d.items[0]).toEqual({ id: 'a', label: payload, color: '#3d8fd8' })
    expect(d.items[1].id).toBe('z2')
    expect(d.rules).toEqual({ a: { fill: '#00ff00' } })
    await expect(layer(page).locator('.smm-diagram-label').first()).toHaveText(payload)
    expect(await page.evaluate(() => window.__xss)).toBeUndefined()
    expect(await page.locator('#mindMapContainer .smm-diagram img').count()).toBe(0)
    // El tema con posición inválida se coloca de nuevo; la regla rota se descarta
    expect(Number.isFinite(await app.nodeData('Alfa', 'customLeft'))).toBe(true)
    expect(await app.nodeData('Beta', 'icon')).toBeFalsy()
  })

  test('un tipo de diagrama desconocido se descarta y el mapa se abre como mapa normal', async ({ page, maps }) => {
    const data = JSON.parse(JSON.stringify(SAMPLE_TREE))
    data.root.data._diagram = { type: 'pentagrama', items: [] }
    const { app } = await setupMap(page, maps, { data })
    await app.expectNodeCount(5)
    await expect(layer(page)).toHaveCount(0)
    expect(await rootLinesVisible(page)).toBeGreaterThan(0)
  })

  test('la galería muestra los 17 diagramas con vista previa del diagrama', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.showMapsPane()
    await page.locator('[data-action="open-templates"]').click()
    await dialog(page).locator('[data-category="diagrams"]').click()
    await expect(dialog(page).locator('.template-card')).toHaveCount(17)
    await expect(dialog(page).locator('.template-card svg[data-diagram]')).toHaveCount(17)
    await expect(dialog(page).locator('.template-card[data-template="builtin:venn-2"] svg circle')).toHaveCount(2)
  })
})
