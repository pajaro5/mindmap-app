// Fase 23 · Editar diagramas: reglas de zona desde la interfaz, añadir y quitar zonas, tamaño
// del diagrama (y filas/columnas de una matriz)
const { test, expect, setupMap } = require('./fixtures')

const dialog = page => page.locator('#appDialog')
const cmd = (app, id) => app.ribbonCmd('format', id)

function diagramMap(type, items, extra = {}) {
  return {
    layout: 'logicalStructure',
    root: {
      data: { text: 'Diagrama', _diagram: { type, items: items.map((label, i) => ({ id: `z${i + 1}`, label })), ...extra } },
      children: items.map((label, i) => ({ data: { text: `T${i + 1}` }, children: [] }))
    },
    theme: { template: 'mindmanager', config: {} },
    view: {}
  }
}
const diagram = page => page.evaluate(() => diagramOf(Alpine.raw(window.Alpine.$data(document.body).mindMap)))
const zoneOf = (page, text) => page.evaluate(text => {
  const mm = Alpine.raw(window.Alpine.$data(document.body).mindMap)
  const strip = s => String(s).replace(/<[^>]+>/g, '').trim()
  const node = mm.renderer.root.children.find(n => strip(n.getData('text')) === text)
  return node ? diagramZoneAt(diagramOf(mm), node.left + node.width / 2, node.top + node.height / 2) : null
}, text)

async function openZone(page, label) {
  await page.locator('#mindMapContainer .smm-diagram-label', { hasText: label }).dblclick()
  await expect(dialog(page).locator('[name="diagramLabel"]')).toHaveValue(label)
}

test.describe('Reglas de zona', () => {
  test('relleno y tamaño de letra desde el diálogo de la zona; se aplican a sus temas y se deshacen', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps, { data: diagramMap('funnel', ['Arriba', 'Medio', 'Abajo']) })
    await expect.poll(() => zoneOf(page, 'T1')).toBe('z1')
    await openZone(page, 'Arriba')
    await dialog(page).locator('[name="ruleFillOn"]').check()
    await dialog(page).locator('[name="ruleFill"]').fill('#c00000')
    await dialog(page).locator('[name="ruleFontSize"]').selectOption('20')
    await app.recordsHistory(() => dialog(page).getByRole('button', { name: 'Aceptar' }).click())
    await expect.poll(() => app.nodeData('T1', 'fillColor')).toBe('#c00000')
    expect(await app.nodeData('T1', 'fontSize')).toBe(20)
    expect(await app.nodeData('T2', 'fillColor')).toBeUndefined()
    expect((await diagram(page)).rules).toEqual({ z1: { fill: '#c00000', fontSize: 20 } })

    await app.qat('edit.undo').click()
    await expect.poll(() => app.nodeData('T1', 'fillColor')).toBeUndefined()
  })

  test('un icono como regla, y quitar la regla deja el tema como estaba', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps, { data: diagramMap('funnel', ['Arriba', 'Abajo']) })
    await openZone(page, 'Abajo')
    await dialog(page).locator('[name="ruleIcon"]').selectOption('flag_red')
    await dialog(page).getByRole('button', { name: 'Aceptar' }).click()
    await expect.poll(() => app.nodeData('T2', 'icon')).toEqual(['flag_red'])
    await openZone(page, 'Abajo')
    await expect(dialog(page).locator('[name="ruleIcon"]')).toHaveValue('flag_red')
    await dialog(page).locator('[name="ruleIcon"]').selectOption('')
    await dialog(page).getByRole('button', { name: 'Aceptar' }).click()
    await expect.poll(() => app.nodeData('T2', 'icon')).toEqual([])
    expect((await diagram(page)).rules).toBeUndefined()
  })
})

test.describe('Zonas', () => {
  test('añadir una zona y quitar otra; los límites del tipo de diagrama se respetan', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps, { data: diagramMap('venn', ['A', 'B']) })
    await app.ribbonTab('format').click()
    await expect(cmd(app, 'diagram.addZone')).toBeEnabled()
    await app.recordsHistory(() => cmd(app, 'diagram.addZone').click())
    await expect.poll(async () => (await diagram(page)).items.length).toBe(3)
    await expect(cmd(app, 'diagram.addZone')).toBeDisabled() // Venn: como mucho 3

    await openZone(page, 'B')
    await dialog(page).locator('[data-action="remove-zone"]').click()
    await expect(dialog(page)).toBeHidden()
    await expect.poll(async () => (await diagram(page)).items.map(i => i.label)).toEqual(['A', ''])
    await page.locator('#mindMapContainer .smm-diagram-label', { hasText: 'A' }).dblclick()
    await expect(dialog(page).locator('[data-action="remove-zone"]')).toBeDisabled() // Venn: al menos 2
  })

  test('en una matriz las zonas son filas × columnas', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps, { data: diagramMap('matrix', ['a', 'b', 'c', 'd'], { rows: 2, cols: 2 }) })
    await app.ribbonTab('format').click()
    await expect(cmd(app, 'diagram.addZone')).toBeDisabled()
    await cmd(app, 'diagram.properties').click()
    await dialog(page).locator('[name="diagramRows"]').selectOption('3')
    await dialog(page).getByRole('button', { name: 'Aceptar' }).click()
    await expect.poll(async () => { const d = await diagram(page); return [d.rows, d.cols, d.items.length] }).toEqual([3, 2, 6])
  })
})

test.describe('Tamaño del diagrama', () => {
  test('cambiar ancho y alto escala el fondo y los temas siguen en su zona', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps, { data: diagramMap('lanes', ['Uno', 'Dos', 'Tres']) })
    await expect.poll(() => zoneOf(page, 'T3')).toBe('z3')
    const before = await Promise.all(['T1', 'T2', 'T3'].map(t => zoneOf(page, t)))
    await app.clickRibbon('format', 'diagram.properties')
    await expect(dialog(page).locator('[name="diagramWidth"]')).toHaveValue('860')
    await dialog(page).locator('[name="diagramWidth"]').fill('1200')
    await dialog(page).locator('[name="diagramHeight"]').fill('700')
    await app.recordsHistory(() => dialog(page).getByRole('button', { name: 'Aceptar' }).click())
    await expect.poll(async () => { const d = await diagram(page); return [d.width, d.height] }).toEqual([1200, 700])
    await expect.poll(() => Promise.all(['T1', 'T2', 'T3'].map(t => zoneOf(page, t)))).toEqual(before)
    await app.qat('edit.undo').click()
    await expect.poll(async () => (await diagram(page)).width).toBe(860)
  })

  test('los valores fuera de rango se ajustan', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps, { data: diagramMap('funnel', ['a', 'b']) })
    await app.clickRibbon('format', 'diagram.properties')
    await dialog(page).locator('[name="diagramWidth"]').fill('50')
    await dialog(page).locator('[name="diagramHeight"]').fill('99999')
    await dialog(page).getByRole('button', { name: 'Aceptar' }).click()
    await expect.poll(async () => { const d = await diagram(page); return [d.width, d.height] }).toEqual([200, 3000])
  })
})

test('en un mapa que no es un diagrama, los comandos de diagrama están deshabilitados', async ({ page, maps }) => {
  const { app } = await setupMap(page, maps)
  await app.ribbonTab('format').click()
  await expect(cmd(app, 'diagram.addZone')).toBeDisabled()
  await expect(cmd(app, 'diagram.properties')).toBeDisabled()
})
