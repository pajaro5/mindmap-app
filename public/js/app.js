const MindMapCtor = (typeof simpleMindMap !== 'undefined' && (simpleMindMap.default || simpleMindMap)) || null

const ICON_CATEGORY_LABELS = {
  priority: 'Prioridad',
  progress: 'Progreso',
  expression: 'Emojis',
  sign: 'Marcas'
}

// Tema visual inspirado en MindManager: tema central azul, temas principales verdes
// con texto blanco y subtemas como texto sobre ramas curvas grises.
// Se registra como tema con nombre para que en la BD solo se guarde "mindmanager" y
// las personalizaciones del usuario, no una copia completa de estos valores.
const THEME_NAME = 'mindmanager'
const FONT = 'Segoe UI, Tahoma, Arial, sans-serif'
const MINDMANAGER_THEME = {
  backgroundColor: '#ffffff',
  lineColor: '#b9b9b9',
  lineWidth: 2,
  lineStyle: 'curve',
  rootLineKeepSameInCurve: false,
  generalizationLineColor: '#9ab7d8',
  iconSize: 18,
  paddingX: 14,
  paddingY: 6,
  root: {
    shape: 'rectangle',
    fontFamily: FONT,
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
    fillColor: '#3d8fd8',
    gradientStyle: true,
    startColor: '#6db2f0',
    endColor: '#2b6fbd',
    startDir: [0, 0],
    endDir: [0, 1],
    borderColor: '#24609f',
    borderWidth: 1,
    borderRadius: 14,
    paddingX: 34,
    paddingY: 22,
    lineWidth: 5,
    textAlign: 'center'
  },
  second: {
    shape: 'rectangle',
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ffffff',
    fillColor: '#7dc142',
    gradientStyle: true,
    startColor: '#a3d86a',
    endColor: '#66ab2c',
    startDir: [0, 0],
    endDir: [0, 1],
    borderColor: '#57962a',
    borderWidth: 1,
    borderRadius: 9,
    paddingX: 18,
    paddingY: 10,
    marginX: 90,
    marginY: 34,
    lineWidth: 2
  },
  node: {
    fontFamily: FONT,
    fontSize: 12,
    fontWeight: 'bold',
    color: '#2b2b2b',
    fillColor: 'transparent',
    borderWidth: 0,
    marginX: 44,
    marginY: 4,
    lineWidth: 1
  },
  generalization: {
    fontFamily: FONT,
    fontSize: 12,
    color: '#1d4f8a',
    fillColor: '#eaf3fd',
    borderColor: '#9ab7d8',
    borderWidth: 1,
    borderRadius: 6
  }
}

if (MindMapCtor && typeof MindMapCtor.defineTheme === 'function') {
  MindMapCtor.defineTheme(THEME_NAME, MINDMANAGER_THEME)
}

function buildIconCategories() {
  if (!MindMapCtor || !Array.isArray(MindMapCtor.iconList)) return []
  return MindMapCtor.iconList.map(cat => ({
    type: cat.type,
    label: ICON_CATEGORY_LABELS[cat.type] || cat.name,
    items: cat.list.map(item => ({
      id: `${cat.type}_${item.name}`,
      svg: item.icon
    }))
  }))
}

// Espera a que el navegador haya aplicado el layout pendiente (tras cambios de Alpine)
function nextFrame() {
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
}

function mindMapApp() {
  return {
    maps: [],
    currentId: null,
    currentTitle: '',
    mindMap: null,
    saveStatus: '',
    saveTimer: null,
    errorMsg: '',
    currentLayout: 'mindMap',
    activeNodeList: [],
    iconCategories: [],
    zoomPercent: 100,
    ribbon: { tabs: [], quickAccess: [], problems: [] },
    ribbonTab: 'home',
    pane: 'maps',
    logo: BRAIN_LOGO,
    painterActive: false,
    // Desplegable abierto de la cinta o null:
    //   { owner, kind: 'commands' | 'palette' | 'options', items, x, y }
    menu: null,
    colorPalette: COLOR_PALETTE,
    shapeIcons: SHAPE_ICONS,
    // Último color usado por cada botón de color (el botón principal lo vuelve a aplicar)
    lastColors: { 'format.fillColor': '#ffff00', 'format.borderColor': '#c00000', 'format.fontColor': '#c00000' },
    // Cambia en cada render del mapa; `selection` lo lee para recalcular el estilo del tema
    // activo (los estilos viven en simple-mind-map, fuera de la reactividad de Alpine)
    renderTick: 0,

    get hasActiveNode() {
      return this.activeNodeList.length > 0
    },

    // Estilo efectivo (propio o heredado del tema) del primer tema seleccionado
    get activeStyle() {
      void this.renderTick
      // Nodo sin el proxy de Alpine: style.merge() escribe node.effectiveStyles, y hacerlo
      // sobre un proxy reactivo dentro de un getter dispararía reactividad en bucle
      const node = this.activeNodeList[0] && Alpine.raw(this.activeNodeList[0])
      if (!node) return {}
      const read = prop => node.style.merge(prop)
      return {
        fontFamily: read('fontFamily'),
        fontSize: read('fontSize'),
        fontWeight: read('fontWeight'),
        fontStyle: read('fontStyle'),
        textDecoration: read('textDecoration'),
        color: read('color'),
        fillColor: read('fillColor'),
        borderColor: read('borderColor'),
        textAlign: read('textAlign'),
        shape: read('shape')
      }
    },

    // Estado de selección centralizado: lo único que consultan los comandos para decidir
    // si están habilitados o pulsados. Las fases siguientes añadirán aquí los estilos del
    // tema activo (fuente, negrita…) para reflejarlos en la cinta.
    get selection() {
      return {
        hasMap: !!this.currentId && !!this.mindMap,
        hasActiveNode: this.activeNodeList.length > 0,
        hasNonRootActiveNode: this.activeNodeList.some(node => !node.isRoot),
        activeCount: this.activeNodeList.length,
        style: this.activeStyle,
        painterActive: this.painterActive,
        layout: this.currentLayout,
        pane: this.pane
      }
    },

    isEnabled(id) { return CommandRegistry.isEnabled(id, this.selection) },
    isPressed(id) { return CommandRegistry.isPressed(id, this.selection) },
    tooltipOf(id) { return CommandRegistry.tooltip(id) },
    labelOf(id) { return CommandRegistry.get(id).label },
    menuLabelOf(id) { return CommandRegistry.menuLabel(id) },
    shortcutOf(id) { return CommandRegistry.shortcut(id) },
    iconOf(id) { return CommandRegistry.icon(id) },
    controlOf(id) { return CommandRegistry.get(id).control || null },
    optionsOf(id) { return CommandRegistry.options(id, this.selection) },
    currentValueOf(id) { return CommandRegistry.value(id, this.selection) },

    // Opciones de un selector como HTML, con `selected` en la actual. Se genera entero (x-html)
    // porque con x-for + :selected Alpine volvía a pintar las opciones después de fijar el
    // valor y el selector quedaba vacío. Sin tema seleccionado se muestra vacío.
    selectOptionsHtml(id) {
      const enabled = this.isEnabled(id)
      const current = enabled ? String(this.currentValueOf(id) ?? '') : ''
      const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
      const options = this.optionsOf(id).map(o =>
        `<option value="${esc(o.value)}"${String(o.value) === current ? ' selected' : ''}>${esc(o.label)}</option>`)
      if (!enabled) options.unshift('<option value="" selected></option>')
      return options.join('')
    },

    runCommand(id, value) {
      this.menu = null
      try {
        const result = CommandRegistry.run(id, this, value)
        // Algunos comandos son asíncronos (p. ej. Pegar lee el portapapeles)
        if (result && typeof result.catch === 'function') {
          result.catch(err => this.reportCommandError(id, err))
        }
      } catch (err) {
        this.reportCommandError(id, err)
      }
    },

    reportCommandError(id, err) {
      console.error(err)
      this.errorMsg = `No se pudo ejecutar "${this.labelOf(id)}": ${err.message || err}`
    },

    // ---- Desplegables de la cinta ----
    // El menú se pinta fuera de la cinta (position: fixed) porque la cinta recorta su
    // contenido para poder desplazarse en pantallas estrechas.
    toggleMenu(owner, items, event, kind = 'commands') {
      if (this.menu && this.menu.owner === owner) {
        this.menu = null
        return
      }
      // Posicionar respecto al control completo (botón + flecha), no solo a la flecha
      const anchor = event.currentTarget.closest('.rb-item, .rb-color') || event.currentTarget
      const rect = anchor.getBoundingClientRect()
      this.menu = { owner, kind, items, x: Math.round(rect.left), y: Math.round(rect.bottom + 2) }
      this.$nextTick(() => {
        const first = document.querySelector('.ribbon-menu [role="menuitem"]:not([disabled]), .ribbon-menu [role="menuitemradio"]:not([disabled])')
        if (first) first.focus()
      })
    },

    closeMenu() {
      this.menu = null
    },

    // ---- Formato ----
    // `style` puede ser un objeto o una función (tema) => objeto, para cambios relativos
    applyStyle(style) {
      if (!this.mindMap || !this.hasActiveNode) return
      this.mindMap.execCommand('SET_ACTIVE_NODES_STYLE', style)
    },

    // Alterna una propiedad según el estado del primer tema seleccionado (como Office):
    // si está activa se desactiva en todos los seleccionados, y si no, se activa en todos
    toggleStyle(prop, onValue, offValue, isOn) {
      this.applyStyle({ [prop]: isOn(this.selection) ? offValue : onValue })
    },

    toggleDecoration(part) {
      this.applyStyle({ textDecoration: toggleDecorationValue(this.selection.style.textDecoration, part) })
    },

    // Botón principal de un color: vuelve a aplicar el último color elegido
    applyLastColor(cmd) {
      this.runCommand(cmd, this.lastColors[cmd])
    },

    // Elección desde la paleta: `null` = Automático (estilo del tema)
    chooseColor(cmd, color) {
      if (color) this.lastColors[cmd] = color
      this.runCommand(cmd, color)
    },

    // ---- Copiar formato ----
    togglePainter() {
      const painter = this.mindMap && this.mindMap.painter
      if (!painter) return
      if (painter.isInPainter) painter.onEndPainter()
      else painter.startPainter()
    },

    async init() {
      window.addEventListener('error', e => {
        this.errorMsg = 'Error JS: ' + e.message
      })
      window.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return
        if (this.menu) this.closeMenu()
        if (this.painterActive) this.togglePainter()
      })
      this.ribbon = buildRibbon()
      if (this.ribbon.problems.length) {
        console.error('Configuración de la cinta inválida:', this.ribbon.problems)
        this.errorMsg = 'Configuración de la cinta inválida: ' + this.ribbon.problems.join('; ')
      }
      this.iconCategories = buildIconCategories()

      // El lienzo cambia de tamaño al abrir/cerrar paneles o redimensionar la ventana.
      // simple-mind-map no lo detecta solo: hay que avisarle con resize() para que el
      // <svg> siga midiendo exactamente lo mismo que su contenedor.
      const el = document.getElementById('mindMapContainer')
      this.resizeObserver = new ResizeObserver(() => {
        if (this.mindMap) this.mindMap.resize()
      })
      this.resizeObserver.observe(el)

      await this.loadMapList()
    },

    async loadMapList() {
      const res = await fetch('/api/maps')
      this.maps = await res.json()
    },

    async createMap() {
      const res = await fetch('/api/maps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Mapa sin título' })
      })
      const map = await res.json()
      await this.loadMapList()
      await this.openMap(map.id)
    },

    async openMap(id) {
      const res = await fetch(`/api/maps/${id}`)
      if (!res.ok) return
      const map = await res.json()

      this.currentId = map.id
      this.currentTitle = map.title
      this.errorMsg = ''
      this.activeNodeList = []
      this.currentLayout = map.data.layout || 'mindMap'

      await this.$nextTick()
      await nextFrame()

      try {
        const el = document.getElementById('mindMapContainer')

        if (this.mindMap) {
          this.mindMap.destroy()
          this.mindMap = null
        }

        if (typeof MindMapCtor !== 'function') {
          throw new Error('La librería simple-mind-map no se cargó correctamente (revisa /vendor/simple-mind-map.umd.min.js)')
        }

        const rect = el.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) {
          throw new Error(`El contenedor del mapa tiene tamaño 0 (${rect.width}x${rect.height}), no se puede renderizar`)
        }

        const savedTheme = map.data.theme || {}
        // Los mapas creados antes del rediseño guardaban la plantilla 'default'
        const template = !savedTheme.template || savedTheme.template === 'default' ? THEME_NAME : savedTheme.template

        this.painterActive = false
        this.mindMap = new MindMapCtor({
          el,
          data: map.data.root,
          layout: this.currentLayout,
          theme: template,
          themeConfig: savedTheme.config || {},
          defaultInsertSecondLevelNodeText: 'Tema principal',
          defaultInsertBelowSecondLevelNodeText: 'Subtema',
          defaultGeneralizationText: 'Resumen',
          defaultAssociativeLineText: 'Relación',
          defaultOuterFrameText: 'Marco',
          // Por defecto la librería solo atiende atajos con el ratón sobre el lienzo; tras usar
          // la cinta (ratón fuera) Ctrl+B, Tab… no harían nada. Como en Office, se atienden
          // siempre que el foco no esté en un campo (la librería ya ignora inputs y selects).
          enableShortcutOnlyWhenMouseInSvg: false,
          errorHandler: createMindMapErrorHandler(() => this.mindMap, (code, error) => {
            console.error(code, error)
            this.errorMsg = `Error en el mapa (${code}): ${(error && error.message) || error || ''}`
          })
        })
        extendMindMap(this.mindMap)
        bindFormatShortcuts(this.mindMap, id => this.runCommand(id))

        if (map.data.view && Object.keys(map.data.view).length) {
          this.mindMap.view.setTransformData(map.data.view)
        }
        this.zoomPercent = Math.round(this.mindMap.view.scale * 100)

        this.mindMap.on('data_change', () => this.scheduleSave())
        this.mindMap.on('view_theme_change', () => this.scheduleSave())
        this.mindMap.on('layout_change', () => this.scheduleSave())
        this.mindMap.on('scale', scale => { this.zoomPercent = Math.round(scale * 100) })
        this.mindMap.on('node_active', (node, activeNodeList) => {
          this.activeNodeList = [...activeNodeList]
        })
        this.mindMap.on('node_tree_render_end', () => { this.renderTick++ })
        this.mindMap.on('painter_start', () => { this.painterActive = true })
        this.mindMap.on('painter_end', () => { this.painterActive = false })
      } catch (err) {
        console.error(err)
        this.errorMsg = err.message || String(err)
      }
    },

    scheduleSave() {
      this.saveStatus = 'Guardando…'
      clearTimeout(this.saveTimer)
      this.saveTimer = setTimeout(() => this.saveCurrentMap(), 800)
    },

    async saveCurrentMap() {
      if (!this.mindMap || !this.currentId) return
      const data = this.mindMap.getData(true)
      let res
      try {
        res = await fetch(`/api/maps/${this.currentId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data })
        })
      } catch (err) {
        this.saveStatus = 'Error al guardar: sin conexión con el servidor'
        return
      }
      if (!res.ok) {
        this.saveStatus = res.status === 404
          ? 'Error al guardar: el mapa ya no existe'
          : `Error al guardar (HTTP ${res.status})`
        return
      }
      this.saveStatus = 'Guardado'
      setTimeout(() => { this.saveStatus = '' }, 1500)
    },

    async renameMap() {
      if (!this.currentId) return
      await fetch(`/api/maps/${this.currentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: this.currentTitle })
      })
      await this.loadMapList()
    },

    async deleteMap(id) {
      if (!confirm('¿Eliminar este mapa? Esta acción no se puede deshacer.')) return
      await fetch(`/api/maps/${id}`, { method: 'DELETE' })
      if (id === this.currentId) {
        if (this.mindMap) {
          this.mindMap.destroy()
          this.mindMap = null
        }
        this.currentId = null
        this.currentTitle = ''
        this.activeNodeList = []
      }
      await this.loadMapList()
    },

    togglePane(name) {
      this.pane = this.pane === name ? null : name
    },

    setZoomPercent(value) {
      if (this.mindMap) this.mindMap.view.setScale(Number(value) / 100)
    },

    setLayout(layout) {
      if (!this.mindMap) return
      this.currentLayout = layout
      this.mindMap.setLayout(layout)
    },

    isIconActive(iconId) {
      if (!this.hasActiveNode) return false
      const node = this.activeNodeList[0]
      const icons = node.getData('icon') || []
      return icons.includes(iconId)
    },

    toggleIcon(iconId) {
      if (!this.mindMap || !this.hasActiveNode) return
      this.activeNodeList.forEach(node => {
        const icons = node.getData('icon') || []
        const next = icons.includes(iconId)
          ? icons.filter(id => id !== iconId)
          : [...icons, iconId]
        this.mindMap.execCommand('SET_NODE_ICON', node, next)
      })
    },

    exportMap(type) {
      if (!this.mindMap) return
      this.mindMap.export(type, true, this.currentTitle || 'mapa-mental')
    }
  }
}
