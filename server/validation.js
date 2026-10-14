// Validaciones de entrada de la API. El contenido de los temas lo sanea el cliente al abrir
// el mapa (elements.js); aquí solo se comprueba la forma, para no guardar basura.

const TITLE_MAX = 200
const DESCRIPTION_MAX = 500

// Título opcional: si viene, texto no vacío de hasta TITLE_MAX caracteres (sin controles)
function cleanTitle(value, fallback) {
  if (value === undefined || value === null) return { ok: true, value: fallback }
  if (typeof value !== 'string') return { ok: false, error: 'El título debe ser texto' }
  const title = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, TITLE_MAX)
  return { ok: true, value: title || fallback }
}

function cleanDescription(value) {
  if (value === undefined || value === null) return ''
  return typeof value === 'string' ? value.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').trim().slice(0, DESCRIPTION_MAX) : ''
}

// Datos de un mapa: { root: { data: {...}, children: [...] }, layout?, theme?, view? }
function isValidMapData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false
  const isNode = (node, depth) => depth < 200 && !!node && typeof node === 'object' &&
    !!node.data && typeof node.data === 'object' && !Array.isArray(node.data) &&
    (node.children === undefined || (Array.isArray(node.children) && node.children.every(c => isNode(c, depth + 1))))
  if (!isNode(data.root, 0)) return false
  if (data.layout !== undefined && typeof data.layout !== 'string') return false
  if (data.theme !== undefined && (typeof data.theme !== 'object' || data.theme === null)) return false
  return true
}

module.exports = { cleanTitle, cleanDescription, isValidMapData, TITLE_MAX }
