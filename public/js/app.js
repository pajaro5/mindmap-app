const MindMapCtor = (typeof simpleMindMap !== 'undefined' && (simpleMindMap.default || simpleMindMap)) || null

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
    // Texto del buscador de iconos del panel Marcadores
    iconQuery: '',
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
    // Relaciones y límites: hay uno seleccionado / se está dibujando una relación
    relationshipActive: false,
    boundaryActive: false,
    creatingRelationship: false,
    // Diálogo modal abierto: { kind: 'hyperlink', url, title, error, canRemove } o null
    dialog: null,
    // Texto de la nota del tema seleccionado en el panel Notas
    noteDraft: '',
    noteNodeUid: null,
    noteTimer: null,
    // Hay texto escrito en el editor de notas que aún no se ha guardado en el tema
    noteDirty: false,

    get hasActiveNode() {
      return this.activeNodeList.length > 0
    },

    // Elementos del tema (vínculo, adjunto, imagen, nota) de los temas seleccionados
    get activeElements() {
      void this.renderTick
      const nodes = this.activeNodeList.map(n => Alpine.raw(n))
      const first = nodes[0]
      const has = (node, key) => !!(node && node.getData(key))
      return {
        hasHyperlink: has(first, 'hyperlink'),
        hasAttachment: has(first, 'attachmentUrl'),
        hasImage: has(first, 'image'),
        hasNote: has(first, 'note'),
        anyAttachment: nodes.some(n => has(n, 'attachmentUrl')),
        anyImage: nodes.some(n => has(n, 'image')),
        anyNote: nodes.some(n => has(n, 'note')),
        anyHyperlink: nodes.some(n => has(n, 'hyperlink'))
      }
    },

    // Algún tema seleccionado (que no sea el central) tiene varias líneas
    get canSplit() {
      void this.renderTick
      return this.activeNodeList.some(n => {
        const node = Alpine.raw(n)
        return !node.isRoot && !node.isGeneralization && topicLines(node.getData('text')).length > 1
      })
    },

    // Iconos del panel según el buscador; los clásicos van aparte
    get paneIconCategories() {
      return filterIconCategories(this.iconCategories, this.iconQuery)
    },

    // El desplegable de la cinta muestra solo la biblioteca principal
    get menuIconCategories() {
      return this.iconCategories.filter(c => !c.classic)
    },

    // Definiciones de los marcadores de texto del mapa (viven en el tema central)
    get textMarkerDefs() {
      void this.renderTick
      const root = this.mindMap && Alpine.raw(this.mindMap).renderer.root
      return root ? normalizeMarkerDefs(root.getData(TEXT_MARKERS_KEY)) : []
    },

    // Marcadores usados en temas pero sin definición (p. ej. de un mapa importado)
    get undefinedTextMarkers() {
      void this.renderTick
      const tree = this.mindMap && Alpine.raw(this.mindMap).renderer.renderTree
      return tree ? undefinedTagsInTree(tree, this.textMarkerDefs) : []
    },

    // Marcadores del primer tema seleccionado (lo que se muestra marcado en la cinta y el
    // panel) y si algún seleccionado tiene alguno (para habilitar "Quitar")
    get activeMarkers() {
      void this.renderTick
      const nodes = this.activeNodeList.map(n => Alpine.raw(n))
      const first = nodes[0]
      return {
        icons: (first && first.getData('icon')) || [],
        tags: ((first && first.getData('tag')) || []).map(tagText),
        firstHasMarkers: !!first && ((first.getData('icon') || []).length + (first.getData('tag') || []).length) > 0,
        anyIcon: nodes.some(n => (n.getData('icon') || []).length > 0),
        anyTag: nodes.some(n => (n.getData('tag') || []).length > 0)
      }
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
        elements: this.activeElements,
        markers: this.activeMarkers,
        canSplit: this.canSplit,
        relationshipActive: this.relationshipActive,
        boundaryActive: this.boundaryActive,
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

    // La librería avisa de los cambios de selección (node_active) en un setTimeout(0), así que
    // activeNodeList va un instante por detrás de la selección real. Si un comando se lanza
    // justo después de un clic (p. ej. clic + Ctrl+K), actuaría sobre el tema anterior.
    // Antes de ejecutar cualquier comando se copia la selección real de la librería.
    syncSelection() {
      if (!this.mindMap) return
      const live = this.mindMap.renderer.activeNodeList
      const same = live.length === this.activeNodeList.length &&
        live.every((node, i) => Alpine.raw(this.activeNodeList[i]) === node)
      if (!same) this.activeNodeList = [...live]
    },

    runCommand(id, value) {
      this.menu = null
      this.syncSelection()
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
        // Que no se salga de la ventana por la derecha (botones del final de la cinta)
        const el = document.querySelector('.ribbon-menu')
        if (el && this.menu) {
          const overflow = el.getBoundingClientRect().right - (window.innerWidth - 4)
          if (overflow > 0) this.menu.x = Math.max(4, this.menu.x - Math.ceil(overflow))
        }
        const first = document.querySelector('.ribbon-menu :is([role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]):not([disabled])')
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

    // ---- Relación ----
    // Con dos temas seleccionados se unen directamente (del primero al segundo). Con uno, se
    // entra en modo "dibujar": la flecha sigue al ratón hasta hacer clic en el tema destino.
    startRelationship() {
      const plugin = this.mindMap && this.mindMap.associativeLine
      if (!plugin) return
      const nodes = this.mindMap.renderer.activeNodeList
      if (nodes.length === 2) {
        this.mindMap.execCommand('ADD_ASSOCIATIVE_LINE', nodes[0], nodes[1])
        return
      }
      plugin.createLineFromActiveNode()
      this.creatingRelationship = !!plugin.isCreatingLine
    },

    cancelRelationship() {
      const plugin = this.mindMap && this.mindMap.associativeLine
      if (plugin && plugin.isCreatingLine) plugin.cancelCreateLine()
      this.creatingRelationship = false
    },

    // El plugin termina el modo dibujar al hacer clic en un tema o en el lienzo
    refreshRelationshipMode() {
      const plugin = this.mindMap && this.mindMap.associativeLine
      this.creatingRelationship = !!(plugin && plugin.isCreatingLine)
    },

    editRelationshipText() {
      const plugin = this.mindMap.associativeLine
      if (!plugin.activeLine) return
      plugin.showEditTextBox(plugin.activeLine[2])
    },

    // ---- Límite ----
    // Si hay un límite seleccionado se le cambia el estilo; si no, se crea uno nuevo
    // alrededor de los temas seleccionados con ese estilo
    applyBoundaryStyle(config) {
      const plugin = this.mindMap && this.mindMap.outerFrame
      if (!plugin) return
      if (plugin.activeOuterFrame) {
        plugin.updateActiveOuterFrame({ ...config })
        return
      }
      this.mindMap.execCommand('ADD_OUTER_FRAME', [], { ...config })
    },

    editBoundaryText() {
      const plugin = this.mindMap.outerFrame
      if (!plugin.activeOuterFrame) return
      plugin.showEditTextBox(plugin.activeOuterFrame.textNode)
    },

    // ---- Edición ----
    selectRelated(kind) {
      selectRelated(Alpine.raw(this.mindMap), kind)
    },

    clearTopics(part) {
      if (!this.mindMap || !this.hasActiveNode) return
      this.mindMap.execCommand('CLEAR_TOPICS', part)
    },

    // ---- Elementos del tema ----
    setElementData(data) {
      if (!this.mindMap || !this.hasActiveNode) return
      this.mindMap.execCommand('SET_ACTIVE_NODES_DATA', data)
    },

    openHyperlinkDialog() {
      const node = Alpine.raw(this.activeNodeList[0])
      if (!node) return
      this.showDialog({
        kind: 'hyperlink',
        url: node.getData('hyperlink') || '',
        title: unescapeXml(node.getData('hyperlinkTitle') || ''),
        error: '',
        canRemove: this.activeNodeList.some(n => !!Alpine.raw(n).getData('hyperlink'))
      }, 'url')
    },

    // Abre el diálogo modal con el estado dado y selecciona el campo `focusName`
    showDialog(state, focusName) {
      this.menu = null
      this.dialog = state
      this.$nextTick(() => {
        const dlg = document.getElementById('appDialog')
        if (dlg && !dlg.open) dlg.showModal()
        const input = document.querySelector(`#appDialog [name="${focusName}"]`)
        if (input) input.select()
      })
    },

    closeDialog() {
      const dlg = document.getElementById('appDialog')
      if (dlg && dlg.open) dlg.close()
      this.dialog = null
    },

    saveHyperlink() {
      const result = normalizeHyperlink(this.dialog.url)
      if (!result.ok) {
        this.dialog.error = result.error
        return
      }
      const title = this.dialog.title.trim()
      this.setElementData({ hyperlink: result.url, hyperlinkTitle: title ? escapeXml(title) : undefined })
      this.closeDialog()
    },

    removeHyperlink() {
      this.setElementData({ hyperlink: undefined, hyperlinkTitle: undefined })
      this.closeDialog()
    },

    async addAttachment() {
      const file = await pickFile()
      if (!file) return
      this.saveStatus = 'Subiendo adjunto…'
      try {
        const uploaded = await uploadAttachment(this.currentId, file)
        this.setElementData({ attachmentUrl: uploaded.url, attachmentName: escapeXml(uploaded.name) })
        this.saveStatus = ''
      } catch (err) {
        this.saveStatus = ''
        this.errorMsg = err.message
      }
    },

    openAttachment(node) {
      const target = Alpine.raw(node || this.activeNodeList[0])
      const url = target && target.getData('attachmentUrl')
      if (!url || !isAttachmentUrl(url)) return
      const a = document.createElement('a')
      a.href = url
      a.download = unescapeXml(target.getData('attachmentName') || '')
      document.body.appendChild(a)
      a.click()
      a.remove()
    },

    async addImage() {
      const file = await pickFile(ALLOWED_IMAGE_TYPES.join(','))
      if (!file) return
      try {
        const img = await readImageFile(file)
        this.setElementData({
          image: img.url,
          imageTitle: escapeXml(file.name),
          imageSize: { width: img.width, height: img.height, custom: false }
        })
      } catch (err) {
        this.errorMsg = err.message
      }
    },

    // ---- Notas ----
    openNotes() {
      this.pane = 'notes'
      this.loadNoteDraft()
      this.$nextTick(() => {
        const area = document.querySelector('.notes-editor')
        if (area) area.focus()
      })
    },

    // Carga en el editor la nota del tema seleccionado (al cambiar la selección)
    loadNoteDraft() {
      this.flushNote()
      const node = this.activeNodeList.length === 1 ? Alpine.raw(this.activeNodeList[0]) : null
      this.noteNodeUid = node ? node.uid : null
      this.noteDraft = node ? (node.getData('note') || '') : ''
    },

    // Si la nota cambió fuera del editor (Deshacer, Limpiar…) y no hay nada pendiente de
    // guardar, el editor muestra la nota actual. Sin esto, el borrador antiguo volvía a
    // escribirse sobre el tema al cambiar de selección.
    refreshNoteDraft() {
      if (this.pane !== 'notes' || this.noteDirty || !this.mindMap || !this.noteNodeUid) return
      const node = this.mindMap.renderer.findNodeByUid(this.noteNodeUid)
      const current = (node && node.getData('note')) || ''
      if (current !== this.noteDraft) this.noteDraft = current
    },

    // Guarda la nota con un pequeño retardo mientras se escribe (una entrada de historial
    // por pausa, no por tecla)
    onNoteInput() {
      this.noteDirty = true
      clearTimeout(this.noteTimer)
      this.noteTimer = setTimeout(() => this.flushNote(), 500)
    },

    flushNote() {
      clearTimeout(this.noteTimer)
      this.noteTimer = null
      // Solo se guarda lo que el usuario escribió
      if (!this.noteDirty) return
      this.noteDirty = false
      if (!this.mindMap || !this.noteNodeUid) return
      const node = this.mindMap.renderer.findNodeByUid(this.noteNodeUid)
      if (!node) return
      const current = node.getData('note') || ''
      const next = this.noteDraft
      if (current === next) return
      this.mindMap.execCommand('SET_NODE_NOTE', node, next || undefined)
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
        if (this.creatingRelationship) this.cancelRelationship()
      })
      this.ribbon = buildRibbon()
      if (this.ribbon.problems.length) {
        console.error('Configuración de la cinta inválida:', this.ribbon.problems)
        this.errorMsg = 'Configuración de la cinta inválida: ' + this.ribbon.problems.join('; ')
      }
      this.iconCategories = buildIconCategories((MindMapCtor && MindMapCtor.iconList) || [])

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
      // Guardar la nota que se estuviera escribiendo en el mapa anterior
      this.flushNote()
      const res = await fetch(`/api/maps/${id}`)
      if (!res.ok) return
      const map = await res.json()
      this.noteNodeUid = null
      this.noteDraft = ''

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

        // Los datos pueden venir de fuera de la app (importados o editados a mano): se sanean
        // antes de que la librería los pinte (ver elements.js)
        const fixed = sanitizeMapTree(map.data.root)
        if (fixed > 0) console.warn(`Se corrigieron ${fixed} valores no seguros del mapa`)

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
          maxTag: 10,
          iconList: libraryIconList(),
          // Por defecto la librería solo atiende atajos con el ratón sobre el lienzo; tras usar
          // la cinta (ratón fuera) Ctrl+B, Tab… no harían nada. Como en Office, se atienden
          // siempre que el foco no esté en un campo (la librería ya ignora inputs y selects).
          enableShortcutOnlyWhenMouseInSvg: false,
          customHyperlinkJump: url => openHyperlinkSafely(url),
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
          if (this.pane === 'notes') this.loadNoteDraft()
        })
        this.mindMap.on('node_note_click', node => {
          // Seleccionar el tema como lo hace un clic (SET_NODE_ACTIVE solo cambia el dato)
          if (!node.getData('isActive')) node.active()
          this.$nextTick(() => this.openNotes())
        })
        this.mindMap.on('node_attachmentClick', node => this.openAttachment(node))
        this.relationshipActive = false
        this.boundaryActive = false
        this.creatingRelationship = false
        this.mindMap.on('associative_line_click', () => { this.relationshipActive = true })
        this.mindMap.on('associative_line_deactivate', () => { this.relationshipActive = false })
        this.mindMap.on('outer_frame_active', () => { this.boundaryActive = true })
        this.mindMap.on('outer_frame_deactivate', () => { this.boundaryActive = false })
        this.mindMap.on('outer_frame_delete', () => { this.boundaryActive = false })
        // Tras un clic en un tema o en el lienzo el plugin puede haber terminado de dibujar
        this.mindMap.on('node_click', () => setTimeout(() => this.refreshRelationshipMode()))
        this.mindMap.on('draw_click', () => setTimeout(() => this.refreshRelationshipMode()))
        this.mindMap.on('node_tree_render_end', () => {
          this.renderTick++
          this.refreshNoteDraft()
        })
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
      this.showPane(this.pane === name ? null : name)
    },

    showPane(name) {
      if (this.pane === 'notes') this.flushNote()
      this.pane = name
      if (this.pane === 'notes') this.loadNoteDraft()
    },

    setZoomPercent(value) {
      if (this.mindMap) this.mindMap.view.setScale(Number(value) / 100)
    },

    setLayout(layout) {
      if (!this.mindMap) return
      this.currentLayout = layout
      this.mindMap.setLayout(layout)
    },

    // ---- Marcadores ----
    // Como los formatos de Office: el estado del primer tema seleccionado decide si se
    // pone o se quita en todos los seleccionados. Una sola entrada de historial.
    isIconActive(iconId) {
      return this.activeMarkers.icons.includes(iconId)
    },

    toggleIcon(iconId) {
      this.menu = null
      this.syncSelection()
      if (!this.mindMap || !this.hasActiveNode) return
      const on = !this.isIconActive(iconId)
      this.setElementData(node => ({ icon: toggleIconList(node.getData('icon'), iconId, on) }))
    },

    isTagActive(name) {
      return hasTag(this.activeMarkers.tags, name)
    },

    toggleTextMarker(name) {
      this.menu = null
      this.syncSelection()
      if (!this.mindMap || !this.hasActiveNode) return
      const on = !this.isTagActive(name)
      const defs = this.textMarkerDefs
      this.setElementData(node => ({ tag: toggleTagList(node.getData('tag'), defs, name, on) }))
    },

    // Diálogo "Nuevo marcador de texto": escribe un nombre (o elige uno existente) y se
    // asigna a los temas seleccionados. Si es nuevo se añade a la categoría elegida.
    openTextMarkerDialog() {
      const defs = this.textMarkerDefs
      this.showDialog({
        kind: 'textMarker',
        name: '',
        categoryId: defs.length ? defs[0].id : '',
        error: ''
      }, 'markerName')
    },

    saveTextMarker() {
      const name = cleanName(this.dialog.name)
      if (!name) {
        this.dialog.error = 'Escribe el nombre del marcador.'
        return
      }
      this.syncSelection()
      const defs = this.textMarkerDefs
      if (findMarker(defs, name)) {
        const tagDefs = defs
        this.setElementData(node => ({ tag: toggleTagList(node.getData('tag'), tagDefs, name, true) }))
      } else {
        // Sin categorías se crea una por defecto
        if (!defs.length) defs.push({ id: newId(), name: 'General', color: TEXT_MARKER_COLORS[0], markers: [] })
        const category = defs.find(c => c.id === this.dialog.categoryId) || defs[0]
        category.markers.push({ id: newId(), name })
        this.mindMap.execCommand('SET_TEXT_MARKERS', defs, name)
      }
      this.closeDialog()
    },

    // Diálogo de categoría (nueva o existente): nombre, color y lista de marcadores.
    // Los marcadores conservan su id, así que cambiar un nombre lo renombra en todos los temas
    openCategoryDialog(categoryId) {
      const defs = this.textMarkerDefs
      const existing = defs.find(c => c.id === categoryId)
      const used = new Set(defs.map(c => c.color))
      this.showDialog({
        kind: 'category',
        isNew: !existing,
        id: existing ? existing.id : newId(),
        name: existing ? existing.name : '',
        color: existing ? existing.color : (TEXT_MARKER_COLORS.find(c => !used.has(c)) || TEXT_MARKER_COLORS[0]),
        markers: existing ? existing.markers.map(m => ({ ...m })) : [{ id: newId(), name: '' }],
        error: ''
      }, 'categoryName')
    },

    addCategoryMarker() {
      this.dialog.markers.push({ id: newId(), name: '' })
      const index = this.dialog.markers.length - 1
      this.$nextTick(() => {
        const input = document.querySelector(`#appDialog [name="marker-${index}"]`)
        if (input) input.focus()
      })
    },

    removeCategoryMarker(index) {
      this.dialog.markers.splice(index, 1)
    },

    saveCategory() {
      const defs = this.textMarkerDefs
      const category = {
        id: this.dialog.id,
        name: cleanName(this.dialog.name),
        color: isHexColor(this.dialog.color) ? this.dialog.color : TEXT_MARKER_COLORS[0],
        markers: this.dialog.markers
          .map(m => ({ id: m.id, name: cleanName(m.name) }))
          .filter(m => m.name)
      }
      const error = validateCategory(defs, category)
      if (error) {
        this.dialog.error = error
        return
      }
      const index = defs.findIndex(c => c.id === category.id)
      if (index >= 0) defs[index] = category
      else defs.push(category)
      this.mindMap.execCommand('SET_TEXT_MARKERS', defs)
      this.closeDialog()
    },

    // Borrar una categoría quita sus marcadores de todos los temas (se puede deshacer)
    deleteCategory() {
      const defs = this.textMarkerDefs.filter(c => c.id !== this.dialog.id)
      this.mindMap.execCommand('SET_TEXT_MARKERS', defs)
      this.closeDialog()
    },

    exportMap(type) {
      if (!this.mindMap) return
      this.mindMap.export(type, true, this.currentTitle || 'mapa-mental')
    }
  }
}
