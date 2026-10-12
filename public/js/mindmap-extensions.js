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

function extendMindMap(mindMap) {
  mindMap.command.add('INSERT_NODE_BEFORE', () => insertNodeBefore(mindMap))
  mindMap.command.add('SET_ACTIVE_NODES_STYLE', styleFor => setActiveNodesStyle(mindMap, styleFor))
  mindMap.command.add('SET_ACTIVE_NODES_DATA', dataFor => setActiveNodesData(mindMap, dataFor))
  mindMap.keyCommand.addShortcut('Shift+Enter', () => mindMap.execCommand('INSERT_NODE_BEFORE'))
  makePainterOneShot(mindMap)
}

// Atajos de formato de Office/MindManager. La librería usa Ctrl+I para "ajustar a la
// ventana"; aquí pasa a ser cursiva (ajustar sigue en la cinta y en la barra de estado).
function bindFormatShortcuts(mindMap, runCommand) {
  mindMap.keyCommand.removeShortcut('Control+i')
  mindMap.keyCommand.addShortcut('Control+b', () => runCommand('format.bold'))
  mindMap.keyCommand.addShortcut('Control+i', () => runCommand('format.italic'))
  mindMap.keyCommand.addShortcut('Control+u', () => runCommand('format.underline'))
  mindMap.keyCommand.addShortcut('Control+k', () => runCommand('element.hyperlink'))
}
