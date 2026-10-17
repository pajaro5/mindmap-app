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
// Con `openEdit` false (vista Esquema) el tema nuevo solo queda seleccionado.
function insertNodeBefore(mindMap, openEdit = true) {
  const renderer = mindMap.renderer
  const list = renderer.activeNodeList.filter(node => !node.isRoot && !node.isGeneralization)
  if (list.length === 0) return
  renderer.textEdit.hideEditTextBox()

  const { defaultInsertSecondLevelNodeText, defaultInsertBelowSecondLevelNodeText } = mindMap.opt
  const { focusNewNode, inserting } = renderer.getNewNodeBehavior(openEdit, list.length > 1)
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
  const oldDefs = normalizeMarkerDefs(root.getData(TEXT_MARKERS_KEY))
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
  renderer.setNodeData(root, { [TEXT_MARKERS_KEY]: newDefs })
  if (assignName) {
    renderer.activeNodeList.forEach(node => {
      renderer.setNodeData(node, { tag: toggleTagList(node.getData('tag'), newDefs, assignName, true) })
      node.reRender()
    })
  }
  mindMap.render()
}

// ---- Edición: Dividir, Seleccionar, Limpiar ----

// Líneas de texto de un tema. Con texto enriquecido el texto es HTML: cada párrafo y cada
// <br> es una línea. Se lee con DOMParser (documento inerte: no ejecuta nada)
function topicLines(text) {
  const raw = String(text || '')
  const plain = /<[a-z][\s\S]*>/i.test(raw)
    ? new DOMParser().parseFromString(
      raw.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6])>/gi, '\n'), 'text/html').body.textContent
    : raw
  return plain.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
}

// Divide cada tema seleccionado de varias líneas: el tema se queda con la primera línea
// (y con sus subtemas) y cada línea siguiente pasa a ser un tema hermano a continuación
function splitTopics(mindMap) {
  const renderer = mindMap.renderer
  const isRichText = renderer.hasRichTextPlugin()
  const list = renderer.activeNodeList.filter(node => !node.isRoot && !node.isGeneralization)
  let changed = false
  list.forEach(node => {
    const lines = topicLines(node.getData('text'))
    if (lines.length < 2) return
    changed = true
    // Con texto enriquecido el texto es HTML: hay que escapar lo que escribió el usuario
    const textData = line => isRichText
      ? { text: escapeXml(line), richText: true, resetRichText: true }
      : { text: line, richText: false }
    renderer.setNodeData(node, textData(lines[0]))
    node.reRender()
    const siblings = node.parent.nodeData.children
    const index = siblings.findIndex(item => item.data.uid === node.uid)
    const created = lines.slice(1).map(line => ({ data: { ...textData(line), uid: createUid(), expand: true }, children: [] }))
    siblings.splice(index + 1, 0, ...created)
  })
  if (changed) mindMap.render()
}

// Temas pintados (los de ramas contraídas no se pueden seleccionar)
function visibleNodes(mindMap) {
  const result = []
  const walk = node => {
    if (!node) return
    result.push(node)
    if (node.getData('expand') !== false) (node.children || []).forEach(walk)
  }
  walk(mindMap.renderer.root)
  return result
}

function selectTopics(mindMap, nodes) {
  const renderer = mindMap.renderer
  const unique = [...new Set(nodes)]
  if (!unique.length) return
  renderer.clearActiveNodeList()
  renderer.activeMultiNode(unique)
}

// Selecciones derivadas de la actual, como el desplegable Seleccionar de MindManager
const TOPIC_SELECTORS = {
  // Los hermanos de cada tema seleccionado (el central no tiene: se queda él)
  siblings: (active) => active.flatMap(node => node.parent ? node.parent.children : [node]),
  // Todos los temas visibles del mismo nivel que alguno de los seleccionados
  level: (active, all) => {
    const levels = new Set(active.map(node => node.layerIndex))
    return all.filter(node => levels.has(node.layerIndex))
  },
  // Los seleccionados con todos sus subtemas visibles
  branch: (active, all) => all.filter(node => active.some(a => a === node || isDescendant(node, a))),
  // Temas con algún marcador (icono o texto) en común con el primero seleccionado
  sameMarkers: (active, all) => {
    const keysOf = node => [
      ...(node.getData('icon') || []).map(id => `i:${id}`),
      ...(node.getData('tag') || []).map(t => `t:${markerKey(tagText(t))}`)
    ]
    const wanted = new Set(keysOf(active[0]))
    if (!wanted.size) return [active[0]]
    return all.filter(node => keysOf(node).some(k => wanted.has(k)))
  }
}

function isDescendant(node, ancestor) {
  for (let p = node.parent; p; p = p.parent) if (p === ancestor) return true
  return false
}

function selectRelated(mindMap, kind) {
  const active = mindMap.renderer.activeNodeList.filter(node => !node.isGeneralization)
  if (!active.length) return
  selectTopics(mindMap, TOPIC_SELECTORS[kind](active, visibleNodes(mindMap)))
}

// ---- Subir y bajar de nivel (como en un esquema) ----
// Temas seleccionados que se pueden mover, en orden de lectura y sin los que ya van dentro
// de otro seleccionado (se mueven con su rama)
function movableTopics(mindMap) {
  const active = mindMap.renderer.activeNodeList.filter(node => !node.isRoot && !node.isGeneralization)
  const order = new Map(visibleNodes(mindMap).map((node, i) => [node.uid, i]))
  return active
    .filter(node => !active.some(other => other !== node && isDescendant(node, other)))
    .sort((a, b) => order.get(a.uid) - order.get(b.uid))
}

const childIndex = (children, uid) => children.findIndex(item => item.data.uid === uid)

// Subir de nivel: el tema pasa a ser hermano de su padre, justo después de él. Varios
// temas del mismo padre conservan su orden. Los temas principales no suben más.
function promoteTopics(mindMap) {
  const lastPlaced = new Map()
  let changed = false
  movableTopics(mindMap).forEach(node => {
    const parent = node.parent
    const grandpa = parent && parent.parent
    if (!grandpa) return
    const siblings = parent.nodeData.children
    siblings.splice(childIndex(siblings, node.uid), 1)
    const uncles = grandpa.nodeData.children
    const anchor = lastPlaced.get(parent.uid) || parent.uid
    uncles.splice(childIndex(uncles, anchor) + 1, 0, node.nodeData)
    lastPlaced.set(parent.uid, node.uid)
    changed = true
  })
  if (changed) mindMap.render()
}

// Bajar de nivel: el tema pasa a ser el último subtema de su hermano anterior (el primero
// de sus hermanos no puede bajar). Varios hermanos seguidos bajan juntos y en orden.
function demoteTopics(mindMap) {
  let changed = false
  movableTopics(mindMap).forEach(node => {
    const siblings = node.parent && node.parent.nodeData.children
    if (!siblings) return
    const index = childIndex(siblings, node.uid)
    if (index <= 0) return
    const target = siblings[index - 1]
    siblings.splice(index, 1)
    target.children = target.children || []
    target.children.push(node.nodeData)
    target.data.expand = true
    changed = true
  })
  if (changed) mindMap.render()
}

// Qué borra cada opción de Limpiar: `format` quita el formato propio (vuelve al del tema
// visual) y `keys` son los datos del tema que se eliminan
const CLEAR_PARTS = {
  format: { format: true, keys: [] },
  markers: { keys: ['icon', 'tag'] },
  notes: { keys: ['note'] },
  links: { keys: ['hyperlink', 'hyperlinkTitle'] },
  // Información de tarea: sus datos y los iconos de prioridad y progreso (el resto se queda)
  task: { keys: [TASK_KEY], taskIcons: true },
  all: { format: true, keys: ['icon', 'tag', 'note', 'hyperlink', 'hyperlinkTitle', 'attachmentUrl', 'attachmentName', 'image', 'imageTitle', 'imageSize', TASK_KEY, CALLOUTS_KEY] }
}

function clearTopics(mindMap, part) {
  const spec = CLEAR_PARTS[part]
  if (!spec) return
  const renderer = mindMap.renderer
  renderer.activeNodeList.forEach(node => {
    // removeCustomStyles borra los campos que la librería considera estilo; los datos
    // propios que empiezan por "_" (p. ej. las categorías de marcadores) no se tocan
    if (spec.format) renderer.removeCustomStyles(node)
    const present = spec.keys.filter(key => node.getData(key) !== undefined)
    const changes = Object.fromEntries(present.map(key => [key, undefined]))
    if (spec.taskIcons && node.getData('icon')) {
      changes.icon = withProgress(withPriority(node.getData('icon'), 0), 0)
    }
    if (Object.keys(changes).length) {
      renderer.setNodeData(node, changes)
      node.reRender()
    }
  })
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

// Esc termina la edición del texto de un tema (la librería solo la termina con Enter o
// con un clic fuera). Sin esto, tras pulsar Esc el cuadro seguía abierto con el foco
// dentro y los atajos (Ctrl+Z, Tab, Supr…) no respondían. Se conserva lo escrito, como al
// pulsar Enter: así un Esc no hace perder texto.
function bindEscapeToEndEditing(mindMap) {
  const onKeydown = e => {
    if (e.key !== 'Escape') return
    const textEdit = mindMap.renderer && mindMap.renderer.textEdit
    if (!textEdit || !textEdit.isShowTextEdit()) return
    e.preventDefault()
    e.stopPropagation()
    textEdit.hideEditTextBox()
    // El foco vuelve al documento para que los atajos del mapa funcionen
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur()
  }
  // Fase de captura: el editor de texto enriquecido no debe quedarse con la tecla
  window.addEventListener('keydown', onKeydown, true)
  mindMap.on('beforeDestroy', () => window.removeEventListener('keydown', onKeydown, true))
}

// Error de la librería: un tema recién insertado lleva la marca temporal `inserting: true`
// (para abrir su cuadro de edición) hasta que se pinta. Si la entrada de historial se toma
// antes (pasa cuando el equipo va lento), la guarda; al deshacer hasta esa entrada la
// librería trata el tema como "recién insertado" otra vez, quita la marca y añade una
// entrada nueva: Deshacer parecía no hacer nada y el tema no se iba.
// Solución: las instantáneas del historial nunca guardan esa marca.
function stripTransientHistoryFlags(mindMap) {
  const command = mindMap.command
  if (!command || command.__mmStripped) return
  const getCopyData = command.getCopyData
  const strip = node => {
    if (!node || typeof node !== 'object') return
    delete node.inserting
    ;(node.children || []).forEach(strip)
  }
  // addHistory llama a this.getCopyData(): el método de la instancia tiene prioridad
  command.getCopyData = function (...args) {
    const data = getCopyData.apply(this, args)
    strip(data)
    return data
  }
  command.__mmStripped = true
}

function extendMindMap(mindMap) {
  guardTextEditBoxes(mindMap)
  bindEscapeToEndEditing(mindMap)
  stripTransientHistoryFlags(mindMap)
  mindMap.command.add('INSERT_NODE_BEFORE', openEdit => insertNodeBefore(mindMap, openEdit !== false))
  mindMap.command.add('PROMOTE_TOPICS', () => promoteTopics(mindMap))
  mindMap.command.add('DEMOTE_TOPICS', () => demoteTopics(mindMap))
  mindMap.command.add('SET_ACTIVE_NODES_STYLE', styleFor => setActiveNodesStyle(mindMap, styleFor))
  mindMap.command.add('SET_ACTIVE_NODES_DATA', dataFor => setActiveNodesData(mindMap, dataFor))
  mindMap.command.add('SPLIT_TOPICS', () => splitTopics(mindMap))
  mindMap.command.add('REPLACE_TOPIC_TEXT', (uids, query, replacement, options) =>
    replaceTopicText(mindMap, uids, query, replacement, options))
  mindMap.command.add('SET_CALLOUTS', (uids, change) => setCallouts(mindMap, uids, change))
  mindMap.command.add('CLEAR_TOPICS', part => clearTopics(mindMap, part))
  mindMap.command.add('SET_TEXT_MARKERS', (defs, assignName) => setTextMarkers(mindMap, defs, assignName))
  mindMap.command.add('SET_MAP_FORMAT', format => setMapFormat(mindMap, format))
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

// Se aplica desde setupMindMapLibrary (theme.js), antes de crear ningún mapa

// Atajos de formato de Office/MindManager. La librería usa Ctrl+I para "ajustar a la
// ventana"; aquí pasa a ser cursiva (ajustar sigue en la cinta y en la barra de estado).
function bindFormatShortcuts(mindMap, runCommand) {
  mindMap.keyCommand.removeShortcut('Control+i')
  mindMap.keyCommand.addShortcut('Control+b', () => runCommand('format.bold'))
  mindMap.keyCommand.addShortcut('Control+i', () => runCommand('format.italic'))
  mindMap.keyCommand.addShortcut('Control+u', () => runCommand('format.underline'))
  mindMap.keyCommand.addShortcut('Control+k', () => runCommand('element.hyperlink'))
  // Subir y bajar de nivel, como en la vista Esquema
  mindMap.keyCommand.addShortcut('Alt+Shift+Left', () => runCommand('topic.promote'))
  mindMap.keyCommand.addShortcut('Alt+Shift+Right', () => runCommand('topic.demote'))
}
