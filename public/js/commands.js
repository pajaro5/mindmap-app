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
//   run       (app, value?) => void    Acción; `app` es el componente Alpine. Los comandos
//                                      con valor (selectores, colores, galerías) lo reciben
//   control   'select' | 'color' | 'gallery'  Comandos con valor (opcional)
//   options   (selection) => [{ value, label }]  Opciones de 'select' y 'gallery'
//   value     (selection) => valor actual del tema seleccionado

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

  // ---- Edición: Dividir, Seleccionar, Limpiar ----
  'topic.split': {
    label: 'Dividir', tooltip: 'Dividir un tema de varias líneas en un tema por línea', icon: 'splitTopic',
    enabled: s => s.canSplit,
    run: app => app.mindMap.execCommand('SPLIT_TOPICS')
  },
  'select.all': {
    label: 'Seleccionar', menuLabel: 'Seleccionar todo', tooltip: 'Seleccionar todos los temas', shortcut: 'Ctrl+A', icon: 'selectAll',
    enabled: hasMap,
    run: app => app.mindMap.execCommand('SELECT_ALL')
  },
  'select.siblings': {
    label: 'Seleccionar hermanos', tooltip: 'Seleccionar los temas del mismo padre', icon: 'selectSiblings', enabled: hasNonRootActiveNode,
    run: app => app.selectRelated('siblings')
  },
  'select.level': {
    label: 'Seleccionar el mismo nivel', tooltip: 'Seleccionar todos los temas visibles del mismo nivel', icon: 'selectLevel', enabled: hasActiveNode,
    run: app => app.selectRelated('level')
  },
  'select.branch': {
    label: 'Seleccionar la rama', tooltip: 'Seleccionar el tema y todos sus subtemas', icon: 'selectBranch', enabled: hasActiveNode,
    run: app => app.selectRelated('branch')
  },
  'select.sameMarkers': {
    label: 'Seleccionar con los mismos marcadores', tooltip: 'Seleccionar los temas que comparten algún marcador con el seleccionado',
    icon: 'selectMarkers', enabled: s => s.markers.firstHasMarkers,
    run: app => app.selectRelated('sameMarkers')
  },
  'clear.format': {
    label: 'Limpiar', menuLabel: 'Quitar formato', tooltip: 'Quitar el formato propio del tema (vuelve al estilo del mapa)', icon: 'clearFormat',
    enabled: hasActiveNode,
    run: app => app.clearTopics('format')
  },
  'clear.markers': {
    label: 'Quitar marcadores', tooltip: 'Quitar los marcadores de icono y de texto', icon: 'iconMarkers',
    enabled: s => s.markers.anyIcon || s.markers.anyTag,
    run: app => app.clearTopics('markers')
  },
  'clear.notes': {
    label: 'Quitar notas', icon: 'notes', enabled: s => s.elements.anyNote,
    run: app => app.clearTopics('notes')
  },
  'clear.links': {
    label: 'Quitar hipervínculos', icon: 'hyperlink', enabled: s => s.elements.anyHyperlink,
    run: app => app.clearTopics('links')
  },
  'clear.task': {
    label: 'Quitar información de tarea', tooltip: 'Quitar fechas, recursos, hito, prioridad y % completado', icon: 'taskInfo',
    enabled: s => s.task.any,
    run: app => app.clearTopics('task')
  },
  'clear.all': {
    label: 'Limpiar todo', tooltip: 'Quitar formato, marcadores, notas, vínculos, adjuntos e imágenes', icon: 'clearAll',
    enabled: hasActiveNode,
    run: app => app.clearTopics('all')
  },

  // ---- Formato (se aplica a todos los temas seleccionados) ----
  'format.fontFamily': {
    label: 'Fuente', control: 'select', enabled: hasActiveNode,
    options: s => fontFamilyOptions(s.style.fontFamily),
    value: s => s.style.fontFamily,
    run: (app, value) => app.applyStyle({ fontFamily: value })
  },
  'format.fontSize': {
    label: 'Tamaño de fuente', control: 'select', enabled: hasActiveNode,
    options: s => fontSizeOptions(s.style.fontSize),
    value: s => s.style.fontSize,
    run: (app, value) => app.applyStyle({ fontSize: Number(value) })
  },
  'format.growFont': {
    label: 'Agrandar fuente', icon: 'growFont', enabled: hasActiveNode,
    run: app => app.applyStyle(node => ({ fontSize: stepFontSize(node.style.merge('fontSize'), +1) }))
  },
  'format.shrinkFont': {
    label: 'Reducir fuente', icon: 'shrinkFont', enabled: hasActiveNode,
    run: app => app.applyStyle(node => ({ fontSize: stepFontSize(node.style.merge('fontSize'), -1) }))
  },
  'format.bold': {
    label: 'Negrita', shortcut: 'Ctrl+B', icon: 'bold', enabled: hasActiveNode,
    pressed: s => s.style.fontWeight === 'bold' || Number(s.style.fontWeight) >= 600,
    run: app => app.toggleStyle('fontWeight', 'bold', 'normal', s => s.style.fontWeight === 'bold' || Number(s.style.fontWeight) >= 600)
  },
  'format.italic': {
    label: 'Cursiva', shortcut: 'Ctrl+I', icon: 'italic', enabled: hasActiveNode,
    pressed: s => s.style.fontStyle === 'italic',
    run: app => app.toggleStyle('fontStyle', 'italic', 'normal', s => s.style.fontStyle === 'italic')
  },
  'format.underline': {
    label: 'Subrayado', shortcut: 'Ctrl+U', icon: 'underline', enabled: hasActiveNode,
    pressed: s => hasDecoration(s.style.textDecoration, 'underline'),
    run: app => app.toggleDecoration('underline')
  },
  'format.strike': {
    label: 'Tachado', icon: 'strike', enabled: hasActiveNode,
    pressed: s => hasDecoration(s.style.textDecoration, 'line-through'),
    run: app => app.toggleDecoration('line-through')
  },
  'format.fillColor': {
    label: 'Color de relleno', icon: 'fillColor', control: 'color', enabled: hasActiveNode,
    value: s => s.style.fillColor,
    // El tema usa degradados: hay que desactivarlos para que se vea el color elegido.
    // `null` = Automático: vuelve al relleno del tema (incluido su degradado).
    run: (app, color) => app.applyStyle(color === null
      ? { fillColor: undefined, gradientStyle: undefined }
      : { fillColor: color, gradientStyle: false })
  },
  'format.borderColor': {
    label: 'Color de línea', tooltip: 'Color de línea (borde del tema)', icon: 'borderColor', control: 'color', enabled: hasActiveNode,
    value: s => s.style.borderColor,
    // Los subtemas no tienen borde (grosor 0): se le da grosor 1 para que el color se vea
    run: (app, color) => app.applyStyle(node => color === null
      ? { borderColor: undefined, borderWidth: undefined }
      : { borderColor: color, ...(Number(node.style.merge('borderWidth')) > 0 ? {} : { borderWidth: 1 }) })
  },
  'format.fontColor': {
    label: 'Color de fuente', icon: 'fontColor', control: 'color', enabled: hasActiveNode,
    value: s => s.style.color,
    run: (app, color) => app.applyStyle({ color: color === null ? undefined : color })
  },
  'format.alignLeft': {
    label: 'Alinear a la izquierda', icon: 'alignLeft', enabled: hasActiveNode,
    pressed: s => s.style.textAlign === 'left',
    run: app => app.applyStyle({ textAlign: 'left' })
  },
  'format.alignCenter': {
    label: 'Centrar', icon: 'alignCenter', enabled: hasActiveNode,
    pressed: s => s.style.textAlign === 'center',
    run: app => app.applyStyle({ textAlign: 'center' })
  },
  'format.alignRight': {
    label: 'Alinear a la derecha', icon: 'alignRight', enabled: hasActiveNode,
    pressed: s => s.style.textAlign === 'right',
    run: app => app.applyStyle({ textAlign: 'right' })
  },

  // ---- Estilo ----
  'style.shape': {
    label: 'Forma del tema', tooltip: 'Cambiar la forma del tema', icon: 'shape', control: 'gallery', enabled: hasActiveNode,
    options: () => SHAPES,
    value: s => s.style.shape,
    run: (app, shape) => app.applyStyle({ shape })
  },

  // ---- Relación (flecha entre dos temas cualesquiera) ----
  'insert.relationship': {
    label: 'Relación', menuLabel: 'Dibujar relación',
    tooltip: 'Dibujar una relación desde el tema seleccionado (con dos temas seleccionados, los une)',
    icon: 'relationship', enabled: hasActiveNode,
    run: app => app.startRelationship()
  },
  'relationship.text': {
    label: 'Texto de la relación', icon: 'editText', enabled: s => s.relationshipActive,
    run: app => app.editRelationshipText()
  },
  'relationship.remove': {
    label: 'Eliminar relación', shortcut: 'Supr', icon: 'removeElement', enabled: s => s.relationshipActive,
    run: app => app.mindMap.associativeLine.removeLine()
  },

  // ---- Límite (marco alrededor de temas hermanos) ----
  'insert.boundary': {
    label: 'Límite', menuLabel: 'Límite con el estilo por defecto',
    tooltip: 'Rodear los temas seleccionados con un límite', icon: 'boundary',
    enabled: s => s.hasNonRootActiveNode || s.boundaryActive,
    run: app => app.applyBoundaryStyle(DEFAULT_BOUNDARY_STYLE.config)
  },
  'boundary.text': {
    label: 'Texto del límite', icon: 'editText', enabled: s => s.boundaryActive,
    run: app => app.editBoundaryText()
  },
  'boundary.remove': {
    label: 'Eliminar límite', shortcut: 'Supr', icon: 'removeElement', enabled: s => s.boundaryActive,
    run: app => app.mindMap.outerFrame.removeActiveOuterFrame()
  },

  // ---- Elementos del tema ----
  'element.hyperlink': {
    label: 'Hipervínculo', tooltip: 'Insertar o editar un hipervínculo', shortcut: 'Ctrl+K', icon: 'hyperlink', enabled: hasActiveNode,
    run: app => app.openHyperlinkDialog()
  },
  'element.attachment': {
    label: 'Adjunto', menuLabel: 'Adjuntar archivo…', tooltip: 'Adjuntar un archivo al tema', icon: 'attachment', enabled: hasActiveNode,
    run: app => app.addAttachment()
  },
  'element.attachment.open': {
    label: 'Abrir adjunto', tooltip: 'Descargar el archivo adjunto', icon: 'attachment',
    enabled: s => s.elements.hasAttachment,
    run: app => app.openAttachment()
  },
  'element.attachment.remove': {
    label: 'Quitar adjunto', icon: 'removeElement', enabled: s => s.elements.anyAttachment,
    run: app => app.setElementData({ attachmentUrl: undefined, attachmentName: undefined })
  },
  'element.notes': {
    // Sin atajo: el de MindManager (Ctrl+T) abre una pestaña nueva y el navegador no deja interceptarlo
    label: 'Notas', tooltip: 'Escribir notas del tema', icon: 'notes', enabled: s => s.activeCount === 1,
    pressed: s => s.pane === 'notes',
    run: app => app.openNotes()
  },
  'element.image': {
    label: 'Imagen', menuLabel: 'Insertar imagen…', tooltip: 'Insertar una imagen en el tema', icon: 'image', enabled: hasActiveNode,
    run: app => app.addImage()
  },
  'element.image.remove': {
    label: 'Quitar imagen', icon: 'removeElement', enabled: s => s.elements.anyImage,
    run: app => app.setElementData({ image: undefined, imageTitle: undefined, imageSize: undefined })
  },

  // ---- Marcadores ----
  // Los desplegables (iconos y marcadores de texto) los pinta la cinta a partir del mapa;
  // estos comandos son los botones principales y los pies de esos desplegables
  'markers.icons': {
    label: 'Marcadores de icono', tooltip: 'Mostrar los marcadores de icono', icon: 'iconMarkers',
    pressed: s => s.pane === 'markers',
    run: app => app.togglePane('markers')
  },
  'markers.icons.clear': {
    label: 'Quitar todos los iconos', tooltip: 'Quitar los marcadores de icono de los temas seleccionados', icon: 'removeElement',
    enabled: s => s.markers.anyIcon,
    run: app => app.setElementData({ icon: undefined })
  },
  'markers.tags': {
    label: 'Marcador de texto', menuLabel: 'Nuevo marcador de texto…',
    tooltip: 'Añadir un marcador de texto a los temas seleccionados', icon: 'textMarker', enabled: hasActiveNode,
    run: app => app.openTextMarkerDialog()
  },
  'markers.tags.clear': {
    label: 'Quitar marcadores de texto', tooltip: 'Quitar los marcadores de texto de los temas seleccionados', icon: 'removeElement',
    enabled: s => s.markers.anyTag,
    run: app => app.setElementData({ tag: undefined })
  },
  'markers.tags.newCategory': {
    label: 'Nueva categoría…', tooltip: 'Crear una categoría de marcadores de texto', icon: 'newCategory', enabled: hasMap,
    run: app => app.openCategoryDialog()
  },
  'markers.manage': {
    label: 'Administrar marcadores', tooltip: 'Abrir el panel Marcadores', icon: 'manageMarkers',
    run: app => app.showPane('markers')
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
  'pane.notes': {
    label: 'Notas', tooltip: 'Mostrar u ocultar las Notas del tema', icon: 'notes',
    pressed: s => s.pane === 'notes',
    run: app => app.togglePane('notes')
  },
  'pane.taskInfo': {
    label: 'Info. de tarea', tooltip: 'Prioridad, % completado, fechas, hito y recursos del tema', icon: 'taskInfo',
    pressed: s => s.pane === 'taskInfo',
    run: app => app.togglePane('taskInfo')
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

// Un comando por estilo de límite (con su vista previa como icono): aplica el estilo al límite
// seleccionado o, si no hay ninguno, crea un límite nuevo con ese estilo
BOUNDARY_STYLES.forEach(style => {
  ICONS[`boundary_${style.id}`] = boundaryPreview(style.config)
  COMMANDS[`boundary.style.${style.id}`] = {
    label: style.label, tooltip: `Límite: ${style.label.toLowerCase()}`, icon: `boundary_${style.id}`,
    enabled: s => s.hasNonRootActiveNode || s.boundaryActive,
    run: app => app.applyBoundaryStyle(style.config)
  }
})

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
  options(id, selection) {
    const cmd = this.get(id)
    return cmd.options ? cmd.options(selection) : []
  },
  value(id, selection) {
    const cmd = this.get(id)
    return cmd.value ? cmd.value(selection) : undefined
  },
  // Devuelve lo que devuelva el comando (una promesa en los asíncronos) o false si no se
  // ejecutó por estar deshabilitado
  run(id, app, value) {
    if (!this.isEnabled(id, app.selection)) return false
    const result = this.get(id).run(app, value)
    return result === undefined ? true : result
  }
}
