// Biblioteca de marcadores de icono, al estilo de MindManager.
//
// simple-mind-map identifica cada icono como "<grupo>_<nombre>" (data.icon de los temas) y
// lo resuelve con su lista interna más la que se le pasa en la opción `iconList`. Aquí se
// definen los grupos propios (se pasan en `iconList`), los nombres en español de todos los
// iconos (también los de la librería, para tooltips y búsqueda) y qué grupos son
// excluyentes (un tema tiene una sola prioridad, una sola bandera…).
// Los nombres no pueden llevar "_" (la librería separa grupo y nombre por ahí).

const svg24 = body => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`
const badge = (color, body) => svg24(`<circle cx="12" cy="12" r="10" fill="${color}"/>${body}`)
const stroke = (d, color = '#fff', width = 2.2) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`
const letter = (ch, color = '#fff', size = 14) =>
  `<text x="12" y="${12 + size * 0.36}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${size}" fill="${color}">${ch}</text>`

const flag = (fill, dark) => svg24(
  `<path d="M5.5 3v18.5" stroke="#5b6b80" stroke-width="2" stroke-linecap="round"/>` +
  `<path d="M6.5 4h12l-3 4.5 3 4.5h-12z" fill="${fill}" stroke="${dark}" stroke-width="1" stroke-linejoin="round"/>`)

const face = (mouth, { fill = '#ffd23f', edge = '#c99a00', extra = '' } = {}) => svg24(
  `<circle cx="12" cy="12" r="10" fill="${fill}" stroke="${edge}"/>` +
  `<circle cx="8.8" cy="9.6" r="1.4" fill="#5a3d00"/><circle cx="15.2" cy="9.6" r="1.4" fill="#5a3d00"/>` +
  extra + mouth)

const light = (fill, edge) => svg24(
  `<circle cx="12" cy="12" r="9.5" fill="${fill}" stroke="${edge}" stroke-width="1.5"/>` +
  `<ellipse cx="9.2" cy="8.6" rx="3" ry="2" fill="#fff" opacity=".45"/>`)

const person = (cx, cy, s, color) =>
  `<circle cx="${cx}" cy="${cy - 4.5 * s}" r="${3.6 * s}" fill="${color}"/>` +
  `<path d="M${cx - 7 * s} ${cy + 8 * s}a${7 * s} ${7 * s} 0 0 1 ${14 * s} 0z" fill="${color}"/>`

const ICON_LIBRARY_GROUPS = [
  {
    type: 'flag', name: 'Banderas', exclusive: true,
    list: [
      ['red', 'Bandera roja', flag('#e03131', '#a61e1e')],
      ['orange', 'Bandera naranja', flag('#f08c00', '#a35f00')],
      ['yellow', 'Bandera amarilla', flag('#ffd43b', '#b8930f')],
      ['green', 'Bandera verde', flag('#40c057', '#2b8a3e')],
      ['blue', 'Bandera azul', flag('#339af0', '#1c6fb5')],
      ['purple', 'Bandera morada', flag('#9c36b5', '#6b2380')],
      ['gray', 'Bandera gris', flag('#adb5bd', '#6b7480')],
      ['black', 'Bandera negra', flag('#343a40', '#111')]
    ]
  },
  {
    type: 'traffic', name: 'Semáforo', exclusive: true,
    list: [
      ['red', 'Semáforo rojo', light('#e03131', '#a61e1e')],
      ['amber', 'Semáforo ámbar', light('#f59f00', '#b37400')],
      ['green', 'Semáforo verde', light('#2f9e44', '#1f6e2f')]
    ]
  },
  {
    type: 'face', name: 'Caras', exclusive: true,
    list: [
      ['happy', 'Contento', face(stroke('M7.5 14c1.2 2.4 7.8 2.4 9 0', '#5a3d00', 1.6))],
      ['neutral', 'Neutral', face(stroke('M8 15.5h8', '#5a3d00', 1.6))],
      ['sad', 'Triste', face(stroke('M7.5 17c1.2-2.4 7.8-2.4 9 0', '#5a3d00', 1.6))],
      ['angry', 'Enfadado', face(stroke('M7.5 17c1.2-2.4 7.8-2.4 9 0', '#5a3d00', 1.6), {
        fill: '#ff8a5c', edge: '#c4501f', extra: stroke('M6.5 7l3.5 1.5M17.5 7L14 8.5', '#5a3d00', 1.5)
      })],
      ['surprised', 'Sorprendido', face('<circle cx="12" cy="15.5" r="2.2" fill="#5a3d00"/>')],
      ['confused', 'Confundido', face(stroke('M7.5 16c1.5-1.5 3 1.5 4.5 0s3-1.5 4.5 0', '#5a3d00', 1.6))]
    ]
  },
  {
    type: 'arrow', name: 'Flechas',
    list: [
      ['up', 'Arriba', badge('#2b6fbd', stroke('M12 17.5v-11M7.5 11 12 6.5l4.5 4.5'))],
      ['down', 'Abajo', badge('#2b6fbd', stroke('M12 6.5v11M7.5 13l4.5 4.5 4.5-4.5'))],
      ['left', 'Izquierda', badge('#2b6fbd', stroke('M17.5 12h-11M11 7.5 6.5 12l4.5 4.5'))],
      ['right', 'Derecha', badge('#2b6fbd', stroke('M6.5 12h11M13 7.5l4.5 4.5-4.5 4.5'))],
      ['rising', 'Sube', badge('#2f9e44', stroke('M7 17 17 7M10 7h7v7'))],
      ['falling', 'Baja', badge('#c92a2a', stroke('M7 7l10 10M17 10v7h-7'))],
      ['repeat', 'Repetir', badge('#5f3dc4', stroke('M16.5 8.5A6 6 0 1 0 18 13') + stroke('M17 4.5v4.5h-4.5'))],
      ['both', 'Bidireccional', badge('#2b6fbd', stroke('M6.5 12h11M9.5 9l-3 3 3 3M14.5 9l3 3-3 3'))]
    ]
  },
  {
    type: 'symbol', name: 'Símbolos',
    list: [
      ['idea', 'Idea', svg24(
        '<path d="M12 2.5a6.2 6.2 0 0 0-3.6 11.3V16h7.2v-2.2A6.2 6.2 0 0 0 12 2.5z" fill="#ffd23f" stroke="#c99a00"/>' +
        stroke('M9.5 18.5h5M10.3 21h3.4', '#5b6b80', 1.6))],
      ['question', 'Pregunta', badge('#7048e8', letter('?'))],
      ['warning', 'Advertencia', svg24(
        '<path d="M12 2.8 22 20.5H2z" fill="#ffc000" stroke="#b38600" stroke-linejoin="round"/>' +
        '<text x="12" y="18.3" text-anchor="middle" font-family="Arial" font-weight="700" font-size="12" fill="#1e2a3a">!</text>')],
      ['info', 'Información', badge('#1c7ed6', letter('i', '#fff', 15))],
      ['star', 'Estrella', svg24('<path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z" fill="#ffc000" stroke="#c99a00" stroke-linejoin="round"/>')],
      ['heart', 'Favorito', svg24('<path d="M12 20.5s-8-4.9-8-10.4a4.3 4.3 0 0 1 8-2.5 4.3 4.3 0 0 1 8 2.5c0 5.5-8 10.4-8 10.4z" fill="#e0245e" stroke="#a5163f"/>')],
      ['check', 'Hecho', badge('#2f9e44', stroke('M7 12.5l3.2 3.2L17 9'))],
      ['cross', 'Cancelado', badge('#c92a2a', stroke('M8.5 8.5l7 7m0-7-7 7'))],
      ['stop', 'Bloqueado', svg24('<path d="M8 2.5h8L21.5 8v8L16 21.5H8L2.5 16V8z" fill="#c92a2a" stroke="#8f1d1d" stroke-linejoin="round"/>' + stroke('M7.5 12h9', '#fff', 2.6))],
      ['pause', 'En pausa', badge('#868e96', stroke('M9.5 8v8M14.5 8v8', '#fff', 2.6))],
      ['pin', 'Ubicación', svg24('<path d="M12 22s-6.5-7.2-6.5-12a6.5 6.5 0 0 1 13 0c0 4.8-6.5 12-6.5 12z" fill="#e03131" stroke="#a61e1e"/><circle cx="12" cy="10" r="2.4" fill="#fff"/>')],
      ['lock', 'Confidencial', svg24(stroke('M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5', '#5b6b80', 2) + '<rect x="5.5" y="10.5" width="13" height="10" rx="2" fill="#f2a900" stroke="#a87500"/><circle cx="12" cy="15.5" r="1.5" fill="#5a3d00"/>')],
      ['money', 'Dinero', badge('#2f9e44', letter('$', '#fff', 14))],
      ['calendar', 'Fecha', svg24(
        '<rect x="3.5" y="5" width="17" height="15.5" rx="2" fill="#fff" stroke="#c92a2a"/><path d="M3.5 7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v3h-17z" fill="#c92a2a"/>' +
        stroke('M8 3v4M16 3v4', '#5b6b80', 2) + '<path d="M7 13h2v2H7zM11 13h2v2h-2zM15 13h2v2h-2zM7 16.5h2v2H7zM11 16.5h2v2h-2z" fill="#868e96"/>')],
      ['clock', 'Plazo', svg24('<circle cx="12" cy="12" r="9.5" fill="#fff" stroke="#1c7ed6" stroke-width="2"/>' + stroke('M12 6.5V12l3.5 2', '#1e2a3a', 1.8))],
      ['mail', 'Correo', svg24('<rect x="2.5" y="5.5" width="19" height="13" rx="1.5" fill="#fff" stroke="#1c7ed6" stroke-width="1.5"/>' + stroke('M3.5 7l8.5 6.5L20.5 7', '#1c7ed6', 1.5))],
      ['phone', 'Teléfono', svg24('<rect x="7" y="2" width="10" height="20" rx="2" fill="#343a40"/><rect x="8.5" y="4.5" width="7" height="12.5" fill="#8ec5ff"/><circle cx="12" cy="19.3" r="1" fill="#fff"/>')],
      ['document', 'Documento', svg24('<path d="M5.5 2.5h8.5l4.5 4.5v14.5h-13z" fill="#fff" stroke="#5b6b80" stroke-linejoin="round"/><path d="M14 2.5V7h4.5" fill="#e9ecef" stroke="#5b6b80" stroke-linejoin="round"/>' + stroke('M8 11h8M8 14h8M8 17h5', '#8aa6c8', 1.4))],
      ['home', 'Casa', svg24('<path d="M6 10.5V20h12v-9.5" fill="#f4b183" stroke="#c55a11" stroke-linejoin="round"/><rect x="10.2" y="14" width="3.6" height="6" fill="#c55a11"/>' + stroke('M3.5 11.5 12 4l8.5 7.5', '#c55a11', 2))],
      ['search', 'Investigar', svg24('<circle cx="10.5" cy="10.5" r="6" fill="#e8f1fb" stroke="#1c7ed6" stroke-width="2.2"/>' + stroke('M15 15l5.5 5.5', '#1e2a3a', 3))],
      ['target', 'Objetivo', svg24('<circle cx="12" cy="12" r="9.5" fill="#e03131"/><circle cx="12" cy="12" r="6.5" fill="#fff"/><circle cx="12" cy="12" r="3.5" fill="#e03131"/><circle cx="12" cy="12" r="1.2" fill="#fff"/>')]
    ]
  },
  {
    type: 'people', name: 'Personas',
    list: [
      ['person', 'Persona', svg24(person(12, 12, 1, '#1c7ed6'))],
      ['team', 'Equipo', svg24(person(8, 13, .75, '#74c0fc') + person(16, 13, .75, '#74c0fc') + person(12, 14.5, .85, '#1c7ed6'))],
      ['client', 'Cliente', svg24(person(12, 12, 1, '#2f9e44'))],
      ['owner', 'Responsable', svg24(person(12, 12.5, 1, '#c55a11') + '<path d="m12 1.2 1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3z" fill="#ffc000"/>')]
    ]
  }
]

// Nombres de los iconos de la propia librería
const LIBRARY_ICON_LABELS = {
  priority: n => `Prioridad ${n}`,
  progress: n => Number(n) >= 8 ? 'Completado' : `Progreso ${Math.round(Number(n) * 100 / 8)}%`,
  expression: n => `Emoji clásico ${n}`,
  sign: n => `Símbolo clásico ${n}`
}
const LIBRARY_GROUP_LABELS = { priority: 'Prioridad', progress: 'Progreso', expression: 'Emojis clásicos', sign: 'Símbolos clásicos' }
// Grupos de la librería que se muestran aparte ("Iconos clásicos"): se siguen viendo en los
// mapas que ya los usan, pero la biblioteca nueva los sustituye
const CLASSIC_ICON_GROUPS = ['expression', 'sign']
// Orden en el selector: los de la librería primero (prioridad y progreso), luego los propios
const ICON_GROUP_ORDER = ['priority', 'progress', 'flag', 'traffic', 'face', 'arrow', 'symbol', 'people', 'expression', 'sign']

// Prioridad, progreso, banderas, semáforo y caras: un solo icono de cada grupo por tema
const EXCLUSIVE_ICON_GROUPS = ['priority', 'progress', ...ICON_LIBRARY_GROUPS.filter(g => g.exclusive).map(g => g.type)]

// Lista con el formato de la opción `iconList` de simple-mind-map
function libraryIconList() {
  return ICON_LIBRARY_GROUPS.map(g => ({ name: g.name, type: g.type, list: g.list.map(([name, , icon]) => ({ name, icon })) }))
}

// Grupos para la interfaz: [{ type, label, classic, items: [{ id, label, svg }] }]
function buildIconCategories(libraryList = []) {
  const groups = new Map()
  libraryList.forEach(cat => groups.set(cat.type, {
    type: cat.type,
    label: LIBRARY_GROUP_LABELS[cat.type] || cat.name,
    classic: CLASSIC_ICON_GROUPS.includes(cat.type),
    items: cat.list.map(item => ({
      id: `${cat.type}_${item.name}`,
      label: (LIBRARY_ICON_LABELS[cat.type] || (n => n))(item.name),
      svg: item.icon
    }))
  }))
  ICON_LIBRARY_GROUPS.forEach(g => groups.set(g.type, {
    type: g.type,
    label: g.name,
    classic: false,
    items: g.list.map(([name, label, icon]) => ({ id: `${g.type}_${name}`, label, svg: icon }))
  }))
  const rank = type => (ICON_GROUP_ORDER.indexOf(type) + 1) || ICON_GROUP_ORDER.length + 1
  return [...groups.values()].sort((a, b) => rank(a.type) - rank(b.type))
}

// Búsqueda sin distinguir mayúsculas ni tildes
const foldText = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

function filterIconCategories(categories, query) {
  const q = foldText(query || '')
  if (!q) return categories
  return categories
    .map(cat => ({ ...cat, items: cat.items.filter(i => foldText(i.label).includes(q) || foldText(cat.label).includes(q)) }))
    .filter(cat => cat.items.length)
}
