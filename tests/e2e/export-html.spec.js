// Exportar a HTML interactivo: un archivo autocontenido, de solo lectura, que funciona sin
// servidor ni red y en el que las ramas se despliegan y contraen
const fs = require('fs')
const { pathToFileURL } = require('url')
const { test, expect, setupMap, SAMPLE_TREE } = require('./fixtures')

const clone = o => JSON.parse(JSON.stringify(o))

// Exporta el mapa abierto y devuelve la ruta del archivo descargado
async function exportHtml(page, app, testInfo) {
  await app.ribbonTab('export').click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    app.ribbonCmd('export', 'export.html').click()
  ])
  const file = testInfo.outputPath(download.suggestedFilename())
  await download.saveAs(file)
  return { file, name: download.suggestedFilename() }
}

// Abre el archivo exportado en una pestaña nueva (como haría el usuario), bloqueando y
// anotando cualquier petición de red y los errores de esa pestaña.
// Navegar la misma pestaña de la app justo después de una descarga lo abortaba a veces en
// Firefox (NS_BINDING_ABORTED).
async function openExported(page, file) {
  const viewer = await page.context().newPage()
  const network = []
  const cspErrors = []
  const errors = []
  viewer.on('console', m => {
    if (/Content.Security.Policy|Refused to/i.test(m.text())) cspErrors.push(m.text())
    else if (m.type() === 'error') errors.push(m.text())
  })
  viewer.on('pageerror', e => errors.push(e.message))
  await viewer.route('**/*', route => {
    const url = route.request().url()
    if (/^(file|blob|data):/.test(url)) return route.continue()
    network.push(url)
    return route.abort()
  })
  await viewer.goto(pathToFileURL(file).href)
  // Cargar 1,5 MB de librería puede tardar en un equipo cargado (sobre todo Firefox)
  await expect(viewer.locator('body.viewer-ready')).toHaveCount(1, { timeout: 30000 })
  return { viewer, network, cspErrors, errors }
}

// Datos del mapa incrustados en el archivo
const embeddedData = html => JSON.parse(html.match(/<script type="application\/json" id="map-data">([\s\S]*?)<\/script>/)[1])

const viewerNodes = page => page.locator('#mindMapContainer .smm-node')
const viewerNode = (page, text) => viewerNodes(page).filter({ has: page.locator('foreignObject').getByText(text, { exact: true }) })

test('descarga un .html autocontenido con el título del mapa', async ({ page, maps }, testInfo) => {
  const { app } = await setupMap(page, maps)
  await page.locator('.title-input').fill('Plan: 2026/Q1')
  await page.locator('.title-input').press('Enter')
  const { file, name } = await exportHtml(page, app, testInfo)
  expect(name).toBe('Plan 2026 Q1.html')
  const html = fs.readFileSync(file, 'utf8')
  expect(html.startsWith('<!doctype html>')).toBe(true)
  expect(html).toContain('Content-Security-Policy')
  expect(html).toContain('<title>Plan: 2026/Q1</title>')
  // Sin recursos externos: todo va dentro (la librería pesa 1,5 MB)
  const markup = html.replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/gi, '$1</script>')
  expect(/<(script|link|img|iframe)\b[^>]*\b(src|href)=/i.test(markup), 'el documento no carga nada por URL').toBe(false)
  expect(html.length).toBeGreaterThan(1_000_000)
  const embedded = embeddedData(html)
  expect(embedded.title).toBe('Plan: 2026/Q1')
  expect(embedded.data.root.data.text).toBeTruthy()
  expect(embedded.data.view).toBeUndefined()
})

test('los adjuntos (que están en el servidor) no se incluyen', async ({ page, maps }, testInfo) => {
  const data = clone(SAMPLE_TREE)
  Object.assign(data.root.children[2].data, { attachmentUrl: '/api/files/123e4567-e89b-12d3-a456-426614174000', attachmentName: 'doc.pdf' })
  const { app } = await setupMap(page, maps, { data })
  const { file } = await exportHtml(page, app, testInfo)
  const gamma = embeddedData(fs.readFileSync(file, 'utf8')).data.root.children[2].data
  expect(gamma.attachmentUrl).toBeUndefined()
  expect(gamma.attachmentName).toBeUndefined()
})

// Las pruebas que abren el archivo cargan 1,5 MB de librería en una pestaña nueva
test.describe('el archivo abierto en el navegador', () => {
  test.describe.configure({ timeout: 90000 })

  test('se abre sin servidor ni red y muestra el mapa', async ({ page, maps }, testInfo) => {
    const { app } = await setupMap(page, maps)
    const { file } = await exportHtml(page, app, testInfo)
    const { viewer, network, cspErrors, errors } = await openExported(page, file)
    await expect(viewerNodes(viewer)).toHaveCount(5)
    await expect(viewerNode(viewer, 'Alfa uno')).toBeVisible()
    await expect(viewer.locator('.viewer-title')).toHaveText(/E2E/)
    // El texto se ve dentro de su tema (sin el reset de CSS quedaba desplazado y recortado)
    for (const text of ['Raíz', 'Beta']) {
      const fo = await viewerNode(viewer, text).locator('foreignObject').first().boundingBox()
      const p = await viewerNode(viewer, text).locator('foreignObject p').first().boundingBox()
      expect(p.y, `texto de ${text} dentro del tema`).toBeGreaterThanOrEqual(fo.y - 1)
      expect(p.y + p.height, `texto de ${text} dentro del tema`).toBeLessThanOrEqual(fo.y + fo.height + 1)
    }
    expect(network).toEqual([])
    expect(cspErrors).toEqual([])
    expect(errors).toEqual([])
  })

  test('las notas con formato se ven con su formato al pasar por el icono de nota', async ({ page, maps }, testInfo) => {
    const data = clone(SAMPLE_TREE)
    Object.assign(data.root.children[1].data, { note: 'Pasos\n1. uno', _noteHtml: '<p><b>Pasos</b></p><ol><li>uno</li></ol>' })
    const { app } = await setupMap(page, maps, { data })
    const { file } = await exportHtml(page, app, testInfo)
    const { viewer, errors } = await openExported(page, file)
    await viewerNode(viewer, 'Beta').locator('.smm-node-note').hover()
    const tip = viewer.locator('.note-tooltip')
    await expect(tip).toBeVisible()
    await expect(tip.locator('b')).toHaveText('Pasos')
    await expect(tip.locator('ol li')).toHaveText('uno')
    expect(errors).toEqual([])
  })

  test('es de solo lectura: ni doble clic ni teclas editan el mapa', async ({ page, maps }, testInfo) => {
    const { app } = await setupMap(page, maps)
    const { file } = await exportHtml(page, app, testInfo)
    const { viewer, errors } = await openExported(page, file)
    await viewerNode(viewer, 'Beta').dblclick()
    await viewer.keyboard.press('Tab')
    await viewer.keyboard.press('Delete')
    await viewer.waitForTimeout(300)
    await expect(viewer.locator('.smm-richtext-node-edit-wrap:visible')).toHaveCount(0)
    await expect(viewerNodes(viewer)).toHaveCount(5)
    expect(await viewer.evaluate(() => window.__viewer.mindMap.opt.readonly)).toBe(true)
    expect(errors).toEqual([])
  })

  test('un diagrama se exporta con su fondo y cada tema en su zona', async ({ page, maps }, testInfo) => {
    const data = clone(SAMPLE_TREE)
    data.root.data._diagram = {
      type: 'matrix', rows: 2, cols: 2,
      items: [{ id: 'a', label: 'Zona A', color: '#2f9e44' }, { id: 'b', label: 'Zona B', color: '#e03131' }, { id: 'c', label: 'Zona C', color: '#1c7ed6' }, { id: 'd', label: 'Zona D', color: '#f08c00' }],
      rules: { b: { icon: 'flag_red' } }
    }
    data.root.children = [
      { data: { text: 'En A', customLeft: 40, customTop: 60 }, children: [] },
      { data: { text: 'En B', customLeft: 360, customTop: 60 }, children: [] },
      { data: { text: 'En D', customLeft: 360, customTop: 280 }, children: [] }
    ]
    const { app } = await setupMap(page, maps, { data })
    await expect(page.locator('#mindMapContainer .smm-diagram [data-zone]')).toHaveCount(4)
    const { file } = await exportHtml(page, app, testInfo)
    const { viewer, errors } = await openExported(page, file)
    await expect(viewer.locator('#mindMapContainer .smm-diagram [data-zone]')).toHaveCount(4)
    await expect(viewer.locator('#mindMapContainer .smm-diagram-label')).toHaveText(['Zona A', 'Zona B', 'Zona C', 'Zona D'])
    for (const [text, zone] of [['En A', 'a'], ['En B', 'b'], ['En D', 'd']]) {
      const n = await viewerNode(viewer, text).boundingBox()
      const z = await viewer.locator(`#mindMapContainer .smm-diagram [data-zone="${zone}"]`).boundingBox()
      const cx = n.x + n.width / 2
      const cy = n.y + n.height / 2
      expect(cx > z.x && cx < z.x + z.width && cy > z.y && cy < z.y + z.height, `${text} dentro de la zona ${zone}`).toBe(true)
    }
    // La regla aplicada en la app viaja con el mapa; el título no tiene líneas hacia los temas
    expect(await viewer.evaluate(() => window.__viewer.mindMap.renderer.root.children[1].getData('icon'))).toEqual(['flag_red'])
    expect(await viewer.evaluate(() => window.__viewer.mindMap.renderer.root._lines.filter(l => l.visible()).length)).toBe(0)
    expect(errors).toEqual([])
  })

  test('conserva el formato del mapa: tema, fondo, ramas de colores y sombras', async ({ page, maps }, testInfo) => {
    const data = clone(SAMPLE_TREE)
    data.root.data._mapFormat = { theme: 'mm-night', rainbow: true, shadow: true, lineStyle: 'direct' }
    const { app } = await setupMap(page, maps, { data })
    const { file } = await exportHtml(page, app, testInfo)
    const { viewer, errors } = await openExported(page, file)
    await expect(viewerNodes(viewer)).toHaveCount(5)
    const look = await viewer.evaluate(() => {
      const mm = window.__viewer.mindMap
      const root = mm.renderer.root
      return {
        background: getComputedStyle(document.getElementById('mindMapContainer')).backgroundColor,
        theme: mm.opt.theme,
        lineStyle: mm.themeConfig.lineStyle,
        rootFilter: root.shapeNode.node.getAttribute('filter'),
        lineColors: root._lines.map(l => l.node.getAttribute('stroke'))
      }
    })
    expect(look.background).toBe('rgb(30, 37, 48)')
    expect(look.theme).toBe('mm-night')
    expect(look.lineStyle).toBe('direct')
    expect(look.rootFilter).toBe('url(#mm-topic-shadow)')
    expect(new Set(look.lineColors).size).toBe(3)
    expect(errors).toEqual([])
  })

  test('conserva el formato de relaciones (flechas) y límites (nube)', async ({ page, maps }, testInfo) => {
    const data = clone(SAMPLE_TREE)
    data.root.children[2].data.uid = 'gamma-uid'
    Object.assign(data.root.children[0].data, {
      associativeLineTargets: ['gamma-uid'],
      associativeLineStyle: { 'gamma-uid': { arrows: 'both', associativeLineColor: '#c00000', associativeLineDasharray: 'none' } }
    })
    data.root.children[1].data.outerFrame = { groupId: 'g1', shape: 'cloud', strokeColor: '#00b050', fill: '#e5f3d6', strokeWidth: 2, strokeDasharray: 'none' }
    const { app } = await setupMap(page, maps, { data })
    const { file } = await exportHtml(page, app, testInfo)
    const { viewer, errors } = await openExported(page, file)
    await expect(viewer.locator('.smm-outer-frame-container > path')).toHaveCount(1)
    await expect(viewer.locator('.smm-outer-frame-container > path')).toHaveAttribute('stroke', '#00b050')
    const line = await viewer.evaluate(() => {
      const el = window.__viewer.mindMap.associativeLine.lineList[0][0].node
      return { stroke: el.getAttribute('stroke'), start: !!el.getAttribute('marker-start'), end: !!el.getAttribute('marker-end') }
    })
    expect(line).toEqual({ stroke: '#c00000', start: true, end: true })
    expect(errors).toEqual([])
  })

  test('las ramas se despliegan y contraen con su botón y con la barra', async ({ page, maps }, testInfo) => {
    const data = clone(SAMPLE_TREE)
    data.root.children[0].data.expand = false   // Alfa contraído: Alfa uno oculto
    const { app } = await setupMap(page, maps, { data })
    const { file } = await exportHtml(page, app, testInfo)
    const { viewer, errors } = await openExported(page, file)
    await expect(viewerNodes(viewer)).toHaveCount(4)

    // Botón +/− del propio tema
    await viewerNode(viewer, 'Alfa').locator('.smm-expand-btn').click()
    await expect(viewerNode(viewer, 'Alfa uno')).toBeVisible()
    await viewerNode(viewer, 'Alfa').locator('.smm-expand-btn').click()
    await expect(viewerNode(viewer, 'Alfa uno')).toHaveCount(0)

    await viewer.locator('[data-viewer="expand-all"]').click()
    await expect(viewerNodes(viewer)).toHaveCount(5)
    await viewer.locator('[data-viewer="collapse"]').click()
    await expect(viewerNodes(viewer)).toHaveCount(4)
    expect(errors).toEqual([])
  })

  test('se ven iconos, marcadores, información de tarea y llamadas', async ({ page, maps }, testInfo) => {
    const data = clone(SAMPLE_TREE)
    Object.assign(data.root.children[1].data, {
      icon: ['priority_1', 'flag_red'],
      tag: [{ text: 'Urgente', style: { fill: '#c00000' } }],
      _task: { due: '2030-01-20', resources: ['Ana'] },
      _callouts: [{ id: 'k1', text: 'Nota flotante', dx: 24, dy: -14 }]
    })
    const { app } = await setupMap(page, maps, { data })
    const { file } = await exportHtml(page, app, testInfo)
    const { viewer } = await openExported(page, file)
    const beta = viewerNode(viewer, 'Beta')
    await expect(beta.locator('svg')).toHaveCount(2)
    await expect(beta.locator('text', { hasText: 'Urgente' })).toBeVisible()
    await expect(beta.locator('.smm-task-info')).toHaveText('Vence 20 ene · Ana')
    await expect(viewer.locator('.smm-callouts .smm-callout')).toContainText('Nota flotante')
  })

  test('[Seguridad] ningún texto del mapa puede cerrar los <script> ni ejecutar código', async ({ page, maps }, testInfo) => {
    const data = clone(SAMPLE_TREE)
    const breakout = '</script><img src=x onerror="window.__xss=1"><script>window.__xss=2</script>'
    data.root.children[0].data.text = breakout
    data.root.children[1].data.note = breakout
    data.root.children[2].data._callouts = [{ id: 'k1', text: breakout, dx: 24, dy: -14 }]
    data.root.children[2].data.hyperlink = 'javascript:window.__xss=3'
    const { app } = await setupMap(page, maps, { data })
    const { file } = await exportHtml(page, app, testInfo)
    const html = fs.readFileSync(file, 'utf8')
    // Solo los <script> propios del archivo: el texto del mapa no abre ni cierra ninguno
    const opened = (html.match(/<script\b/gi) || []).length
    const closed = (html.match(/<\/script>/gi) || []).length
    expect(opened).toBe(closed)
    // Librería y datos, más uno por cada script de la app que se incrusta
    expect(opened).toBe(2 + await page.evaluate(() => EXPORT_SCRIPT_URLS.length))

    const { viewer } = await openExported(page, file)
    await expect(viewerNodes(viewer)).toHaveCount(5)
    await expect(viewerNode(viewer, breakout)).toBeVisible()
    await viewer.waitForTimeout(300)
    expect(await viewer.evaluate(() => window.__xss)).toBeUndefined()
    // El vínculo javascript: se descartó al sanear
    expect(await viewer.evaluate(() => window.__viewer.mindMap.renderer.root.children[2].getData('hyperlink'))).toBeUndefined()
  })
})
