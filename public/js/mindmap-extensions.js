// Extensiones propias sobre simple-mind-map: comandos y comportamientos que la librería no
// trae, o que se ajustan para comportarse como MindManager. Se aplican a cada instancia
// nueva desde app.js (extendMindMap) y al construirla (createMindMapErrorHandler).

const SMM_ERRORS = { READ_CLIPBOARD: 'read_clipboard_error' }

// Pegar con respaldo. La librería lee el portapapeles del sistema cuando el navegador lo
// permite; si el usuario deniega el permiso o el navegador lo bloquea, la librería no pega
// nada. En ese caso se pegan los temas copiados dentro de la propia app.
function createMindMapErrorHandler(getMindMap, onError) {
  return (code, error) => {
    const mindMap = getMindMap()
    if (code === SMM_ERRORS.READ_CLIPBOARD && mindMap && mindMap.renderer.beingCopyData) {
      mindMap.execCommand('PASTE_NODE', mindMap.renderer.beingCopyData)
      return
    }
    onError(code, error)
  }
}

function createUid() {
  return crypto.randomUUID()
}

// Inserta un tema hermano ANTES de cada tema activo (la librería solo inserta después).
// Replica la lógica de Render.insertNode para que el tema nuevo entre en edición igual que
// con Enter, y se registra como comando para que quede en el historial (deshacer/rehacer).
function insertNodeBefore(mindMap) {
  const renderer = mindMap.renderer
  const list = renderer.activeNodeList.filter(node => !node.isRoot && !node.isGeneralization)
  if (list.length === 0) return
  renderer.textEdit.hideEditTextBox()

  const { defaultInsertSecondLevelNodeText, defaultInsertBelowSecondLevelNodeText } = mindMap.opt
  const { focusNewNode, inserting } = renderer.getNewNodeBehavior(true, list.length > 1)
  const isRichText = renderer.hasRichTextPlugin()

  list.forEach(node => {
    const siblings = node.parent.nodeData.children
    const index = siblings.findIndex(item => item.data.uid === node.uid)
    const data = {
      text: node.layerIndex === 1 ? defaultInsertSecondLevelNodeText : defaultInsertBelowSecondLevelNodeText,
      uid: createUid(),
      expand: true,
      richText: isRichText,
      isActive: focusNewNode
    }
    if (isRichText) data.resetRichText = true
    siblings.splice(index, 0, { inserting, data, children: [] })
  })

  if (focusNewNode) renderer.clearActiveNodeList()
  mindMap.render()
}

// Copiar formato de un solo uso, como en Office/MindManager: tras aplicar el estilo a un
// tema se desactiva. Escape lo cancela.
function makePainterOneShot(mindMap) {
  const painter = mindMap.painter
  if (!painter) return
  // Se registra después del plugin, así que se ejecuta cuando el estilo ya se aplicó
  mindMap.on('node_click', node => {
    if (painter.isInPainter && painter.painterNode && node && node.uid !== painter.painterNode.uid) {
      painter.onEndPainter()
    }
  })
}

// Aplica estilos a todos los temas activos como UNA sola entrada del historial (con
// SET_NODE_STYLES habría una por tema). `styleFor(node)` devuelve el objeto de estilo de
// cada tema, para operaciones relativas como alternar negrita o agrandar la fuente.
// Un valor `undefined` elimina el estilo propio y el tema vuelve al estilo de su nivel.
function setActiveNodesStyle(mindMap, styleFor) {
  const renderer = mindMap.renderer
  renderer.activeNodeList.forEach(node => {
    const style = typeof styleFor === 'function' ? styleFor(node) : styleFor
    if (style && Object.keys(style).length) renderer.setNodeStyles(node, style)
  })
}

// Igual que setActiveNodesStyle pero para datos que no son estilo (hipervínculo, nota,
// imagen, adjunto). `undefined` elimina el dato. Una sola entrada de historial.
function setActiveNodesData(mindMap, dataFor) {
  const renderer = mindMap.renderer
  renderer.activeNodeList.forEach(node => {
    const data = typeof dataFor === 'function' ? dataFor(node) : dataFor
    if (data && Object.keys(data).length) renderer.setNodeDataRender(node, data)
  })
}

// Cambia las definiciones de los marcadores de texto (en el tema central) y lleva los
// renombrados, borrados y colores a todos los temas del mapa, también a los que están
// dentro de ramas contraídas. Con `assignName`, además asigna ese marcador a los temas
// seleccionados (crear un marcador desde el diálogo y aplicarlo es un solo paso al deshacer).
// Una sola entrada de historial.
function setTextMarkers(mindMap, newDefs, assignName) {
  const renderer = mindMap.renderer
  const root = renderer.root
  if (!root) return
  // Copia plana y normalizada: lo que llega puede traer proxies de Alpine
  newDefs = normalizeMarkerDefs(JSON.parse(JSON.stringify(newDefs)))
  const oldDefs = normalizeMarkerDefs(root.getData('textMarkers'))
  const migrate = tagMigration(oldDefs, newDefs)
  const walk = nodeData => {
    const current = nodeData.data.tag
    if (current && current.length) {
      const next = migrate(current)
      if (!sameTags(next, current)) {
        // Los temas pintados se vuelven a dibujar; los de ramas contraídas solo cambian el dato
        const node = renderer.findNodeByUid(nodeData.data.uid)
        if (node) {
          renderer.setNodeData(node, { tag: next })
          node.reRender()
        } else {
          nodeData.data.tag = next
        }
      }
    }
    ;(nodeData.children || []).forEach(walk)
  }
  walk(renderer.renderTree)
  renderer.setNodeData(root, { textMarkers: newDefs })
  if (assignName) {
    renderer.activeNodeList.forEach(node => {
      renderer.setNodeData(node, { tag: toggleTagList(node.getData('tag'), newDefs, assignName, true) })
      node.reRender()
    })
  }
  mindMap.render()
}

// Apertura segura de hipervínculos: la librería pinta <a href> con el valor tal cual; aquí
// se vuelve a validar el esquema en el momento del clic (defensa en profundidad) y se abre
// sin dar acceso a window.opener.
function openHyperlinkSafely(url) {
  if (!isSafeHyperlink(url)) {
    console.warn('Vínculo bloqueado por esquema no permitido:', url)
    return false
  }
  window.open(url, '_blank', 'noopener,noreferrer')
  return true
}

// Los cuadros de edición del texto de una relación y de un límite se rellenan con
// innerHTML a partir del texto guardado: un mapa con texto "<img onerror=…>" ejecutaría
// código al editarlo. Mientras se rellena el cuadro, getText devuelve el texto escapado;
// al guardar, la librería lo decodifica (textContent), así que el texto no cambia.
// Estos métodos se enlazan por instancia en el constructor del plugin, por eso se parchean
// sobre cada instancia y no sobre el prototipo.
function guardTextEditBoxes(mindMap) {
  for (const plugin of [mindMap.associativeLine, mindMap.outerFrame]) {
    if (!plugin || plugin.__mmEditGuarded) continue
    const show = plugin.showEditTextBox
    const getText = plugin.getText
    plugin.showEditTextBox = function (...args) {
      this.getText = (...a) => {
        const text = getText.apply(this, a)
        return text ? escapeXml(text) : text
      }
      try {
        return show.apply(this, args)
      } finally {
        this.getText = getText
      }
    }
    plugin.__mmEditGuarded = true
  }
}

function extendMindMap(mindMap) {
  guardTextEditBoxes(mindMap)
  mindMap.command.add('INSERT_NODE_BEFORE', () => insertNodeBefore(mindMap))
  mindMap.command.add('SET_ACTIVE_NODES_STYLE', styleFor => setActiveNodesStyle(mindMap, styleFor))
  mindMap.command.add('SET_ACTIVE_NODES_DATA', dataFor => setActiveNodesData(mindMap, dataFor))
  mindMap.command.add('SET_TEXT_MARKERS', (defs, assignName) => setTextMarkers(mindMap, defs, assignName))
  mindMap.keyCommand.addShortcut('Shift+Enter', () => mindMap.execCommand('INSERT_NODE_BEFORE'))
  makePainterOneShot(mindMap)
}

// ---- Correcciones de errores de la librería (simple-mind-map 0.14.0-fix.3) ----
// Se aplican una vez, al cargar, sobre los prototipos de los plugins: los constructores
// envuelven algunos métodos en throttle() y capturan la versión del prototipo, así que el
// parche tiene que estar antes de crear cualquier mapa. Revisar al actualizar la librería.
function patchLibraryBugs(MindMap) {
  const plugin = name => (MindMap.pluginList || []).find(p => p.instanceName === name)

  // AssociativeLine.checkOverlapNode va con throttle (100 ms): la llamada diferida puede
  // ejecutarse después de terminar la relación, con creatingStartNode ya a null, y lanza
  // "Cannot read properties of null (reading 'uid')".
  const AssociativeLine = plugin('associativeLine')
  if (AssociativeLine && !AssociativeLine.prototype.__mmPatched) {
    const original = AssociativeLine.prototype.checkOverlapNode
    AssociativeLine.prototype.checkOverlapNode = function (...args) {
      if (!this.isCreatingLine || !this.creatingStartNode) return
      return original.apply(this, args)
    }
    AssociativeLine.prototype.__mmPatched = true
  }
}

if (typeof simpleMindMap !== 'undefined') patchLibraryBugs(simpleMindMap.default || simpleMindMap)

// Atajos de formato de Office/MindManager. La librería usa Ctrl+I para "ajustar a la
// ventana"; aquí pasa a ser cursiva (ajustar sigue en la cinta y en la barra de estado).
function bindFormatShortcuts(mindMap, runCommand) {
  mindMap.keyCommand.removeShortcut('Control+i')
  mindMap.keyCommand.addShortcut('Control+b', () => runCommand('format.bold'))
  mindMap.keyCommand.addShortcut('Control+i', () => runCommand('format.italic'))
  mindMap.keyCommand.addShortcut('Control+u', () => runCommand('format.underline'))
  mindMap.keyCommand.addShortcut('Control+k', () => runCommand('element.hyperlink'))
}
