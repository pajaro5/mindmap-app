// Registro de comandos: única fuente de verdad para cada acción de la interfaz.
// La cinta, la barra de acceso rápido, la barra de estado y la tira de paneles solo
// referencian comandos por id; nunca implementan la acción por su cuenta.
//
// Campos de cada comando:
//   label     Texto visible en la cinta
//   tooltip   Descripción larga (opcional, por defecto = label)
//   shortcut  Atajo que se muestra en el tooltip. Hoy los atajos del lienzo los gestiona
//             simple-mind-map; este campo solo los documenta para no registrarlos dos veces.
//   icon      Nombre en ICONS (icons.js)
//   enabled   (selection) => boolean   Si falta, siempre habilitado
//   pressed   (selection) => boolean   Para botones de estado (conmutadores)
//   menuLabel Texto en los menús desplegables (opcional, por defecto = label)
//   run       (app) => void            Acción; `app` es el componente Alpine

const hasMap = s => s.hasMap
const hasActiveNode = s => s.hasActiveNode
// El tema central no tiene hermanos ni padre, y no se puede cortar
const hasNonRootActiveNode = s => s.hasNonRootActiveNode

const COMMANDS = {
  // ---- Portapapeles ----
  'clipboard.paste': {
    label: 'Pegar', tooltip: 'Pegar como subtema del tema seleccionado', shortcut: 'Ctrl+V', icon: 'paste', enabled: hasActiveNode,
    run: app => app.mindMap.renderer.paste()
  },
  'clipboard.cut': {
    label: 'Cortar', tooltip: 'Cortar el tema y su rama', shortcut: 'Ctrl+X', icon: 'cut', enabled: hasNonRootActiveNode,
    run: app => app.mindMap.renderer.cut()
  },
  'clipboard.copy': {
    label: 'Copiar', tooltip: 'Copiar el tema y su rama', shortcut: 'Ctrl+C', icon: 'copy', enabled: hasActiveNode,
    run: app => app.mindMap.renderer.copy()
  },
  'clipboard.formatPainter': {
    label: 'Copiar formato', tooltip: 'Copiar el formato del tema y aplicarlo a otro (Esc para cancelar)', icon: 'formatPainter',
    enabled: s => s.hasActiveNode || s.painterActive,
    pressed: s => s.painterActive,
    run: app => app.togglePainter()
  },

  // ---- Mapa ----
  'map.new': {
    label: 'Nuevo mapa', icon: 'newMap',
    run: app => app.createMap()
  },

  // ---- Edición ----
  'edit.undo': {
    label: 'Deshacer', shortcut: 'Ctrl+Z', icon: 'undo', enabled: hasMap,
    run: app => app.mindMap.execCommand('BACK')
  },
  'edit.redo': {
    label: 'Rehacer', shortcut: 'Ctrl+Y', icon: 'redo', enabled: hasMap,
    run: app => app.mindMap.execCommand('FORWARD')
  },

  // ---- Temas ----
  'topic.insertSibling': {
    label: 'Tema', menuLabel: 'Tema después', tooltip: 'Insertar tema al mismo nivel, después', shortcut: 'Enter', icon: 'topic',
    enabled: hasNonRootActiveNode,
    run: app => app.mindMap.execCommand('INSERT_NODE')
  },
  'topic.insertBefore': {
    label: 'Tema antes', tooltip: 'Insertar tema al mismo nivel, antes', shortcut: 'Shift+Enter', icon: 'topicBefore',
    enabled: hasNonRootActiveNode,
    run: app => app.mindMap.execCommand('INSERT_NODE_BEFORE')
  },
  'topic.insertParent': {
    label: 'Tema padre', tooltip: 'Insertar un tema padre del seleccionado', shortcut: 'Shift+Tab', icon: 'topicParent',
    enabled: hasNonRootActiveNode,
    run: app => app.mindMap.execCommand('INSERT_PARENT_NODE')
  },
  'topic.insertChild': {
    label: 'Subtema', tooltip: 'Insertar subtema', shortcut: 'Tab', icon: 'subtopic', enabled: hasActiveNode,
    run: app => app.mindMap.execCommand('INSERT_CHILD_NODE')
  },
  'topic.remove': {
    label: 'Eliminar', tooltip: 'Eliminar tema', shortcut: 'Supr', icon: 'remove', enabled: hasActiveNode,
    run: app => app.mindMap.execCommand('REMOVE_NODE')
  },

  // ---- Marcadores ----
  'markers.icons': {
    label: 'Marcadores de icono', tooltip: 'Mostrar los marcadores de icono', icon: 'iconMarkers',
    pressed: s => s.pane === 'markers',
    run: app => app.togglePane('markers')
  },

  // ---- Diseño del mapa ----
  'layout.radial': {
    label: 'Radial', tooltip: 'Mapa radial (ramas a ambos lados)', icon: 'layoutRadial', enabled: hasMap,
    pressed: s => s.hasMap && s.layout === 'mindMap',
    run: app => app.setLayout('mindMap')
  },
  'layout.tree': {
    label: 'Árbol', tooltip: 'Mapa en árbol (ramas a la derecha)', icon: 'layoutTree', enabled: hasMap,
    pressed: s => s.hasMap && s.layout === 'logicalStructure',
    run: app => app.setLayout('logicalStructure')
  },

  // ---- Vista ----
  'view.zoomIn': {
    label: 'Acercar', tooltip: 'Acercar zoom', shortcut: 'Ctrl++', icon: 'zoomIn', enabled: hasMap,
    run: app => app.mindMap.view.enlarge()
  },
  'view.zoomOut': {
    label: 'Alejar', tooltip: 'Alejar zoom', shortcut: 'Ctrl+-', icon: 'zoomOut', enabled: hasMap,
    run: app => app.mindMap.view.narrow()
  },
  'view.fit': {
    label: 'Ajustar', tooltip: 'Ajustar el mapa a la ventana', icon: 'fit', enabled: hasMap,
    run: app => app.mindMap.view.fit()
  },
  'view.actualSize': {
    label: '100%', tooltip: 'Tamaño real (100%)', icon: 'actualSize', enabled: hasMap,
    run: app => app.mindMap.view.reset()
  },

  // ---- Paneles ----
  'pane.maps': {
    label: 'Mis mapas', tooltip: 'Mostrar u ocultar Mis mapas', icon: 'paneMaps',
    pressed: s => s.pane === 'maps',
    run: app => app.togglePane('maps')
  },
  'pane.markers': {
    label: 'Marcadores', tooltip: 'Mostrar u ocultar Marcadores', icon: 'iconMarkers',
    pressed: s => s.pane === 'markers',
    run: app => app.togglePane('markers')
  },

  // ---- Exportar ----
  'export.png': {
    label: 'Exportar PNG', tooltip: 'Exportar como imagen PNG', icon: 'exportPng', enabled: hasMap,
    run: app => app.exportMap('png')
  },
  'export.pdf': {
    label: 'Exportar PDF', tooltip: 'Exportar como documento PDF', icon: 'exportPdf', enabled: hasMap,
    run: app => app.exportMap('pdf')
  }
}

const CommandRegistry = {
  get(id) {
    const cmd = COMMANDS[id]
    if (!cmd) throw new Error(`Comando desconocido: ${id}`)
    return cmd
  },
  has(id) {
    return Object.prototype.hasOwnProperty.call(COMMANDS, id)
  },
  ids() {
    return Object.keys(COMMANDS)
  },
  isEnabled(id, selection) {
    const cmd = this.get(id)
    return cmd.enabled ? !!cmd.enabled(selection) : true
  },
  isPressed(id, selection) {
    const cmd = this.get(id)
    return cmd.pressed ? !!cmd.pressed(selection) : false
  },
  tooltip(id) {
    const cmd = this.get(id)
    const text = cmd.tooltip || cmd.label
    return cmd.shortcut ? `${text} (${cmd.shortcut})` : text
  },
  menuLabel(id) {
    const cmd = this.get(id)
    return cmd.menuLabel || cmd.label
  },
  shortcut(id) {
    return this.get(id).shortcut || ''
  },
  icon(id) {
    return ICONS[this.get(id).icon] || ''
  },
  // Devuelve lo que devuelva el comando (una promesa en los asíncronos) o false si no se
  // ejecutó por estar deshabilitado
  run(id, app) {
    if (!this.isEnabled(id, app.selection)) return false
    const result = this.get(id).run(app)
    return result === undefined ? true : result
  }
}
