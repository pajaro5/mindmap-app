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

    get hasActiveNode() {
      return this.activeNodeList.length > 0
    },

    // Estado de selección centralizado: lo único que consultan los comandos para decidir
    // si están habilitados o pulsados. Las fases siguientes añadirán aquí los estilos del
    // tema activo (fuente, negrita…) para reflejarlos en la cinta.
    get selection() {
      return {
        hasMap: !!this.currentId && !!this.mindMap,
        hasActiveNode: this.activeNodeList.length > 0,
        activeCount: this.activeNodeList.length,
        layout: this.currentLayout,
        pane: this.pane
      }
    },

    isEnabled(id) { return CommandRegistry.isEnabled(id, this.selection) },
    isPressed(id) { return CommandRegistry.isPressed(id, this.selection) },
    tooltipOf(id) { return CommandRegistry.tooltip(id) },
    labelOf(id) { return CommandRegistry.get(id).label },
    iconOf(id) { return CommandRegistry.icon(id) },

    runCommand(id) {
      try {
        CommandRegistry.run(id, this)
      } catch (err) {
        console.error(err)
        this.errorMsg = `No se pudo ejecutar "${this.labelOf(id)}": ${err.message || err}`
      }
    },

    async init() {
      window.addEventListener('error', e => {
        this.errorMsg = 'Error JS: ' + e.message
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
          defaultOuterFrameText: 'Marco'
        })

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
