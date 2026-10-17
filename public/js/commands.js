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
// Comandos que actúan sobre el lienzo (zoom, dibujar con el ratón): no en la vista Esquema
const inMapView = s => s.hasMap && s.viewMode === 'map'

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
    enabled: s => s.painterActive || (s.hasActiveNode && s.viewMode === 'map'),
    pressed: s => s.painterActive,
    run: app => app.togglePainter()
  },

  // ---- Mapa ----
  'map.new': {
    label: 'Nuevo mapa', icon: 'newMap',
    run: app => app.createMap()
  },
  'map.newFromTemplate': {
    label: 'Desde plantilla', menuLabel: 'Nuevo desde plantilla…', tooltip: 'Crear un mapa a partir de una plantilla', icon: 'template',
    run: app => app.openTemplateGallery()
  },
  'map.saveAsTemplate': {
    label: 'Guardar como plantilla', tooltip: 'Guardar este mapa como plantilla para crear otros iguales', icon: 'saveTemplate',
    enabled: hasMap,
    run: app => app.openSaveTemplateDialog()
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
    run: app => app.insertTopic('INSERT_NODE')
  },
  'topic.insertBefore': {
    label: 'Tema antes', tooltip: 'Insertar tema al mismo nivel, antes', shortcut: 'Shift+Enter', icon: 'topicBefore',
    enabled: hasNonRootActiveNode,
    run: app => app.insertTopic('INSERT_NODE_BEFORE')
  },
  'topic.insertParent': {
    label: 'Tema padre', tooltip: 'Insertar un tema padre del seleccionado', shortcut: 'Shift+Tab', icon: 'topicParent',
    enabled: hasNonRootActiveNode,
    run: app => app.insertTopic('INSERT_PARENT_NODE')
  },
  'topic.insertChild': {
    label: 'Subtema', tooltip: 'Insertar subtema', shortcut: 'Tab', icon: 'subtopic', enabled: hasActiveNode,
    run: app => app.insertTopic('INSERT_CHILD_NODE')
  },
  'topic.remove': {
    label: 'Eliminar', tooltip: 'Eliminar tema', shortcut: 'Supr', icon: 'remove', enabled: hasActiveNode,
    run: app => app.mindMap.execCommand('REMOVE_NODE')
  },
  'topic.promote': {
    label: 'Subir de nivel', tooltip: 'Convertir el tema en hermano de su tema padre', shortcut: 'Alt+Mayús+←', icon: 'promote',
    enabled: s => s.canPromote,
    run: app => app.mindMap.execCommand('PROMOTE_TOPICS')
  },
  'topic.demote': {
    label: 'Bajar de nivel', tooltip: 'Convertir el tema en subtema del tema anterior', shortcut: 'Alt+Mayús+→', icon: 'demote',
    enabled: s => s.canDemote,
    run: app => app.mindMap.execCommand('DEMOTE_TOPICS')
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
  'style.shadow': {
    label: 'Sombra', tooltip: 'Sombra en los temas seleccionados', icon: 'shadow', enabled: hasActiveNode,
    pressed: s => s.hasActiveNode && s.style.shadow,
    run: app => app.toggleStyle('shadow', true, false, s => s.style.shadow)
  },

  // ---- Relación (flecha entre dos temas cualesquiera) ----
  'insert.relationship': {
    label: 'Relación', menuLabel: 'Dibujar relación',
    tooltip: 'Dibujar una relación desde el tema seleccionado (con dos temas seleccionados, los une)',
    // Se dibuja con el ratón sobre el lienzo; con dos temas seleccionados se puede unir desde el esquema
    icon: 'relationship', enabled: s => s.hasActiveNode && (s.viewMode === 'map' || s.activeCount === 2),
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

  // ---- Llamada (nota flotante anclada a un tema) ----
  'insert.callout': {
    label: 'Llamada', menuLabel: 'Insertar llamada…', tooltip: 'Añadir una llamada (nota flotante) al tema seleccionado',
    icon: 'callout', enabled: hasActiveNode,
    run: app => app.openCalloutDialog()
  },
  'callout.edit': {
    label: 'Editar llamada…', tooltip: 'Cambiar el texto de la llamada seleccionada (también con doble clic)', icon: 'editText',
    enabled: s => s.calloutActive,
    run: app => app.openCalloutDialog(app.calloutActive)
  },
  'callout.remove': {
    label: 'Eliminar llamada', shortcut: 'Supr', icon: 'removeElement', enabled: s => s.calloutActive,
    run: app => app.removeActiveCallout()
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

  'layout.org': {
    label: 'Organigrama', tooltip: 'Organigrama (ramas hacia abajo)', icon: 'layoutOrg', enabled: hasMap,
    pressed: s => s.hasMap && s.layout === 'organizationStructure',
    run: app => app.setLayout('organizationStructure')
  },
  'layout.timeline': {
    label: 'Línea de tiempo', tooltip: 'Línea de tiempo (temas principales en orden)', icon: 'layoutTimeline', enabled: hasMap,
    pressed: s => s.hasMap && s.layout === 'timeline',
    run: app => app.setLayout('timeline')
  },
  'layout.fishbone': {
    label: 'Espina de pez', tooltip: 'Diagrama de causa y efecto (Ishikawa)', icon: 'layoutFishbone', enabled: hasMap,
    pressed: s => s.hasMap && s.layout === 'fishbone',
    run: app => app.setLayout('fishbone')
  },
  'layout.more': {
    label: 'Más diseños', tooltip: 'Otras variantes de diseño: árbol a la izquierda, líneas de tiempo verticales…', icon: 'layoutMore',
    control: 'gallery', enabled: hasMap,
    options: () => LAYOUT_VARIANTS.map(v => ({ ...v, preview: LAYOUT_PREVIEWS[v.value] })),
    value: s => s.layout,
    run: (app, layout) => app.setLayout(layout)
  },

  // ---- Formato del mapa (tema visual, ramas, espaciado, fondo y sombras) ----
  // Se aplica a todo el mapa y queda en el historial (map-format.js)
  'mapTheme.apply': {
    label: 'Temas', tooltip: 'Aplicar un tema visual al mapa (colores, ramas y fondo)', icon: 'mapTheme',
    control: 'gallery', enabled: hasMap,
    options: () => MAP_THEMES.map(t => ({ value: t.id, label: t.label, preview: mapThemePreview(t.config) })),
    value: s => s.mapFormat.theme,
    run: (app, theme) => app.setMapFormat({ theme }, { reset: true })
  },
  'mapFormat.reset': {
    label: 'Restablecer', tooltip: 'Volver al formato del tema: quita los cambios de ramas, espaciado, fondo y sombras',
    icon: 'mapReset', enabled: s => s.hasMap && s.mapFormat.customized,
    run: app => app.setMapFormat({}, { reset: true })
  },
  'mapFormat.shadow': {
    label: 'Sombras', tooltip: 'Sombra en los temas de todo el mapa', icon: 'shadow', enabled: hasMap,
    pressed: s => s.hasMap && s.mapFormat.shadow,
    run: app => app.setMapFormat({ shadow: !app.selection.mapFormat.shadow })
  },
  'mapFormat.lineStyle': {
    label: 'Forma de las ramas', control: 'select', enabled: hasMap,
    options: () => LINE_STYLES,
    value: s => s.mapFormat.lineStyle,
    run: (app, lineStyle) => app.setMapFormat({ lineStyle })
  },
  'mapFormat.lineWidth': {
    label: 'Grosor de las ramas', control: 'select', enabled: hasMap,
    options: () => LINE_WIDTHS,
    value: s => s.mapFormat.lineWidth,
    run: (app, lineWidth) => app.setMapFormat({ lineWidth })
  },
  'mapFormat.lineColor': {
    label: 'Color de las ramas', icon: 'lineColor', control: 'color', enabled: hasMap,
    value: s => s.mapFormat.lineColor,
    // `null` = Automático: el color del tema
    run: (app, lineColor) => app.setMapFormat({ lineColor })
  },
  'mapFormat.rainbow': {
    label: 'Ramas de colores', tooltip: 'Un color distinto para cada rama principal', icon: 'rainbow', enabled: hasMap,
    pressed: s => s.hasMap && s.mapFormat.rainbow,
    run: app => app.setMapFormat({ rainbow: !app.selection.mapFormat.rainbow })
  },
  'mapFormat.spacing': {
    label: 'Espaciado entre temas', control: 'select', enabled: hasMap,
    options: () => SPACINGS,
    value: s => s.mapFormat.spacing,
    run: (app, spacing) => app.setMapFormat({ spacing })
  },
  'mapFormat.background': {
    label: 'Color de fondo', tooltip: 'Color de fondo del mapa', icon: 'background', control: 'color', enabled: hasMap,
    value: s => s.mapFormat.background,
    run: (app, background) => app.setMapFormat({ background })
  },

  // ---- Vista ----
  'view.map': {
    label: 'Mapa', tooltip: 'Vista Mapa: el mapa con sus ramas', icon: 'viewMap', enabled: hasMap,
    pressed: s => s.hasMap && s.viewMode === 'map',
    run: app => app.setViewMode('map')
  },
  'view.outline': {
    label: 'Esquema', tooltip: 'Vista Esquema: los temas como lista con sangría', icon: 'viewOutline', enabled: hasMap,
    pressed: s => s.hasMap && s.viewMode === 'outline',
    run: app => app.setViewMode('outline')
  },
  'view.presentation': {
    label: 'Presentación', tooltip: 'Presentar el mapa tema a tema a pantalla completa (← → para avanzar, Esc para salir)',
    icon: 'presentation', enabled: hasMap,
    run: app => app.startPresentation()
  },
  'view.zoomIn': {
    label: 'Acercar', tooltip: 'Acercar zoom', shortcut: 'Ctrl++', icon: 'zoomIn', enabled: inMapView,
    run: app => app.mindMap.view.enlarge()
  },
  'view.zoomOut': {
    label: 'Alejar', tooltip: 'Alejar zoom', shortcut: 'Ctrl+-', icon: 'zoomOut', enabled: inMapView,
    run: app => app.mindMap.view.narrow()
  },
  'view.fit': {
    label: 'Ajustar', tooltip: 'Ajustar el mapa a la ventana', icon: 'fit', enabled: inMapView,
    run: app => app.mindMap.view.fit()
  },
  'view.actualSize': {
    label: '100%', tooltip: 'Tamaño real (100%)', icon: 'actualSize', enabled: inMapView,
    run: app => app.mindMap.view.reset()
  },

  // ---- Buscar y filtrar ----
  'view.find': {
    label: 'Buscar', tooltip: 'Buscar texto en los temas', shortcut: 'Ctrl+F', icon: 'find', enabled: hasMap,
    pressed: s => s.findOpen && !s.findReplace,
    run: app => app.openFind(false)
  },
  'view.replace': {
    label: 'Reemplazar', tooltip: 'Buscar y reemplazar texto en los temas', shortcut: 'Ctrl+H', icon: 'replace', enabled: hasMap,
    pressed: s => s.findOpen && s.findReplace,
    run: app => app.openFind(true)
  },
  'pane.filter': {
    label: 'Filtro', tooltip: 'Mostrar solo los temas que cumplan unos criterios (marcadores, recursos, fechas…)', icon: 'filter',
    enabled: hasMap,
    pressed: s => s.pane === 'filter' || s.filterActive,
    run: app => app.togglePane('filter')
  },
  'view.filter.clear': {
    label: 'Quitar filtro', icon: 'filterClear', enabled: s => s.filterActive,
    run: app => app.clearFilter()
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
  'export.html': {
    label: 'HTML interactivo', tooltip: 'Exportar un archivo HTML de solo lectura en el que las ramas se despliegan y contraen con clics',
    icon: 'exportHtml', enabled: hasMap,
    run: app => app.exportHtml()
  },
  'export.pdf': {
    label: 'Exportar PDF', tooltip: 'Exportar como documento PDF', icon: 'exportPdf', enabled: hasMap,
    run: app => app.exportMap('pdf')
  },
  'export.word': {
    label: 'Word', tooltip: 'Exportar a un documento de Word (.docx): un título por tema, con sus notas, marcadores y tareas',
    icon: 'exportWord', enabled: hasMap,
    run: app => app.exportDocument('docx')
  },
  'export.markdown': {
    label: 'Markdown', tooltip: 'Exportar a Markdown (.md): un título por tema, con sus notas, marcadores y tareas',
    icon: 'exportMarkdown', enabled: hasMap,
    run: app => app.exportDocument('md')
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
