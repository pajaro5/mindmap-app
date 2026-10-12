// Definición declarativa de la cinta: pestañas → grupos → elementos.
// Cada elemento referencia un comando de commands.js; aquí solo se decide dónde y cómo
// se muestra. Tamaños: 'large' (icono grande con texto debajo) o 'small' (icono pequeño
// con texto a la derecha; se apilan de 3 en 3 en una columna, como en Office).

const QUICK_ACCESS = ['map.new', 'edit.undo', 'edit.redo']

const RIBBON_TABS = [
  {
    id: 'home',
    label: 'Inicio',
    groups: [
      { label: 'Insertar', items: [{ cmd: 'topic.insertSibling' }, { cmd: 'topic.insertChild' }] },
      { label: 'Marcadores', items: [{ cmd: 'markers.icons' }] },
      { label: 'Edición', items: [{ cmd: 'topic.remove' }] }
    ]
  },
  {
    id: 'format',
    label: 'Formato',
    groups: [
      { label: 'Diseño del mapa', items: [{ cmd: 'layout.radial' }, { cmd: 'layout.tree' }] }
    ]
  },
  {
    id: 'view',
    label: 'Vista',
    groups: [
      { label: 'Zoom', items: [{ cmd: 'view.zoomIn' }, { cmd: 'view.zoomOut' }, { cmd: 'view.fit' }, { cmd: 'view.actualSize' }] },
      { label: 'Paneles', items: [{ cmd: 'pane.maps' }, { cmd: 'pane.markers' }] }
    ]
  },
  {
    id: 'export',
    label: 'Exportar',
    groups: [
      { label: 'Exportar', items: [{ cmd: 'export.png' }, { cmd: 'export.pdf' }] }
    ]
  }
]

const SMALL_ITEMS_PER_COLUMN = 3

// Agrupa los elementos de un grupo en columnas: cada 'large' ocupa una columna propia y
// los 'small' consecutivos se apilan hasta SMALL_ITEMS_PER_COLUMN por columna.
function layoutGroupColumns(items) {
  const columns = []
  let stack = null
  items.forEach((item, i) => {
    const size = item.size || 'large'
    if (size === 'small') {
      if (!stack || stack.cmds.length === SMALL_ITEMS_PER_COLUMN) {
        stack = { key: `s${i}`, type: 'small', cmds: [] }
        columns.push(stack)
      }
      stack.cmds.push(item.cmd)
    } else {
      stack = null
      columns.push({ key: `l${i}`, type: 'large', cmds: [item.cmd] })
    }
  })
  return columns
}

// Devuelve la cinta lista para pintar y la lista de problemas encontrados
// (comandos inexistentes, ids de pestaña repetidos…). Se valida al arrancar.
function buildRibbon(tabs = RIBBON_TABS, quickAccess = QUICK_ACCESS) {
  const problems = []
  const seenTabs = new Set()
  const checkCmd = (id, where) => {
    if (!CommandRegistry.has(id)) problems.push(`${where}: comando desconocido "${id}"`)
  }

  quickAccess.forEach(id => checkCmd(id, 'Acceso rápido'))
  const built = tabs.map(tab => {
    if (seenTabs.has(tab.id)) problems.push(`Pestaña repetida "${tab.id}"`)
    seenTabs.add(tab.id)
    return {
      id: tab.id,
      label: tab.label,
      groups: tab.groups.map(group => {
        group.items.forEach(item => checkCmd(item.cmd, `${tab.label} › ${group.label}`))
        return { label: group.label, columns: layoutGroupColumns(group.items) }
      })
    }
  })
  return { tabs: built, quickAccess: [...quickAccess], problems }
}
