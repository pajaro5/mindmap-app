/**
 * Suite de pruebas end-to-end para el frontend de mindmap-app.
 * Requiere que el servidor (npm start) esté corriendo en http://localhost:3001
 * Uso: node tests/e2e-frontend.js
 */
const { chromium } = require('playwright')
const path = require('path')
const fs = require('fs')

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001'
const DOWNLOAD_DIR = path.join(__dirname, 'downloads')
fs.mkdirSync(DOWNLOAD_DIR, { recursive: true })

const SCREENSHOT_DIR = path.join(__dirname, 'screenshots')
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

const results = []
const createdMapIds = new Set()

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

function makeRunner(page) {
  return async function run(name, fn) {
    try {
      await fn()
      results.push({ name, status: 'PASS' })
      console.log(`✅ PASS - ${name}`)
    } catch (err) {
      results.push({ name, status: 'FAIL', error: err.message })
      console.log(`❌ FAIL - ${name}`)
      console.log(`   -> ${err.message}`)
      const safeName = name.replace(/[^a-z0-9]+/gi, '_')
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${safeName}.png`) }).catch(() => {})
    }
  }
}

async function getAppData(page) {
  return page.evaluate(() => {
    const data = window.Alpine.$data(document.body)
    return {
      currentId: data.currentId,
      currentTitle: data.currentTitle,
      mapsCount: data.maps.length,
      errorMsg: data.errorMsg
    }
  })
}

async function getMindMapNodeCount(page) {
  return page.locator('.smm-node').count()
}

async function getScale(page) {
  return page.evaluate(() => window.Alpine.$data(document.body).mindMap.view.scale)
}

async function fetchMapFromApi(page, id) {
  return page.evaluate(async id => {
    const res = await fetch(`/api/maps/${id}`)
    if (!res.ok) return null
    return res.json()
  }, id)
}

function countNodes(node) {
  return 1 + (node.children || []).reduce((sum, c) => sum + countNodes(c), 0)
}

// Compara el tamaño del <svg> de simple-mind-map con el de su contenedor y el scroll de la página
async function getCanvasGeometry(page) {
  return page.evaluate(() => {
    const el = document.getElementById('mindMapContainer')
    const svg = el.querySelector(':scope > svg')
    const c = el.getBoundingClientRect()
    const s = svg ? svg.getBoundingClientRect() : { width: -1, height: -1 }
    return {
      container: { w: Math.round(c.width), h: Math.round(c.height) },
      svg: { w: Math.round(s.width), h: Math.round(s.height) },
      scrollY: window.scrollY,
      scrollX: window.scrollX,
      docH: document.documentElement.scrollHeight,
      winH: window.innerHeight
    }
  })
}

function assertSvgFitsContainer(g, when) {
  assert(
    Math.abs(g.svg.w - g.container.w) <= 1 && Math.abs(g.svg.h - g.container.h) <= 1,
    `${when}: el SVG (${g.svg.w}x${g.svg.h}) no coincide con el contenedor (${g.container.w}x${g.container.h})`
  )
}

async function openRibbonTab(page, label) {
  await page.click(`.ribbon-tab:has-text("${label}")`)
}

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ acceptDownloads: true })
  const page = await context.newPage()

  const consoleErrors = []
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', err => consoleErrors.push(err.message))
  page.on('dialog', dialog => dialog.accept())
  const run = makeRunner(page)

  // ---- TC1: la página carga sin errores JS y sin banner de error ----
  await run('TC1 - Carga inicial sin errores', async () => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' })
    await page.waitForSelector('text=Mis Mapas', { timeout: 5000 })
    const errorBanner = page.locator('.error-banner')
    assert((await errorBanner.count()) === 0 || !(await errorBanner.isVisible()), 'El banner de error está visible en la carga inicial')
    assert(consoleErrors.length === 0, `Errores de consola detectados: ${consoleErrors.join(' | ')}`)
  })

  // ---- TC2: la lista de mapas se carga desde la API ----
  await run('TC2 - Lista de mapas se carga desde la API', async () => {
    const data = await getAppData(page)
    assert(typeof data.mapsCount === 'number', 'No se pudo leer el estado de Alpine (maps)')
  })

  // ---- TC3: crear un mapa nuevo muestra el nodo raíz ----
  let mapId
  await run('TC3 - Crear mapa nuevo renderiza el nodo raíz', async () => {
    const before = await getAppData(page)
    await page.click('button[title="Nuevo mapa"]')
    await page.waitForFunction(
      prevCount => window.Alpine.$data(document.body).maps.length > prevCount,
      before.mapsCount,
      { timeout: 5000 }
    )
    const data = await getAppData(page)
    mapId = data.currentId
    createdMapIds.add(mapId)
    assert(mapId, 'No se estableció currentId tras crear el mapa')
    assert(!data.errorMsg, `errorMsg no está vacío: ${data.errorMsg}`)

    await page.waitForSelector('.smm-node', { timeout: 5000 })
    const nodeCount = await getMindMapNodeCount(page)
    assert(nodeCount === 1, `Se esperaba 1 nodo raíz, se encontraron ${nodeCount}`)

    const rootText = await page.locator('.smm-node').first().textContent()
    assert(rootText.includes('Tema central'), `Texto del nodo raíz inesperado: "${rootText}"`)
  })

  // ---- TC4: editar el texto del nodo raíz ----
  await run('TC4 - Editar texto del nodo raíz', async () => {
    const root = page.locator('.smm-node').first()
    await root.dblclick()
    const editBox = page.locator('.smm-richtext-node-edit-wrap')
    await editBox.waitFor({ state: 'visible', timeout: 5000 })
    await page.keyboard.press('Control+A')
    await page.keyboard.type('Mi Proyecto')
    await page.keyboard.press('Enter')
    await editBox.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})

    const rootText = await page.locator('.smm-node').first().textContent()
    assert(rootText.includes('Mi Proyecto'), `El texto no se actualizó, contenido actual: "${rootText}"`)
  })

  // ---- TC5: crear un subtema (Tab) ----
  await run('TC5 - Crear subtema con Tab', async () => {
    const before = await getMindMapNodeCount(page)
    await page.locator('.smm-node').first().click()
    await page.keyboard.press('Tab')
    await page.waitForFunction(
      prev => document.querySelectorAll('.smm-node').length > prev,
      before,
      { timeout: 5000 }
    )
    // Confirmar el texto del nuevo nodo hijo para salir del modo edición
    await page.keyboard.type('Subtema 1')
    await page.keyboard.press('Enter')
    const after = await getMindMapNodeCount(page)
    assert(after === before + 1, `Se esperaban ${before + 1} nodos, hay ${after}`)
  })

  // ---- TC6: crear un nodo hermano (Enter en modo selección) ----
  await run('TC6 - Crear nodo hermano con Enter', async () => {
    const before = await getMindMapNodeCount(page)
    // Seleccionar el subtema recién creado (segundo nodo) y crear un hermano
    await page.locator('.smm-node').nth(1).click()
    await page.keyboard.press('Enter')
    await page.waitForFunction(
      prev => document.querySelectorAll('.smm-node').length > prev,
      before,
      { timeout: 5000 }
    )
    await page.keyboard.type('Subtema 2')
    await page.keyboard.press('Enter')
    const after = await getMindMapNodeCount(page)
    assert(after === before + 1, `Se esperaban ${before + 1} nodos, hay ${after}`)
  })

  // ---- TC7: zoom in / out / reset ----
  await run('TC7 - Zoom in/out/reset cambia la escala', async () => {
    const initialScale = await getScale(page)
    await page.click('button[title="Acercar"]')
    await page.waitForTimeout(200)
    const scaleAfterIn = await getScale(page)
    assert(scaleAfterIn > initialScale, `El zoom in no incrementó la escala (${initialScale} -> ${scaleAfterIn})`)

    await page.click('button[title="Alejar"]')
    await page.click('button[title="Alejar"]')
    await page.waitForTimeout(200)
    const scaleAfterOut = await getScale(page)
    assert(scaleAfterOut < scaleAfterIn, `El zoom out no redujo la escala (${scaleAfterIn} -> ${scaleAfterOut})`)

    await page.click('button[title="Restablecer zoom"]')
    await page.waitForTimeout(200)
    const scaleAfterReset = await getScale(page)
    assert(Math.abs(scaleAfterReset - 1) < 0.01, `El reset de zoom no volvió a 1 (quedó en ${scaleAfterReset})`)
  })

  // ---- TC8: deshacer / rehacer ----
  // Se prueba una única acción estructural aislada (crear nodo, sin escribirle texto)
  // para no mezclar el paso de "crear" con el paso de "editar texto", que el motor
  // registra como entradas de historial independientes.
  await run('TC8 - Deshacer y rehacer', async () => {
    const before = await getMindMapNodeCount(page)
    await page.locator('.smm-node').first().click()
    await page.keyboard.press('Tab')
    await page.waitForFunction(
      prev => document.querySelectorAll('.smm-node').length > prev,
      before,
      { timeout: 5000 }
    )
    // Confirmar la creación sin escribir texto: clic en un área vacía del canvas
    await page.mouse.click(300, 600)
    await page.waitForTimeout(300)
    const afterCreate = await getMindMapNodeCount(page)
    assert(afterCreate === before + 1, `No se creó el nodo nuevo (antes ${before}, después ${afterCreate})`)

    await page.click('button[title="Deshacer"]')
    await page.waitForFunction(
      expected => document.querySelectorAll('.smm-node').length === expected,
      before,
      { timeout: 5000 }
    )
    const afterUndo = await getMindMapNodeCount(page)
    assert(afterUndo === before, `Deshacer no eliminó el nodo (quedaron ${afterUndo}, se esperaban ${before})`)

    await page.click('button[title="Rehacer"]')
    await page.waitForFunction(
      expected => document.querySelectorAll('.smm-node').length === expected,
      afterCreate,
      { timeout: 5000 }
    )
    const afterRedo = await getMindMapNodeCount(page)
    assert(afterRedo === afterCreate, `Rehacer no restauró el nodo (quedaron ${afterRedo}, se esperaban ${afterCreate})`)
  })

  // ---- TC9: renombrar el mapa persiste en el backend ----
  await run('TC9 - Renombrar mapa persiste en backend', async () => {
    const titleInput = page.locator('.title-input')
    await titleInput.fill('Mapa de prueba E2E')
    await titleInput.dispatchEvent('change')
    await page.waitForTimeout(500)
    const remote = await fetchMapFromApi(page, mapId)
    assert(remote && remote.title === 'Mapa de prueba E2E', `El título remoto no se actualizó: ${remote && remote.title}`)
  })

  // ---- TC10: autoguardado refleja los cambios del árbol en el backend ----
  await run('TC10 - Autoguardado persiste el árbol en SQLite', async () => {
    await page.waitForTimeout(1200) // esperar el debounce de autoguardado (800ms)
    const remote = await fetchMapFromApi(page, mapId)
    assert(remote, 'No se pudo leer el mapa desde la API')
    const remoteNodeCount = countNodes(remote.data.root)
    const domNodeCount = await getMindMapNodeCount(page)
    assert(
      remoteNodeCount === domNodeCount,
      `Nodos en BD (${remoteNodeCount}) no coincide con nodos en canvas (${domNodeCount})`
    )
    const texts = JSON.stringify(remote.data.root)
    assert(texts.includes('Mi Proyecto'), 'El texto editado del nodo raíz no se persistió')
  })

  // ---- TC11: persistencia entre recargas ----
  await run('TC11 - El mapa persiste tras recargar la página', async () => {
    const beforeReload = await getMindMapNodeCount(page)
    await page.reload({ waitUntil: 'networkidle' })
    await page.click(`.map-list li:has-text("Mapa de prueba E2E")`)
    await page.waitForSelector('.smm-node', { timeout: 5000 })
    const afterReload = await getMindMapNodeCount(page)
    assert(afterReload === beforeReload, `Nodos antes de recargar (${beforeReload}) != después (${afterReload})`)
    const rootText = await page.locator('.smm-node').first().textContent()
    assert(rootText.includes('Mi Proyecto'), 'El texto editado no persistió tras recargar')
  })

  // ---- TC12: exportar PNG y PDF dispara una descarga válida ----
  await run('TC12 - Exportar PNG genera un archivo', async () => {
    await openRibbonTab(page, 'Exportar')
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 10000 }),
      page.click('button:has-text("Exportar PNG")')
    ])
    const filePath = path.join(DOWNLOAD_DIR, download.suggestedFilename())
    await download.saveAs(filePath)
    const stat = fs.statSync(filePath)
    assert(stat.size > 0, 'El archivo PNG exportado está vacío')
    assert(download.suggestedFilename().endsWith('.png'), `Extensión inesperada: ${download.suggestedFilename()}`)
  })

  await run('TC13 - Exportar PDF genera un archivo', async () => {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 10000 }),
      page.click('button:has-text("Exportar PDF")')
    ])
    const filePath = path.join(DOWNLOAD_DIR, download.suggestedFilename())
    await download.saveAs(filePath)
    const stat = fs.statSync(filePath)
    assert(stat.size > 0, 'El archivo PDF exportado está vacío')
    assert(download.suggestedFilename().endsWith('.pdf'), `Extensión inesperada: ${download.suggestedFilename()}`)
  })

  // ---- TC15-TC18: regresión del bug "el lienzo queda tapado/cortado por el panel lateral" ----
  // Causa raíz: el <svg> del mapa se dimensionaba antes de que se mostraran la barra de
  // herramientas y el panel de iconos, y nunca se volvía a ajustar.
  await run('TC15 - [Regresión] El SVG del mapa mide lo mismo que su contenedor', async () => {
    assertSvgFitsContainer(await getCanvasGeometry(page), 'Tras abrir el mapa')
  })

  await run('TC16 - [Regresión] Editar nodos no desplaza la página', async () => {
    await page.locator('.smm-node').first().click()
    await page.keyboard.press('Tab')
    await page.keyboard.type('Nodo de scroll')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(300)
    const g = await getCanvasGeometry(page)
    assert(g.scrollY === 0 && g.scrollX === 0, `La página se desplazó (scrollX=${g.scrollX}, scrollY=${g.scrollY})`)
    assert(g.docH <= g.winH, `El documento (${g.docH}px) es más alto que la ventana (${g.winH}px)`)
    await page.click('button[title="Deshacer"]')
    await page.click('button[title="Deshacer"]')
  })

  await run('TC17 - [Regresión] Abrir/cerrar el panel lateral reajusta el lienzo', async () => {
    const before = await getCanvasGeometry(page)
    await page.click('button[title="Cerrar panel"]')
    await page.waitForTimeout(300)
    const closed = await getCanvasGeometry(page)
    assert(closed.container.w > before.container.w, 'El lienzo no se ensanchó al cerrar el panel')
    assertSvgFitsContainer(closed, 'Con el panel cerrado')

    await page.click('.task-strip-tab:has-text("Marcadores")')
    await page.waitForTimeout(300)
    const reopened = await getCanvasGeometry(page)
    assert(reopened.container.w === before.container.w, 'El lienzo no recuperó su ancho al reabrir el panel')
    assertSvgFitsContainer(reopened, 'Con el panel de marcadores abierto')

    // El panel de marcadores no debe solaparse con el lienzo
    const overlap = await page.evaluate(() => {
      const canvas = document.querySelector('.canvas-wrap').getBoundingClientRect()
      const pane = document.querySelector('.task-pane').getBoundingClientRect()
      return canvas.right - pane.left
    })
    assert(overlap <= 0, `El panel se solapa ${overlap}px sobre el lienzo`)
  })

  await run('TC18 - [Regresión] Redimensionar la ventana reajusta el lienzo', async () => {
    const original = page.viewportSize()
    await page.setViewportSize({ width: 1000, height: 600 })
    await page.waitForTimeout(300)
    assertSvgFitsContainer(await getCanvasGeometry(page), 'Ventana 1000x600')
    await page.setViewportSize(original)
    await page.waitForTimeout(300)
    assertSvgFitsContainer(await getCanvasGeometry(page), 'Ventana restaurada')
  })

  // ---- TC19: marcadores (iconos) ----
  await run('TC19 - Asignar y quitar un marcador a un nodo', async () => {
    const firstIcon = page.locator('.task-pane .icon-btn').first()
    // Sin nodo seleccionado los marcadores están deshabilitados
    await page.mouse.click(300, 600)
    await page.waitForTimeout(200)
    assert(await firstIcon.isDisabled(), 'Los marcadores deberían estar deshabilitados sin selección')

    await page.locator('.smm-node').first().click()
    await page.waitForTimeout(200)
    const iconId = await firstIcon.getAttribute('title')
    await firstIcon.click()
    const hasIcon = () => page.evaluate(id => {
      const node = window.Alpine.$data(document.body).activeNodeList[0]
      return (node.getData('icon') || []).includes(id)
    }, iconId)
    assert(await hasIcon(), `El nodo no recibió el marcador ${iconId}`)
    await firstIcon.click()
    assert(!(await hasIcon()), `El marcador ${iconId} no se quitó del nodo`)
  })

  // ---- TC20: botones de la cinta para insertar/eliminar temas ----
  await run('TC20 - Cinta: Subtema, Tema y Eliminar', async () => {
    await openRibbonTab(page, 'Inicio')
    await page.mouse.click(300, 600)
    await page.waitForTimeout(200)
    const sub = page.locator('.rb-large:has-text("Subtema")')
    assert(await sub.isDisabled(), 'Subtema debería estar deshabilitado sin selección')

    const before = await getMindMapNodeCount(page)
    await page.locator('.smm-node').first().click()
    await sub.click()
    await page.waitForFunction(n => document.querySelectorAll('.smm-node').length === n + 1, before, { timeout: 5000 })
    await page.keyboard.press('Escape')

    // El nodo recién creado queda activo: insertar un hermano y luego eliminar ambos
    await page.locator('.rb-large:has-text("Tema")').first().click()
    await page.waitForFunction(n => document.querySelectorAll('.smm-node').length === n + 2, before, { timeout: 5000 })
    await page.keyboard.press('Escape')
    await page.locator('.rb-large:has-text("Eliminar")').click()
    await page.waitForFunction(n => document.querySelectorAll('.smm-node').length === n + 1, before, { timeout: 5000 })
    await page.click('button[title="Deshacer"]')
    await page.click('button[title="Deshacer"]')
    await page.click('button[title="Deshacer"]')
    await page.waitForFunction(n => document.querySelectorAll('.smm-node').length === n, before, { timeout: 5000 })
  })

  // ---- TC21: diseño radial / árbol ----
  await run('TC21 - Cambiar diseño Radial/Árbol y persistirlo', async () => {
    await page.click('.rb-large:has-text("Árbol")')
    await page.waitForTimeout(1200)
    let remote = await fetchMapFromApi(page, mapId)
    assert(remote.data.layout === 'logicalStructure', `Layout guardado inesperado: ${remote.data.layout}`)
    await page.click('.rb-large:has-text("Radial")')
    await page.waitForTimeout(1200)
    remote = await fetchMapFromApi(page, mapId)
    assert(remote.data.layout === 'mindMap', `Layout guardado inesperado: ${remote.data.layout}`)
    assert(await page.locator('.rb-large.pressed:has-text("Radial")').count() === 1, 'El botón Radial no aparece pulsado')
  })

  // ---- TC22: zoom en la barra de estado ----
  await run('TC22 - Barra de estado refleja y controla el zoom', async () => {
    await page.click('button[title="Restablecer zoom"]')
    await page.waitForTimeout(200)
    assert((await page.locator('.zoom-value').textContent()).trim() === '100%', 'El zoom no muestra 100% tras restablecer')
    await page.click('button[title="Acercar"]')
    await page.waitForTimeout(200)
    const label = (await page.locator('.zoom-value').textContent()).trim()
    assert(label !== '100%' && parseInt(label) > 100, `El indicador no se actualizó al acercar: ${label}`)

    await page.locator('.zoom-slider').fill('50')
    await page.waitForTimeout(200)
    const scale = await getScale(page)
    assert(Math.abs(scale - 0.5) < 0.01, `El slider no aplicó el zoom (escala ${scale})`)
    await page.click('button[title="Restablecer zoom"]')
  })

  // ---- TC23: tema MindManager por defecto ----
  await run('TC23 - Mapas nuevos usan el tema mindmanager y layout radial', async () => {
    await page.waitForTimeout(1200)
    const remote = await fetchMapFromApi(page, mapId)
    assert(remote.data.theme.template === 'mindmanager', `Tema guardado inesperado: ${remote.data.theme.template}`)
    const theme = await page.evaluate(() => {
      const cfg = window.Alpine.$data(document.body).mindMap.themeConfig
      return { root: cfg.root.startColor, second: cfg.second.fillColor, line: cfg.lineStyle }
    })
    assert(theme.second === '#7dc142' && theme.line === 'curve', `El tema aplicado no es el esperado: ${JSON.stringify(theme)}`)
  })

  // ---- TC24: compatibilidad con mapas creados antes del rediseño ----
  await run('TC24 - Un mapa antiguo (tema default) se abre con el nuevo tema', async () => {
    const legacyId = await page.evaluate(async () => {
      const res = await fetch('/api/maps', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Mapa legado E2E' })
      })
      const map = await res.json()
      await fetch(`/api/maps/${map.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { layout: 'logicalStructure', root: { data: { text: 'Legado' }, children: [] }, theme: { template: 'default', config: {} }, view: {} } })
      })
      return map.id
    })
    createdMapIds.add(legacyId)
    await page.click('.task-strip-tab:has-text("Mis mapas")')
    await page.evaluate(() => window.Alpine.$data(document.body).loadMapList())
    await page.click('.map-list li:has-text("Mapa legado E2E")')
    await page.waitForFunction(() => document.querySelector('.smm-node') && document.querySelector('.smm-node').textContent.includes('Legado'), null, { timeout: 5000 })
    const applied = await page.evaluate(() => window.Alpine.$data(document.body).mindMap.themeConfig.second.fillColor)
    assert(applied === '#7dc142', `El mapa legado no usa el tema nuevo (second.fillColor=${applied})`)
    assertSvgFitsContainer(await getCanvasGeometry(page), 'Mapa legado')
  })

  // ---- TC14: eliminar un mapa lo quita de la lista y del backend ----
  await run('TC14 - Eliminar mapa lo remueve de la lista y del backend', async () => {
    if (!(await page.locator('.map-list').isVisible())) await page.click('.task-strip-tab:has-text("Mis mapas")')
    const idToDelete = mapId
    const li = page.locator(`.map-list li:has-text("Mapa de prueba E2E")`)
    await li.locator('button.btn-icon').click()
    await page.waitForFunction(
      title => !document.body.innerText.includes(title),
      'Mapa de prueba E2E',
      { timeout: 5000 }
    )
    createdMapIds.delete(idToDelete)
    const remote = await fetchMapFromApi(page, idToDelete)
    assert(remote === null, 'El mapa eliminado todavía existe en el backend')
  })

  // ---- limpieza: borrar cualquier mapa de prueba que haya quedado ----
  for (const id of createdMapIds) {
    await page.evaluate(async id => {
      await fetch(`/api/maps/${id}`, { method: 'DELETE' })
    }, id).catch(() => {})
  }

  await browser.close()

  console.log('\n--- Resumen ---')
  const passed = results.filter(r => r.status === 'PASS').length
  const failed = results.filter(r => r.status === 'FAIL').length
  results.forEach(r => {
    console.log(`${r.status === 'PASS' ? '✅' : '❌'} ${r.name}${r.error ? ' :: ' + r.error : ''}`)
  })
  console.log(`\nTotal: ${results.length}  Pass: ${passed}  Fail: ${failed}`)
  process.exit(failed > 0 ? 1 : 0)
})()
