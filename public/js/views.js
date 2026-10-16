// Vista: Esquema y Presentación.
//
// Esquema: el mapa como lista con sangría, como la vista Outline de MindManager. Es otra
// forma de ver el MISMO mapa: se pinta encima del lienzo (que sigue vivo debajo) a partir
// del árbol de datos de la librería, y todo cambio pasa por los comandos de siempre, así que
// Deshacer, el autoguardado, la búsqueda y el filtro funcionan igual en las dos vistas.
// Las filas son los temas pintados en el mapa (los de ramas desplegadas): desplegar o
// contraer en el esquema despliega o contrae en el mapa.
//
// Presentación: recorre el mapa tema a tema a pantalla completa con el plugin Demonstrate de
// la librería (contrae todo, centra cada tema y oscurece el resto). Aquí van la pantalla
// completa (la del plugin usa APIs con prefijo que Firefox ya no tiene) y las teclas de los
// mandos de presentación.

// Clase del contenedor del esquema: la librería solo atiende sus atajos (Supr, Ctrl+Z,
// Ctrl+B…) si el foco está en <body> o en un elemento con una de sus "clases de edición"
const OUTLINE_CLASS = 'mm-outline'

// ---- Esquema ----
// Filas visibles en orden de lectura: el tema central y los de las ramas desplegadas
function outlineRows(renderTree) {
  const rows = []
  const walk = (node, depth, parentUid) => {
    if (!node || !node.data) return
    const data = node.data
    const children = node.children || []
    const expanded = data.expand !== false
    const task = normalizeTask(data[TASK_KEY])
    rows.push({
      uid: data.uid,
      depth,
      parentUid,
      text: topicPlainText(data),
      hasChildren: children.length > 0,
      expanded,
      icons: data.icon || [],
      tags: (data.tag || []).map(tagText).filter(Boolean),
      hasNote: !!data.note,
      start: (task && task.start) || '',
      due: (task && task.due) || '',
      resources: (task && task.resources) || []
    })
    if (expanded) children.forEach(child => walk(child, depth + 1, data.uid))
  }
  walk(renderTree, 0, null)
  return rows
}

// ¿Hace falta mostrar las columnas de Información de tarea?
function outlineHasTaskColumns(rows) {
  return rows.some(r => r.start || r.due || r.resources.length)
}

// Fecha ISO (aaaa-mm-dd) en formato corto local (dd/mm/aaaa)
function formatShortDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

// Qué hace cada tecla en el esquema con el tema `uid` seleccionado. Devuelve
// { select: uid } para mover la selección, { expand: uid, value } para desplegar/contraer,
// { command: id } para ejecutar un comando, { edit: true } para editar el texto, o null si
// la tecla no es del esquema (sigue su camino: Supr, Ctrl+Z, Ctrl+B… los atiende la librería).
function outlineKeyAction(rows, uid, e) {
  const index = rows.findIndex(r => r.uid === uid)
  const row = rows[index]
  const plain = !e.ctrlKey && !e.metaKey && !e.altKey
  if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey) {
    if (e.key === 'ArrowLeft') return { command: 'topic.promote' }
    if (e.key === 'ArrowRight') return { command: 'topic.demote' }
    return null
  }
  if (!plain) return null
  if (!row) {
    // Sin selección: las flechas empiezan por el tema central
    return ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key) && rows.length && !e.shiftKey
      ? { select: e.key === 'End' ? rows[rows.length - 1].uid : rows[0].uid }
      : null
  }
  if (e.shiftKey) {
    if (e.key === 'Enter') return row.depth > 0 ? { command: 'topic.insertBefore' } : null
    if (e.key === 'Tab') return row.depth > 0 ? { command: 'topic.insertParent' } : null
    return null
  }
  switch (e.key) {
    case 'ArrowDown': return { select: (rows[index + 1] || row).uid }
    case 'ArrowUp': return { select: (rows[index - 1] || row).uid }
    case 'Home': return { select: rows[0].uid }
    case 'End': return { select: rows[rows.length - 1].uid }
    // Izquierda: contrae la rama o, si ya lo está, va al tema padre
    case 'ArrowLeft':
      if (row.hasChildren && row.expanded) return { expand: row.uid, value: false }
      return row.parentUid ? { select: row.parentUid } : { select: row.uid }
    // Derecha: despliega la rama o, si ya lo está, va al primer subtema
    case 'ArrowRight':
      if (row.hasChildren && !row.expanded) return { expand: row.uid, value: true }
      return row.hasChildren ? { select: rows[index + 1].uid } : { select: row.uid }
    // Enter: tema después (en el tema central, que no tiene hermanos: subtema)
    case 'Enter': return { command: row.depth > 0 ? 'topic.insertSibling' : 'topic.insertChild' }
    case 'Tab':
    case 'Insert': return { command: 'topic.insertChild' }
    case 'F2': return { edit: true }
    default: return null
  }
}

// Texto que se guarda al editar un tema en el esquema: con texto enriquecido es HTML, así
// que lo escrito se escapa (como al reemplazar o al dividir)
function outlineTextChange(node, text) {
  const value = String(text).replace(/\r\n?/g, '\n').trim()
  return node.getData('richText')
    ? { text: plainToRichText(value), richText: true }
    : { text: value, richText: false }
}

// ---- Presentación ----
// Teclas de los mandos de presentación (además de ← → y Esc, que atiende el plugin)
const PRESENTATION_KEYS = {
  PageDown: 'next', ' ': 'next', ArrowDown: 'next',
  PageUp: 'prev', ArrowUp: 'prev',
  Home: 'first', End: 'last'
}

// Pide la pantalla completa de la página; si el navegador no la da (sin gesto del usuario,
// en un iframe…) la presentación sigue ocupando toda la ventana
async function requestPageFullscreen() {
  const el = document.documentElement
  if (!document.fullscreenEnabled || !el.requestFullscreen || document.fullscreenElement) return false
  try {
    await el.requestFullscreen()
    return true
  } catch (err) {
    return false
  }
}

// Espera a que la librería termine de pintar (puede encadenar varios renders seguidos)
async function waitForRenderIdle(mindMap) {
  while (mindMap.renderer.isRendering) {
    await new Promise(resolve => {
      const done = () => { mindMap.off('node_tree_render_end', done); resolve() }
      mindMap.on('node_tree_render_end', done)
    })
    // El render siguiente, si lo hay, empieza en otra vuelta del bucle de eventos
    await new Promise(resolve => setTimeout(resolve, 0))
  }
}

function exitPageFullscreen() {
  if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {})
}
