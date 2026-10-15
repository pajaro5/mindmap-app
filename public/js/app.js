const MindMapCtor = (typeof simpleMindMap !== 'undefined' && (simpleMindMap.default || simpleMindMap)) || null

// Tema, plugins propios y parches de la librería (theme.js, compartido con el HTML exportado)
setupMindMapLibrary(MindMapCtor)

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
    mindMapId: null, // id del mapa cargado en el lienzo (el autoguardado va a este)
    saveStatus: '',
    saveTimer: null,
    errorMsg: '',
    currentLayout: 'mindMap',
    activeNodeList: [],
    iconCategories: [],
    // Texto del buscador de iconos del panel Marcadores
    iconQuery: '',
    // Exportación a HTML interactivo en curso
    exporting: false,
    // Plantillas guardadas por el usuario (se cargan al abrir la galería)
    userTemplates: [],
    // Panel Info. de tarea: recurso que se está escribiendo y último error de validación
    resourceDraft: '',
    taskError: '',
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
    // Llamada seleccionada: { uid del tema, id de la llamada } o null
    calloutActive: null,
    // Barra Buscar/Reemplazar. matches: uids de los temas que coinciden; index: el actual
    find: { open: false, replace: false, query: '', replacement: '', matchCase: false, includeNotes: false, matches: [], index: -1 },
    // Criterios del filtro (estado de la vista: no se guarda en el mapa)
    filter: emptyFilter(),
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

    // Información de tarea del primer tema seleccionado (lo que muestra el panel)
    get taskInfo() {
      void this.renderTick
      const nodes = this.activeNodeList.map(n => Alpine.raw(n))
      const first = nodes[0]
      const task = (first && normalizeTask(first.getData(TASK_KEY))) || {}
      const icons = (first && first.getData('icon')) || []
      return {
        priority: priorityOf(icons),
        progress: progressOf(icons),
        start: task.start || '',
        due: task.due || '',
        milestone: !!task.milestone,
        resources: task.resources || [],
        duration: taskDurationDays(task.start, task.due),
        // Para habilitar "Quitar información de tarea"
        any: nodes.some(n => {
          const i = n.getData('icon') || []
          return !!normalizeTask(n.getData(TASK_KEY)) || priorityOf(i) > 0 || progressOf(i) > 0
        })
      }
    },

    // Recursos usados en el mapa, para sugerirlos en el panel
    get knownResources() {
      void this.renderTick
      const tree = this.mindMap && Alpine.raw(this.mindMap).renderer.renderTree
      return tree ? resourcesInTree(tree) : []
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
        task: { any: this.taskInfo.any },
        relationshipActive: this.relationshipActive,
        boundaryActive: this.boundaryActive,
        calloutActive: !!this.calloutActive,
        findOpen: this.find.open,
        findReplace: this.find.replace,
        filterActive: isFilterActive(this.filter),
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

    // ---- Buscar y reemplazar ----
    get findOptions() {
      return { matchCase: this.find.matchCase, includeNotes: this.find.includeNotes }
    },

    // "2 de 5", "Sin resultados" o nada
    get findStatus() {
      if (!this.find.query.trim()) return ''
      const n = this.find.matches.length
      return n ? `${this.find.index + 1} de ${n}` : 'Sin resultados'
    },

    openFind(replace) {
      if (!this.mindMap) return
      this.menu = null
      this.find.open = true
      this.find.replace = !!replace
      this.$nextTick(() => {
        const input = document.querySelector('.find-bar [name="findText"]')
        if (input) { input.focus(); input.select() }
      })
      this.updateFindMatches()
    },

    closeFind() {
      this.find.open = false
      this.find.matches = []
      this.find.index = -1
      this.refreshViewMarks()
      if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur()
    },

    // Recalcula las coincidencias (tras escribir o cambiar el mapa) conservando la actual
    updateFindMatches() {
      const mindMap = this.mindMap && Alpine.raw(this.mindMap)
      if (!mindMap || !this.find.open) return
      const current = this.find.matches[this.find.index]
      const matches = searchTopics(mindMap.renderer.renderTree, this.find.query, this.findOptions)
      this.find.matches = matches
      const kept = matches.indexOf(current)
      this.find.index = kept >= 0 ? kept : (matches.length ? 0 : -1)
      this.refreshViewMarks()
    },

    // Al escribir se salta a la primera coincidencia, como en los navegadores
    onFindInput() {
      this.find.index = -1
      this.find.matches = []
      this.updateFindMatches()
      if (this.find.matches.length) this.goToFindMatch()
    },

    findStep(direction) {
      const n = this.find.matches.length
      if (!n) return
      this.find.index = ((this.find.index + direction) % n + n) % n
      this.goToFindMatch()
    },

    // Selecciona el tema (desplegando su rama si está contraída) y lo centra
    goToFindMatch() {
      const uid = this.find.matches[this.find.index]
      if (!uid || !this.mindMap) return
      this.mindMap.execCommand('GO_TARGET_NODE', uid, () => this.refreshViewMarks())
    },

    replaceCurrent() {
      const uid = this.find.matches[this.find.index]
      if (!uid) return
      this.mindMap.execCommand('REPLACE_TOPIC_TEXT', [uid], this.find.query, this.find.replacement, this.findOptions)
      this.updateFindMatches()
      if (this.find.matches.length) this.goToFindMatch()
    },

    replaceAll() {
      if (!this.find.matches.length) return
      this.mindMap.execCommand('REPLACE_TOPIC_TEXT', [...this.find.matches], this.find.query, this.find.replacement, this.findOptions)
      this.updateFindMatches()
    },

    // ---- Filtro ----
    get filterOptions() {
      void this.renderTick
      const tree = this.mindMap && Alpine.raw(this.mindMap).renderer.renderTree
      return tree ? filterOptionsInTree(tree) : { icons: [], tags: [], resources: [] }
    },

    get filterResult() {
      void this.renderTick
      const tree = this.mindMap && Alpine.raw(this.mindMap).renderer.renderTree
      if (!tree || !isFilterActive(this.filter)) return null
      return computeFilter(tree, this.filter)
    },

    get filterSummary() {
      void this.renderTick
      const tree = this.mindMap && Alpine.raw(this.mindMap).renderer.renderTree
      let total = 0
      const count = n => { if (n) { total++; (n.children || []).forEach(count) } }
      count(tree)
      const result = this.filterResult
      return { matched: result ? result.matched.size : total, total }
    },

    // Iconos por id, para pintar los del filtro con su nombre
    get iconById() {
      return Object.fromEntries(this.iconCategories.flatMap(c => c.items.map(i => [i.id, i])))
    },

    toggleFilterValue(list, value) {
      const i = this.filter[list].indexOf(value)
      if (i >= 0) this.filter[list].splice(i, 1)
      else this.filter[list].push(value)
    },

    clearFilter() {
      this.filter = emptyFilter()
    },

    // Resaltado de búsqueda y atenuado del filtro sobre los temas pintados
    refreshViewMarks() {
      const mindMap = this.mindMap && Alpine.raw(this.mindMap)
      if (!mindMap) return
      applyViewMarks(mindMap, {
        searchMatches: this.find.open ? this.find.matches : [],
        searchCurrent: this.find.open ? this.find.matches[this.find.index] : null,
        filter: this.filterResult
      })
    },

    // ---- Llamadas ----
    renderCalloutLayer() {
      const mindMap = this.mindMap && Alpine.raw(this.mindMap)
      if (!mindMap) return
      renderCallouts(mindMap, {
        isActive: (uid, id) => this.isCalloutActive(uid, id),
        onPointerDown: (e, node, callout) => this.startCalloutDrag(e, node, callout),
        onDoubleClick: (node, callout) => this.openCalloutDialog({ uid: node.uid, id: callout.id })
      })
    },

    selectCallout(target) {
      this.calloutActive = target
      // Como al elegir una relación o un límite: la llamada pasa a ser lo seleccionado
      if (target && this.mindMap && this.mindMap.renderer.activeNodeList.length) {
        this.mindMap.execCommand('CLEAR_ACTIVE_NODE')
      }
      if (this.mindMap) highlightCallouts(Alpine.raw(this.mindMap), (uid, id) => this.isCalloutActive(uid, id))
    },

    isCalloutActive(uid, id) {
      return !!this.calloutActive && this.calloutActive.uid === uid && this.calloutActive.id === id
    },

    // Clic: selecciona. Arrastre: mueve el globo y al soltar guarda la posición (una
    // entrada de historial). El desplazamiento en pantalla se divide por el zoom.
    startCalloutDrag(e, node, callout) {
      if (e.button !== 0) return
      e.preventDefault()
      const uid = node.uid
      const id = callout.id
      this.selectCallout({ uid, id })
      const mindMap = Alpine.raw(this.mindMap)
      const layer = mindMap.__calloutLayer
      const group = layer && layer.findOne(`[data-callout-id="${id}"][data-node-uid="${uid}"]`)
      const scale = mindMap.view.scale || 1
      const start = { x: e.clientX, y: e.clientY }
      let delta = { x: 0, y: 0 }
      let moved = false
      const onMove = ev => {
        delta = { x: (ev.clientX - start.x) / scale, y: (ev.clientY - start.y) / scale }
        if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 3) return
        moved = true
        if (group) group.transform({ translateX: delta.x, translateY: delta.y })
      }
      const onUp = () => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        if (!moved) return
        mindMap.execCommand('SET_CALLOUTS', uid, list => list.map(c => c.id === id
          ? { ...c, dx: c.dx + delta.x, dy: c.dy + delta.y }
          : c))
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },

    // Sin argumento: llamada nueva en los temas seleccionados. Con { uid, id }: editar esa
    openCalloutDialog(target) {
      const mindMap = this.mindMap && Alpine.raw(this.mindMap)
      if (!mindMap) return
      let text = ''
      if (target) {
        const node = mindMap.renderer.findNodeByUid(target.uid)
        const callout = node && (normalizeCallouts(node.getData(CALLOUTS_KEY)) || []).find(c => c.id === target.id)
        if (!callout) return
        text = callout.text
      } else {
        this.syncSelection()
        if (!this.hasActiveNode) return
      }
      this.showDialog({
        kind: 'callout',
        target: target ? { ...target } : null,
        uids: target ? [] : this.activeNodeList.map(n => Alpine.raw(n).uid),
        text,
        error: ''
      }, 'calloutText')
    },

    saveCallout() {
      const text = cleanCalloutText(this.dialog.text)
      if (!text) {
        this.dialog.error = 'Escribe el texto de la llamada.'
        return
      }
      const { target, uids } = this.dialog
      if (target) {
        this.mindMap.execCommand('SET_CALLOUTS', target.uid, list => list.map(c => c.id === target.id ? { ...c, text } : c))
      } else {
        this.mindMap.execCommand('SET_CALLOUTS', uids, list => [...list, { id: createUid(), text, ...newCalloutOffset(list) }])
      }
      this.closeDialog()
    },

    removeActiveCallout() {
      const target = this.calloutActive
      if (!target || !this.mindMap) return
      this.calloutActive = null
      this.mindMap.execCommand('SET_CALLOUTS', target.uid, list => list.filter(c => c.id !== target.id))
    },

    // ---- Diagramas ----
    // Doble clic en un hueco del diagrama: tema nuevo en ese punto, listo para escribir
    addDiagramTopic(point) {
      const mindMap = this.mindMap && Alpine.raw(this.mindMap)
      if (!mindMap) return
      mindMap.__diagramPendingPoint = point
      mindMap.execCommand('INSERT_CHILD_NODE', true, [mindMap.renderer.root])
      mindMap.__diagramPendingPoint = null
    },

    openDiagramItemDialog(itemId) {
      const mindMap = this.mindMap && Alpine.raw(this.mindMap)
      const d = mindMap && diagramOf(mindMap)
      const item = d && d.items.find(i => i.id === itemId)
      if (!item) return
      const zones = diagramZoneIds(d).filter(z => z.split('+').includes(itemId) && d.rules && d.rules[z])
      const effects = zones.length && d.rules[itemId]
        ? Object.entries({ icon: 'icono', fill: 'color de relleno', fontSize: 'tamaño de letra' })
          .filter(([key]) => d.rules[itemId][key] !== undefined).map(([, name]) => name)
        : []
      this.showDialog({
        kind: 'diagramItem', itemId, label: item.label, color: item.color,
        rule: effects.length ? `Regla de la zona: los temas que se colocan aquí toman su ${effects.join(', ')}.` : ''
      }, 'diagramLabel')
    },

    saveDiagramItem() {
      const { itemId, label, color } = this.dialog
      this.mindMap.execCommand('SET_DIAGRAM', d => ({
        ...d,
        items: d.items.map(i => i.id === itemId ? { ...i, label, color } : i)
      }))
      this.closeDialog()
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

    // ---- Información de tarea ----
    // Cada cambio se aplica a todos los temas seleccionados, campo a campo (no se copian los
    // demás datos del primero), como una sola entrada de historial
    updateTask(change) {
      this.syncSelection()
      if (!this.mindMap || !this.hasActiveNode) return false
      const nodes = this.activeNodeList.map(n => Alpine.raw(n))
      const next = new Map(nodes.map(node => [node.uid, change(normalizeTask(node.getData(TASK_KEY)) || {})]))
      const error = [...next.values()].map(validateTask).find(Boolean)
      if (error) {
        this.taskError = error
        return false
      }
      this.taskError = ''
      this.setElementData(node => next.has(node.uid) ? { [TASK_KEY]: normalizeTask(next.get(node.uid)) } : {})
      return true
    },

    // Fechas desde <input type="date">; si no es válida, el campo vuelve a su valor
    setTaskDate(field, event) {
      const value = event.target.value
      const ok = this.updateTask(task => ({ ...task, [field]: value || undefined }))
      if (!ok) event.target.value = this.taskInfo[field]
    },

    setTaskMilestone(on) {
      this.updateTask(task => ({ ...task, milestone: on || undefined }))
    },

    addResource() {
      const name = cleanName(this.resourceDraft)
      if (!name) return
      this.updateTask(task => ({ ...task, resources: [...(task.resources || []), name] }))
      this.resourceDraft = ''
    },

    removeResource(name) {
      this.updateTask(task => ({ ...task, resources: (task.resources || []).filter(r => markerKey(r) !== markerKey(name)) }))
    },

    setTaskPriority(value) {
      this.syncSelection()
      this.setElementData(node => ({ icon: withPriority(node.getData('icon'), Number(value)) }))
    },

    setTaskProgress(value) {
      this.syncSelection()
      this.setElementData(node => ({ icon: withProgress(node.getData('icon'), Number(value)) }))
    },

    // Opciones de los selectores del panel, generadas como HTML (ver selectOptionsHtml)
    taskSelectHtml(kind) {
      const info = this.taskInfo
      const options = kind === 'priority'
        ? [{ value: 0, label: 'Ninguna' }, ...Array.from({ length: PRIORITY_MAX }, (_, i) => ({ value: i + 1, label: `Prioridad ${i + 1}` }))]
        : progressOptions(info.progress)
      const current = kind === 'priority' ? info.priority : info.progress
      return options.map(o => `<option value="${o.value}"${o.value === current ? ' selected' : ''}>${o.label}</option>`).join('')
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
        // Ctrl+F / Ctrl+H: Buscar / Reemplazar (en lugar de la búsqueda del navegador)
        if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && ['f', 'h'].includes(e.key.toLowerCase()) && this.mindMap && !this.dialog) {
          e.preventDefault()
          this.runCommand(e.key.toLowerCase() === 'f' ? 'view.find' : 'view.replace')
          return
        }
        // Supr con una llamada seleccionada la elimina (no hay temas seleccionados)
        if ((e.key === 'Delete' || e.key === 'Backspace') && this.calloutActive && e.target === document.body && !this.dialog) {
          e.preventDefault()
          this.runCommand('callout.remove')
          return
        }
        if (e.key !== 'Escape') return
        if (this.calloutActive && !this.dialog) this.selectCallout(null)
        if (this.menu) this.closeMenu()
        if (this.painterActive) this.togglePainter()
        if (this.creatingRelationship) this.cancelRelationship()
      })
      // El filtro se aplica en cuanto cambia cualquier criterio
      this.$watch('filter', () => this.refreshViewMarks())
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

    // `fit`: ajustar el mapa a la ventana al abrirlo (la librería lo hace tras el primer render)
    async openMap(id, { fit = false } = {}) {
      // Guardar la nota que se estuviera escribiendo en el mapa anterior y los cambios que
      // esperaban al autoguardado: si no, se perderían o acabarían guardados en el mapa nuevo
      this.flushNote()
      await this.flushPendingSave()
      const res = await fetch(`/api/maps/${id}`)
      if (!res.ok) return
      const map = await res.json()
      this.noteNodeUid = null
      this.noteDraft = ''
      // Búsqueda y filtro son de la vista del mapa anterior
      this.find = { ...this.find, open: false, query: '', replacement: '', matches: [], index: -1 }
      this.filter = emptyFilter()

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
          this.mindMapId = null
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
        const template = themeTemplateOf(savedTheme)

        this.painterActive = false
        this.mindMap = new MindMapCtor({
          el,
          fit,
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
          // Diagramas: título fijo encima del diagrama y temas que se sueltan donde se dejan
          ...diagramMapOptions(map.data.root.data),
          beforeDragEnd: info => diagramBeforeDragEnd(this.mindMap && Alpine.raw(this.mindMap), info),
          errorHandler: createMindMapErrorHandler(() => this.mindMap, (code, error) => {
            console.error(code, error)
            this.errorMsg = `Error en el mapa (${code}): ${(error && error.message) || error || ''}`
          })
        })
        this.mindMapId = map.id
        extendMindMap(this.mindMap)
        attachDiagram(Alpine.raw(this.mindMap), {
          editable: true,
          handlers: {
            onZoneDblClick: (zone, point) => this.addDiagramTopic(point),
            onLabelDblClick: itemId => this.openDiagramItemDialog(itemId)
          }
        })
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
          // Si la llamada seleccionada ya no existe (Deshacer, Limpiar…) se deselecciona
          if (this.calloutActive) {
            const node = this.mindMap.renderer.findNodeByUid(this.calloutActive.uid)
            const list = (node && normalizeCallouts(node.getData(CALLOUTS_KEY))) || []
            if (!list.some(c => c.id === this.calloutActive.id)) this.calloutActive = null
          }
          this.renderCalloutLayer()
          // La librería recrea los elementos: hay que volver a marcar búsqueda y filtro
          if (this.find.open) this.updateFindMatches()
          else this.refreshViewMarks()
        })
        // Seleccionar un tema o hacer clic en el lienzo deselecciona la llamada
        const clearCallout = () => {
          if (this.calloutActive) this.selectCallout(null)
        }
        this.mindMap.on('node_click', clearCallout)
        this.mindMap.on('draw_click', clearCallout)
        this.calloutActive = null
        this.renderCalloutLayer()
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

    // Guarda ya lo que estuviera esperando al autoguardado
    async flushPendingSave() {
      if (!this.saveTimer) return
      clearTimeout(this.saveTimer)
      this.saveTimer = null
      await this.saveCurrentMap()
    },

    // Se guarda en el mapa que está cargado en el lienzo (mindMapId), no en currentId: al
    // cambiar de mapa currentId cambia antes de que se cargue el mapa nuevo
    async saveCurrentMap() {
      this.saveTimer = null
      const id = this.mindMapId
      if (!this.mindMap || !id) return
      const data = this.mindMap.getData(true)
      let res
      try {
        res = await fetch(`/api/maps/${id}`, {
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
        // Un autoguardado pendiente del mapa borrado ya no tiene adónde ir
        clearTimeout(this.saveTimer)
        this.saveTimer = null
        if (this.mindMap) {
          this.mindMap.destroy()
          this.mindMap = null
          this.mindMapId = null
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

    // ---- Plantillas ----
    // Plantillas de la galería: las de serie y las guardadas por el usuario ("Mis plantillas")
    get galleryTemplates() {
      const builtin = BUILTIN_TEMPLATES.map(t => ({
        key: `builtin:${t.id}`, id: t.id, category: t.category, name: t.name, description: t.description,
        topics: countTopics(t.root), preview: templatePreviewSvg(t.root, t.layout, t.diagram), builtin: true
      }))
      const mine = this.userTemplates.map(t => ({
        key: `user:${t.id}`, id: t.id, category: 'mine', name: t.title, description: t.description,
        topics: countTopics(t.data.root || {}), preview: templatePreviewSvg(toPreviewTree(t.data.root), t.data.layout, t.data.root && t.data.root.data && t.data.root.data[DIAGRAM_KEY]), builtin: false
      }))
      return [...builtin, ...mine]
    },

    get galleryCategories() {
      return [{ id: 'all', name: 'Todas' }, ...TEMPLATE_CATEGORIES, { id: 'mine', name: 'Mis plantillas' }]
    },

    // Con texto en el buscador se busca en todas las categorías (sin distinguir tildes ni mayúsculas)
    get visibleTemplates() {
      const category = this.dialog && this.dialog.category
      const query = foldText((this.dialog && this.dialog.query) || '')
      if (query) return this.galleryTemplates.filter(t => foldText(`${t.name} ${t.description || ''}`).includes(query))
      return this.galleryTemplates.filter(t => category === 'all' || t.category === category)
    },

    get templateEmptyHint() {
      if (this.dialog && foldText(this.dialog.query || '')) return 'Ninguna plantilla coincide con la búsqueda.'
      return 'Aún no tienes plantillas propias. Abre un mapa y usa Exportar › Guardar como plantilla.'
    },

    selectTemplateCategory(id) {
      this.dialog.category = id
      this.dialog.query = ''
    },

    async loadUserTemplates() {
      const res = await fetch('/api/templates')
      if (!res.ok) throw new Error(`No se pudieron cargar las plantillas (HTTP ${res.status})`)
      this.userTemplates = await res.json()
    },

    async openTemplateGallery() {
      try {
        await this.loadUserTemplates()
      } catch (err) {
        // La galería de serie funciona aunque falle la lista de plantillas propias
        console.error(err)
        this.userTemplates = []
      }
      this.showDialog({ kind: 'templates', category: 'all', query: '', selected: 'builtin:project-plan', pendingDelete: null, error: '' }, 'templateQuery')
    },

    async createFromTemplate(key = this.dialog && this.dialog.selected) {
      const item = this.galleryTemplates.find(t => t.key === key)
      if (!item) return
      const data = item.builtin
        ? instantiateTemplate(BUILTIN_TEMPLATES.find(t => t.id === item.id))
        : mapDataFromSavedTemplate(this.userTemplates.find(t => t.id === item.id))
      const res = await fetch('/api/maps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: item.name, data })
      })
      if (!res.ok) {
        this.dialog.error = `No se pudo crear el mapa (HTTP ${res.status})`
        return
      }
      const map = await res.json()
      this.closeDialog()
      await this.loadMapList()
      // Un mapa recién creado desde una plantilla se ve entero
      await this.openMap(map.id, { fit: true })
    },

    // Borrar una plantilla propia pide confirmación con un segundo clic
    async deleteUserTemplate(id) {
      if (this.dialog.pendingDelete !== id) {
        this.dialog.pendingDelete = id
        return
      }
      const res = await fetch(`/api/templates/${encodeURIComponent(id)}`, { method: 'DELETE' })
      this.dialog.pendingDelete = null
      if (!res.ok && res.status !== 404) {
        this.dialog.error = `No se pudo eliminar la plantilla (HTTP ${res.status})`
        return
      }
      await this.loadUserTemplates()
      if (this.dialog.selected === `user:${id}`) this.dialog.selected = null
    },

    openSaveTemplateDialog() {
      if (!this.mindMap) return
      this.showDialog({ kind: 'saveTemplate', title: this.currentTitle || '', description: '', stripTasks: false, error: '' }, 'templateTitle')
    },

    async saveAsTemplate() {
      const title = this.dialog.title.trim()
      if (!title) {
        this.dialog.error = 'Escribe un nombre para la plantilla.'
        return
      }
      const data = templateDataFromMap(Alpine.raw(this.mindMap).getData(true), { stripTasks: this.dialog.stripTasks })
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description: this.dialog.description, data })
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        this.dialog.error = body.error || `No se pudo guardar la plantilla (HTTP ${res.status})`
        return
      }
      this.closeDialog()
      this.saveStatus = 'Plantilla guardada'
      setTimeout(() => { if (this.saveStatus === 'Plantilla guardada') this.saveStatus = '' }, 2000)
    },

    async exportHtml() {
      if (!this.mindMap || this.exporting) return
      // Indicador propio: saveStatus es del autoguardado y no hay que pisarlo
      this.exporting = true
      try {
        await exportInteractiveHtml(Alpine.raw(this.mindMap), this.currentTitle)
      } catch (err) {
        console.error(err)
        this.errorMsg = `No se pudo exportar a HTML: ${err.message || err}`
      } finally {
        this.exporting = false
      }
    },

    exportMap(type) {
      if (!this.mindMap) return
      this.mindMap.export(type, true, this.currentTitle || 'mapa-mental')
    }
  }
}
