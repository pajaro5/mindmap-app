// Definición declarativa de la cinta: pestañas → grupos → elementos.
// Cada elemento referencia un comando de commands.js; aquí solo se decide dónde y cómo
// se muestra. Tamaños: 'large' (icono grande con texto debajo) o 'small' (icono pequeño
// con texto a la derecha; se apilan de 3 en 3 en una columna, como en Office).
// Un elemento con `menu` es un botón dividido: el botón ejecuta `cmd` y la flecha abre
// un desplegable con los comandos de `menu`.
// Un grupo puede usar `rows` en lugar de `items`: filas de controles compactos (botones
// solo-icono, selectores y botones de color), como el grupo Fuente de Office. En las filas,
// `{ separator: true }` dibuja un separador y `width` fija el ancho de un selector.
// `dropdown` cambia el contenido del desplegable por uno generado a partir del mapa (uno de
// DROPDOWN_KINDS); en ese caso los comandos de `menu` se muestran al pie.

const DROPDOWN_KINDS = ['iconMarkers', 'textMarkers']

const QUICK_ACCESS = ['map.new', 'map.openFile', 'edit.undo', 'edit.redo']

const RIBBON_TABS = [
  {
    id: 'home',
    label: 'Inicio',
    groups: [
      {
        label: 'Portapapeles',
        items: [
          { cmd: 'clipboard.paste', menu: ['clipboard.paste', 'clipboard.pasteSpecial'] },
          { cmd: 'clipboard.cut', size: 'small' },
          { cmd: 'clipboard.copy', size: 'small' },
          { cmd: 'clipboard.formatPainter', size: 'small' }
        ]
      },
      {
        label: 'Insertar',
        items: [
          { cmd: 'topic.insertSibling', menu: ['topic.insertSibling', 'topic.insertBefore', 'topic.insertParent'] },
          { cmd: 'topic.insertChild' },
          { cmd: 'insert.relationship', size: 'small', menu: ['insert.relationship', 'relationship.text', 'relationship.remove'] },
          {
            cmd: 'insert.boundary',
            size: 'small',
            menu: [...BOUNDARY_STYLES.map(s => `boundary.style.${s.id}`), 'boundary.text', 'boundary.remove']
          },
          { cmd: 'insert.callout', size: 'small', menu: ['insert.callout', 'callout.edit', 'callout.remove'] }
        ]
      },
      {
        label: 'Marcadores',
        items: [
          { cmd: 'markers.icons', dropdown: 'iconMarkers', menu: ['markers.icons.clear', 'markers.manage'] },
          { cmd: 'markers.tags', dropdown: 'textMarkers', menu: ['markers.tags', 'markers.tags.clear', 'markers.tags.newCategory', 'markers.manage'] },
          { cmd: 'pane.taskInfo' }
        ]
      },
      {
        label: 'Elementos del tema',
        items: [
          { cmd: 'element.hyperlink' },
          { cmd: 'element.attachment', size: 'small', menu: ['element.attachment', 'element.attachment.open', 'element.attachment.remove'] },
          { cmd: 'element.notes', size: 'small' },
          { cmd: 'element.image', size: 'small', menu: ['element.image', 'element.image.remove'] }
        ]
      },
      {
        label: 'Formato',
        rows: [
          [{ cmd: 'format.fontFamily', width: 128 }, { cmd: 'format.fontSize', width: 54 }, { cmd: 'format.growFont' }, { cmd: 'format.shrinkFont' }],
          [
            { cmd: 'format.bold' }, { cmd: 'format.italic' }, { cmd: 'format.underline' }, { cmd: 'format.strike' },
            { separator: true },
            { cmd: 'format.fillColor' }, { cmd: 'format.borderColor' }, { cmd: 'format.fontColor' },
            { separator: true },
            { cmd: 'format.alignLeft' }, { cmd: 'format.alignCenter' }, { cmd: 'format.alignRight' }
          ]
        ]
      },
      { label: 'Estilo', items: [{ cmd: 'style.shape' }, { cmd: 'style.quick' }, { cmd: 'style.shadow', size: 'small' }] },
      {
        label: 'Edición',
        items: [
          { cmd: 'topic.remove' },
          { cmd: 'select.all', size: 'small', menu: ['select.all', 'select.siblings', 'select.level', 'select.branch', 'select.sameMarkers'] },
          { cmd: 'clear.format', size: 'small', menu: ['clear.format', 'clear.markers', 'clear.notes', 'clear.links', 'clear.task', 'clear.all'] },
          { cmd: 'topic.split', size: 'small' },
          { cmd: 'topic.promote', size: 'small' },
          { cmd: 'topic.demote', size: 'small' }
        ]
      }
    ]
  },
  {
    id: 'format',
    label: 'Formato',
    groups: [
      {
        label: 'Temas',
        items: [{ cmd: 'mapTheme.apply' }, { cmd: 'mapFormat.shadow', size: 'small' }, { cmd: 'mapFormat.reset', size: 'small' }]
      },
      {
        label: 'Diseño del mapa',
        items: [
          { cmd: 'layout.radial' }, { cmd: 'layout.tree' }, { cmd: 'layout.org' }, { cmd: 'layout.timeline' }, { cmd: 'layout.fishbone' },
          { cmd: 'layout.more' }
        ]
      },
      {
        label: 'Ramas y fondo',
        rows: [
          [{ cmd: 'mapFormat.lineStyle', width: 114 }, { cmd: 'mapFormat.lineColor' }, { separator: true }, { cmd: 'mapFormat.spacing', width: 132 }],
          [{ cmd: 'mapFormat.lineWidth', width: 114 }, { cmd: 'mapFormat.rainbow' }, { separator: true }, { cmd: 'mapFormat.background' }]
        ]
      },
      // Se habilitan al seleccionar una relación o un límite en el mapa
      {
        label: 'Relación',
        rows: [
          [{ cmd: 'relationship.arrows', width: 146 }, { cmd: 'relationship.color' }],
          [{ cmd: 'relationship.width', width: 88 }, { cmd: 'relationship.dash', width: 88 }]
        ]
      },
      {
        label: 'Límite',
        rows: [
          [{ cmd: 'boundary.shape', width: 104 }, { cmd: 'boundary.color' }],
          [{ cmd: 'boundary.dash', width: 104 }, { cmd: 'boundary.fill' }]
        ]
      }
    ]
  },
  {
    id: 'view',
    label: 'Vista',
    groups: [
      { label: 'Vistas', items: [{ cmd: 'view.map' }, { cmd: 'view.outline' }] },
      { label: 'Presentación', items: [{ cmd: 'view.presentation' }] },
      { label: 'Zoom', items: [{ cmd: 'view.zoomIn' }, { cmd: 'view.zoomOut' }, { cmd: 'view.fit' }, { cmd: 'view.actualSize' }] },
      { label: 'Buscar', items: [{ cmd: 'view.find' }, { cmd: 'view.replace' }] },
      { label: 'Filtro', items: [{ cmd: 'pane.filter' }, { cmd: 'view.filter.clear' }] },
      { label: 'Paneles', items: [{ cmd: 'pane.maps' }, { cmd: 'pane.markers' }, { cmd: 'pane.taskInfo' }, { cmd: 'pane.notes' }] }
    ]
  },
  {
    id: 'export',
    label: 'Exportar',
    groups: [
      { label: 'Archivo', items: [{ cmd: 'map.saveFile' }, { cmd: 'map.openFile' }] },
      { label: 'Exportar', items: [{ cmd: 'export.png' }, { cmd: 'export.pdf' }, { cmd: 'export.html' }] },
      { label: 'Documento', items: [{ cmd: 'export.word' }, { cmd: 'export.markdown' }] },
      { label: 'Plantillas', items: [{ cmd: 'map.saveAsTemplate' }, { cmd: 'map.newFromTemplate' }] }
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
    const entry = { cmd: item.cmd, menu: item.menu || null, dropdown: item.dropdown || null }
    if ((item.size || 'large') === 'small') {
      if (!stack || stack.items.length === SMALL_ITEMS_PER_COLUMN) {
        stack = { key: `s${i}`, type: 'small', items: [] }
        columns.push(stack)
      }
      stack.items.push(entry)
    } else {
      stack = null
      columns.push({ key: `l${i}`, type: 'large', items: [entry] })
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

  // Los controles con valor necesitan las funciones que los alimentan
  const checkControl = (id, where) => {
    if (!CommandRegistry.has(id)) return
    const cmd = CommandRegistry.get(id)
    if ((cmd.control === 'select' || cmd.control === 'gallery') && typeof cmd.options !== 'function') {
      problems.push(`${where}: el comando "${id}" (${cmd.control}) no define options()`)
    }
  }

  quickAccess.forEach(id => checkCmd(id, 'Acceso rápido'))
  const built = tabs.map(tab => {
    if (seenTabs.has(tab.id)) problems.push(`Pestaña repetida "${tab.id}"`)
    seenTabs.add(tab.id)
    return {
      id: tab.id,
      label: tab.label,
      groups: tab.groups.map(group => {
        const where = `${tab.label} › ${group.label}`
        if (group.rows) {
          const rows = group.rows.map((row, r) => row.map((item, i) => {
            if (item.separator) return { key: `sep${r}-${i}`, separator: true }
            checkCmd(item.cmd, where)
            checkControl(item.cmd, where)
            return { key: item.cmd, cmd: item.cmd, width: item.width || null }
          }))
          return { label: group.label, rows, columns: [] }
        }
        group.items.forEach(item => {
          checkCmd(item.cmd, where)
          checkControl(item.cmd, where)
          ;(item.menu || []).forEach(id => checkCmd(id, `${where} (menú de ${item.cmd})`))
          if (item.dropdown && !DROPDOWN_KINDS.includes(item.dropdown)) {
            problems.push(`${where}: desplegable desconocido "${item.dropdown}" en ${item.cmd}`)
          }
          if (item.dropdown && !item.menu) problems.push(`${where}: ${item.cmd} tiene desplegable pero no menu`)
        })
        return { label: group.label, rows: null, columns: layoutGroupColumns(group.items) }
      })
    }
  })
  return { tabs: built, quickAccess: [...quickAccess], problems }
}
