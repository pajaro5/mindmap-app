// Fixtures compartidas por todas las pruebas e2e.
//  - pageErrors: recoge errores JS y de consola; la prueba falla si queda alguno.
//  - maps:       crea mapas vía API con título único y los borra al terminar.
//  - app:        página con la app cargada (page object AppPage).
//  - openMap:    crea un mapa, carga la app y lo abre; devuelve { app, map }.
const base = require('@playwright/test')
const { expect } = base

class AppPage {
  constructor(page) {
    this.page = page
    this.nodes = page.locator('#mindMapContainer .smm-node')
    this.rootNode = this.nodes.first()
    this.titleInput = page.locator('.title-input')
    this.errorBanner = page.locator('.error-banner')
    this.mapList = page.locator('.map-list')
    this.zoomValue = page.locator('.zoom-value')
    this.zoomSlider = page.locator('.zoom-slider')
    this.editBox = page.locator('.smm-richtext-node-edit-wrap')
    this.menu = page.locator('.ribbon-menu')
  }

  // Escribe el texto del tema que se acaba de crear (Tab, Enter, Shift+Enter…). Hay que
  // esperar a que se abra el cuadro de edición: la librería lo abre tras renderizar, y si
  // se teclea antes el texto se pierde (pasaba en CI, con máquinas más lentas).
  async typeNewTopic(text) {
    await expect(this.editBox).toBeVisible()
    await this.page.keyboard.type(text)
    await this.page.keyboard.press('Enter')
    await expect(this.editBox).toBeHidden()
  }

  // Abre el menú desplegable de un botón dividido de la cinta y elige una opción
  async chooseFromMenu(tabId, ownerCmd, itemCmd) {
    await this.ribbonTab(tabId).click()
    await this.ribbonPanel(tabId).locator(`[data-menu-for="${ownerCmd}"]`).click()
    await expect(this.menu).toBeVisible()
    await this.menu.locator(`[data-cmd="${itemCmd}"]`).click()
    await expect(this.menu).toBeHidden()
  }

  nodeTexts() {
    return this.nodes.locator('.smm-richtext-node-wrap, .smm-text-node-wrap').allTextContents()
  }

  // Tema cuyo texto visible es exactamente `text`. Se mira solo el texto del tema (el
  // foreignObject), no el <title> de vínculos o adjuntos, que también aporta texto al nodo.
  node(text) {
    return this.nodes.filter({ has: this.page.locator('foreignObject').getByText(text, { exact: true }) })
  }

  async selectNode(text) {
    await this.node(text).click()
    await this.page.waitForFunction(t => {
      const list = window.Alpine.$data(document.body).activeNodeList
      return list.length === 1 && list[0].getData('text').replace(/<[^>]+>/g, '').trim() === t
    }, text)
  }

  // Árbol del mapa como { t: texto, c: [hijos] }, sin etiquetas HTML del texto enriquecido
  tree() {
    return this.page.evaluate(() => {
      const strip = s => String(s).replace(/<[^>]+>/g, '').trim()
      const walk = n => ({ t: strip(n.data.text), c: (n.children || []).map(walk) })
      return walk(window.Alpine.$data(document.body).mindMap.getData())
    })
  }

  // Valor de una propiedad de estilo guardada en los datos del tema con ese texto
  nodeData(text, prop) {
    return this.page.evaluate(({ text, prop }) => {
      const strip = s => String(s).replace(/<[^>]+>/g, '').trim()
      const find = n => !n ? null : strip(n.getData('text')) === text ? n : (n.children || []).map(find).find(Boolean)
      const node = find(window.Alpine.$data(document.body).mindMap.renderer.root)
      return node ? node.getData(prop) : undefined
    }, { text, prop })
  }

  // Imagen de un tema resuelta a su data URL (el plugin nodeBase64ImageStorage guarda una
  // clave en el tema y la imagen en root.data.imgMap)
  nodeImage(text) {
    return this.page.evaluate(text => {
      const strip = s => String(s).replace(/<[^>]+>/g, '').trim()
      const mm = window.Alpine.$data(document.body).mindMap
      const find = n => !n ? null : strip(n.getData('text')) === text ? n : (n.children || []).map(find).find(Boolean)
      const node = find(mm.renderer.root)
      const value = node && node.getData('image')
      if (!value) return undefined
      const imgMap = mm.renderer.root.getData('imgMap') || {}
      return imgMap[value] || value
    }, text)
  }

  // Aplica un estilo a un tema a través del comando de la librería (queda en el historial)
  setNodeStyle(text, prop, value) {
    return this.page.evaluate(({ text, prop, value }) => {
      const strip = s => String(s).replace(/<[^>]+>/g, '').trim()
      const mm = window.Alpine.$data(document.body).mindMap
      const find = n => !n ? null : strip(n.getData('text')) === text ? n : (n.children || []).map(find).find(Boolean)
      mm.execCommand('SET_NODE_STYLE', find(mm.renderer.root), prop, value)
    }, { text, prop, value })
  }

  isPainterActive() {
    return this.page.evaluate(() => window.Alpine.$data(document.body).painterActive)
  }

  // Cómo se ve un tema: relleno y borde de su forma y estilo de texto del foreignObject
  nodeRender(text) {
    return this.page.evaluate(text => {
      const strip = s => String(s).replace(/<[^>]+>/g, '').trim()
      const mm = window.Alpine.$data(document.body).mindMap
      const find = n => !n ? null : strip(n.getData('text')) === text ? n : (n.children || []).map(find).find(Boolean)
      const found = find(mm.renderer.root)
      // A mitad de un render la librería deja huecos: devolver null para que expect.poll reintente
      if (!found || !found.group || !found.shapeNode) return null
      const node = Alpine.raw(found)
      const fo = node.group.node.querySelector('foreignObject')
      const cs = getComputedStyle(fo)
      return {
        fill: node.shapeNode.node.getAttribute('fill'),
        stroke: node.shapeNode.node.getAttribute('stroke'),
        strokeWidth: node.shapeNode.node.getAttribute('stroke-width'),
        fontFamily: cs.fontFamily,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        fontStyle: cs.fontStyle,
        textDecoration: fo.style.textDecoration,
        color: cs.color,
        textAlign: cs.textAlign
      }
    }, text)
  }

  // Selección múltiple con Ctrl+clic
  async selectNodes(...texts) {
    await this.selectNode(texts[0])
    await this.page.keyboard.down('Control')
    for (const t of texts.slice(1)) await this.node(t).click()
    await this.page.keyboard.up('Control')
    await this.page.waitForFunction(n => window.Alpine.$data(document.body).activeNodeList.length === n, texts.length)
  }

  async pickColor(cmd, color) {
    await this.ribbonPanel('home').locator(`[data-menu-for="${cmd}"]`).click()
    await expect(this.menu).toBeVisible()
    await this.menu.locator(`[data-color="${color}"]`).click()
    await expect(this.menu).toBeHidden()
  }

  // Ejecuta `trigger` (que abre el selector de archivos) y entrega el archivo indicado
  async chooseFile(trigger, file) {
    const [chooser] = await Promise.all([this.page.waitForEvent('filechooser'), trigger()])
    await chooser.setFiles(file)
  }

  // Genera en el navegador un PNG de w×h y lo devuelve como Buffer
  async makePng(w, h) {
    const b64 = await this.page.evaluate(([w, h]) => {
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const ctx = c.getContext('2d')
      ctx.fillStyle = '#3d8fd8'
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#7dc142'
      ctx.fillRect(0, 0, w / 2, h / 2)
      return c.toDataURL('image/png').split(',')[1]
    }, [w, h])
    return Buffer.from(b64, 'base64')
  }

  // Clic en el punto medio de la relación `index` (su trazo ancho e invisible para clics)
  async clickRelationship(index = 0) {
    const pt = await this.page.evaluate(i => {
      const plugin = window.Alpine.$data(document.body).mindMap.associativeLine
      const path = plugin.lineList[i][1].node
      const p = path.getPointAtLength(path.getTotalLength() / 2)
      const m = path.getScreenCTM()
      return { x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f }
    }, index)
    await this.page.mouse.click(pt.x, pt.y)
    await this.page.waitForFunction(() => window.Alpine.$data(document.body).relationshipActive)
  }

  relationshipCount() {
    return this.page.evaluate(() => window.Alpine.$data(document.body).mindMap.associativeLine.lineList.length)
  }

  // Clic en el margen izquierdo del límite `index` (fuera de los temas que rodea)
  async clickBoundary(index = 0) {
    const rect = this.page.locator('.smm-outer-frame-container > rect').nth(index)
    const box = await rect.boundingBox()
    await this.page.mouse.click(box.x + 4, box.y + box.height / 2)
    await this.page.waitForFunction(() => window.Alpine.$data(document.body).boundaryActive)
  }

  historyIndex() {
    return this.page.evaluate(() => window.Alpine.$data(document.body).mindMap.command.activeHistoryIndex)
  }

  // simple-mind-map registra el historial con un retardo (addHistoryTime = 100 ms) y funde
  // los cambios que caen en esa ventana. Antes de deshacer hay que esperar a que la acción
  // haya creado su entrada; si no, "Deshacer" revierte la entrada anterior (pasaba en CI).
  async recordsHistory(action) {
    const before = await this.historyIndex()
    await action()
    await expect.poll(() => this.historyIndex(), { message: 'la acción debe crear una entrada de historial' }).toBeGreaterThan(before)
  }

  async goto() {
    await this.page.goto('/')
    await this.page.waitForFunction(() => window.Alpine && window.Alpine.$data(document.body).ribbon.tabs.length > 0)
  }

  // ---- Localizadores por comando (atributo data-cmd generado desde el registro) ----
  ribbonTab(tabId) { return this.page.locator(`.ribbon-tab[data-tab="${tabId}"]`) }
  ribbonPanel(tabId) { return this.page.locator(`.ribbon-panel[data-tab-panel="${tabId}"]`) }
  ribbonCmd(tabId, cmd) { return this.ribbonPanel(tabId).locator(`[data-cmd="${cmd}"]`) }
  qat(cmd) { return this.page.locator(`.qat [data-cmd="${cmd}"]`) }
  status(cmd) { return this.page.locator(`.statusbar [data-cmd="${cmd}"]`) }
  strip(cmd) { return this.page.locator(`.task-strip [data-cmd="${cmd}"]`) }

  async clickRibbon(tabId, cmd) {
    await this.ribbonTab(tabId).click()
    await this.ribbonCmd(tabId, cmd).click()
  }

  // ---- Estado de la app ----
  state() {
    return this.page.evaluate(() => {
      const d = window.Alpine.$data(document.body)
      return {
        currentId: d.currentId,
        currentTitle: d.currentTitle,
        mapsCount: d.maps.length,
        errorMsg: d.errorMsg,
        pane: d.pane,
        layout: d.currentLayout,
        activeCount: d.activeNodeList.length
      }
    })
  }

  scale() {
    return this.page.evaluate(() => window.Alpine.$data(document.body).mindMap.view.scale)
  }

  async nodeCount() {
    return this.nodes.count()
  }

  async expectNodeCount(n) {
    await expect(this.nodes).toHaveCount(n)
  }

  // ---- Acciones ----
  async showMapsPane() {
    if (!(await this.mapList.isVisible())) await this.strip('pane.maps').click()
    await expect(this.mapList).toBeVisible()
  }

  async openMapByTitle(title) {
    await this.showMapsPane()
    await this.page.locator('.map-list li', { hasText: title }).click()
    await expect(this.rootNode).toBeVisible()
    // Esperar también a la entrada inicial del historial (llega con 100 ms de retardo); si la
    // prueba cambia algo antes, ese cambio se funde con el estado inicial y no se puede deshacer
    await this.page.waitForFunction(() => {
      const mm = window.Alpine.$data(document.body).mindMap
      return !!mm && mm.command.history.length > 0
    })
  }

  async selectRoot() {
    await this.rootNode.click()
    await this.page.waitForFunction(() => window.Alpine.$data(document.body).activeNodeList.length > 0)
  }

  // Clic en una zona vacía del lienzo (esquina superior izquierda) para deseleccionar
  async clickEmptyCanvas() {
    const box = await this.page.locator('#mindMapContainer').boundingBox()
    await this.page.mouse.click(box.x + 15, box.y + 15)
    await this.page.waitForFunction(() => window.Alpine.$data(document.body).activeNodeList.length === 0)
  }

  // Compara el <svg> del mapa con su contenedor y el scroll del documento
  geometry() {
    return this.page.evaluate(() => {
      const el = document.getElementById('mindMapContainer')
      const svg = el.querySelector(':scope > svg')
      const c = el.getBoundingClientRect()
      const s = svg ? svg.getBoundingClientRect() : { width: -1, height: -1 }
      return {
        container: { w: Math.round(c.width), h: Math.round(c.height) },
        svg: { w: Math.round(s.width), h: Math.round(s.height) },
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        docH: document.documentElement.scrollHeight,
        winH: window.innerHeight
      }
    })
  }

  async expectSvgFitsContainer() {
    await expect.poll(async () => {
      const g = await this.geometry()
      return Math.abs(g.svg.w - g.container.w) <= 1 && Math.abs(g.svg.h - g.container.h) <= 1
    }, { message: 'el SVG del mapa debe medir lo mismo que su contenedor' }).toBe(true)
  }
}

// Sustituye navigator.clipboard por un portapapeles falso controlable desde la prueba:
//   window.__clipboard.text      contenido de texto del "sistema"
//   window.__clipboard.denyRead  true = el navegador deniega la lectura (permiso denegado)
// Así las pruebas no dependen de los permisos del navegador sin interfaz.
async function installFakeClipboard(page, { denyRead = false } = {}) {
  await page.addInitScript(denyRead => {
    window.__clipboard = { text: null, denyRead, reads: 0 }
    const fake = {
      writeText: async text => { window.__clipboard.text = text },
      readText: async () => window.__clipboard.text || '',
      read: async () => {
        window.__clipboard.reads++
        if (window.__clipboard.denyRead) throw new DOMException('Lectura denegada', 'NotAllowedError')
        const text = window.__clipboard.text
        if (!text) return []
        return [{ types: ['text/plain'], getType: async () => new Blob([text], { type: 'text/plain' }) }]
      },
      write: async () => {}
    }
    Object.defineProperty(navigator, 'clipboard', { value: fake, configurable: true })
  }, denyRead)
}

// Mapa de ejemplo con nombres únicos para localizar temas sin ambigüedad
const SAMPLE_TREE = {
  layout: 'logicalStructure',
  root: {
    data: { text: 'Raíz' },
    children: [
      { data: { text: 'Alfa' }, children: [{ data: { text: 'Alfa uno' }, children: [] }] },
      { data: { text: 'Beta' }, children: [] },
      { data: { text: 'Gamma' }, children: [] }
    ]
  },
  theme: { template: 'mindmanager', config: {} },
  view: {}
}

// Crea un mapa con `data`, ejecuta `beforeGoto(page)` (p. ej. instalar el portapapeles
// falso) y lo abre en la app
async function setupMap(page, maps, { data = SAMPLE_TREE, beforeGoto } = {}) {
  const map = await maps.create({ data })
  if (beforeGoto) await beforeGoto(page)
  const app = new AppPage(page)
  await app.goto()
  await app.openMapByTitle(map.title)
  return { app, map }
}

function uniqueTitle(testInfo, prefix = 'E2E') {
  return `${prefix} ${testInfo.project.name} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

const test = base.test.extend({
  // Depende de `maps` a propósito: así se desmonta ANTES que `maps`. Si los mapas se
  // borraran primero, el autoguardado pendiente de la página haría un PUT a un mapa ya
  // eliminado (404) y contaminaría la comprobación de errores.
  pageErrors: [async ({ page, maps }, use) => {
    const errors = []
    page.on('pageerror', err => errors.push(err.message))
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })
    page.on('dialog', dialog => dialog.accept())
    await use(errors)
    expect(errors, 'No debe haber errores JS ni de consola').toEqual([])
    // Salir de la app detiene su autoguardado antes de borrar los mapas. No se usa
    // page.close(): cerrar la página a mano deja Firefox en mal estado al cerrar el contexto.
    await page.goto('about:blank')
  }, { auto: true }],

  maps: async ({ request }, use, testInfo) => {
    const ids = new Set()
    const api = {
      async create({ title = uniqueTitle(testInfo), data } = {}) {
        const res = await request.post('/api/maps', { data: { title } })
        expect(res.status()).toBe(201)
        const map = await res.json()
        ids.add(map.id)
        if (data) {
          const put = await request.put(`/api/maps/${map.id}`, { data: { data } })
          expect(put.ok()).toBeTruthy()
        }
        return map
      },
      async get(id) {
        const res = await request.get(`/api/maps/${id}`)
        return res.ok() ? res.json() : null
      },
      track(id) { ids.add(id) },
      forget(id) { ids.delete(id) }
    }
    await use(api)
    for (const id of ids) await request.delete(`/api/maps/${id}`)
  },

  app: async ({ page }, use) => {
    const app = new AppPage(page)
    await app.goto()
    await use(app)
  },

  openMap: async ({ page, maps }, use) => {
    const map = await maps.create()
    const app = new AppPage(page)
    await app.goto()
    await app.openMapByTitle(map.title)
    await use({ app, map })
  }
})

module.exports = { test, expect, AppPage, uniqueTitle, installFakeClipboard, setupMap, SAMPLE_TREE }
