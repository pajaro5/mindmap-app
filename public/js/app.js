const MindMapCtor = (typeof simpleMindMap !== 'undefined' && (simpleMindMap.default || simpleMindMap)) || null

const ICON_CATEGORY_LABELS = {
  priority: 'Prioridad',
  progress: 'Progreso',
  expression: 'Emojis',
  sign: 'Marcas'
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

function mindMapApp() {
  return {
    maps: [],
    currentId: null,
    currentTitle: '',
    mindMap: null,
    saveStatus: '',
    saveTimer: null,
    errorMsg: '',
    currentLayout: 'logicalStructure',
    activeNodeList: [],
    iconCategories: [],

    async init() {
      window.addEventListener('error', e => {
        this.errorMsg = 'Error JS: ' + e.message
      })
      this.iconCategories = buildIconCategories()
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
      this.currentLayout = map.data.layout || 'logicalStructure'

      await this.$nextTick()

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

        this.mindMap = new MindMapCtor({
          el,
          data: map.data.root,
          layout: map.data.layout || 'logicalStructure',
          theme: (map.data.theme && map.data.theme.template) || 'default',
          defaultInsertSecondLevelNodeText: 'Subtema',
          defaultInsertBelowSecondLevelNodeText: 'Tema',
          defaultGeneralizationText: 'Resumen',
          defaultAssociativeLineText: 'Relación',
          defaultOuterFrameText: 'Marco'
        })

        if (map.data.theme && map.data.theme.config) {
          this.mindMap.setThemeConfig(map.data.theme.config, true)
        }
        if (map.data.view && Object.keys(map.data.view).length) {
          this.mindMap.view.setTransformData(map.data.view)
        }

        this.mindMap.on('data_change', () => this.scheduleSave())
        this.mindMap.on('view_theme_change', () => this.scheduleSave())
        this.mindMap.on('layout_change', () => this.scheduleSave())
        this.mindMap.on('node_active', (node, activeNodeList) => {
          this.activeNodeList = activeNodeList
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
      await fetch(`/api/maps/${this.currentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data })
      })
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
      }
      await this.loadMapList()
    },

    zoomIn() { if (this.mindMap) this.mindMap.view.enlarge() },
    zoomOut() { if (this.mindMap) this.mindMap.view.narrow() },
    resetZoom() { if (this.mindMap) this.mindMap.view.reset() },
    undo() { if (this.mindMap) this.mindMap.execCommand('BACK') },
    redo() { if (this.mindMap) this.mindMap.execCommand('FORWARD') },

    setLayout(layout) {
      if (!this.mindMap) return
      this.mindMap.setLayout(layout)
    },

    isIconActive(iconId) {
      if (this.activeNodeList.length === 0) return false
      const node = this.activeNodeList[0]
      const icons = node.getData('icon') || []
      return icons.includes(iconId)
    },

    toggleIcon(iconId) {
      if (!this.mindMap || this.activeNodeList.length === 0) return
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
