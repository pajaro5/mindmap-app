// Catálogos de formato: fuentes, tamaños, paleta de colores y formas de tema.
// Los valores son los que entiende simple-mind-map en los datos del nodo.

const FONT_FAMILIES = [
  { value: 'Segoe UI, Tahoma, Arial, sans-serif', label: 'Segoe UI' },
  { value: 'Arial, Helvetica, sans-serif', label: 'Arial' },
  { value: 'Calibri, Carlito, sans-serif', label: 'Calibri' },
  { value: 'Tahoma, Verdana, sans-serif', label: 'Tahoma' },
  { value: 'Verdana, Geneva, sans-serif', label: 'Verdana' },
  { value: 'Trebuchet MS, sans-serif', label: 'Trebuchet MS' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: 'Times New Roman, Times, serif', label: 'Times New Roman' },
  { value: 'Courier New, Courier, monospace', label: 'Courier New' }
]

const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72]

// Paleta tipo Office: fila de colores del tema + fila de colores estándar
const COLOR_PALETTE = [
  { name: 'Colores del tema', colors: ['#ffffff', '#000000', '#eeece1', '#1f497d', '#3d8fd8', '#7dc142', '#c0504d', '#8064a2', '#4bacc6', '#f79646'] },
  { name: 'Tonos claros', colors: ['#f2f2f2', '#7f7f7f', '#ddd9c3', '#c6d9f0', '#dbe8f7', '#e5f3d6', '#f2dcdb', '#e5e0ec', '#dbeef3', '#fdeada'] },
  { name: 'Colores estándar', colors: ['#c00000', '#ff0000', '#ffc000', '#ffff00', '#92d050', '#00b050', '#00b0f0', '#0070c0', '#002060', '#7030a0'] }
]

const SHAPES = [
  { value: 'rectangle', label: 'Rectángulo' },
  { value: 'roundedRectangle', label: 'Rectángulo redondeado' },
  { value: 'ellipse', label: 'Elipse' },
  { value: 'circle', label: 'Círculo' },
  { value: 'diamond', label: 'Rombo' },
  { value: 'parallelogram', label: 'Paralelogramo' },
  { value: 'octagonalRectangle', label: 'Octógono' },
  { value: 'outerTriangularRectangle', label: 'Hexágono' },
  { value: 'innerTriangularRectangle', label: 'Banderín' }
]

// Primera familia de una lista CSS ("Georgia, serif" → "Georgia")
function firstFontFamily(value) {
  return String(value || '').split(',')[0].replace(/["']/g, '').trim()
}

// Opciones de fuente asegurando que la fuente actual aparece aunque no esté en el catálogo
// (p. ej. una fuente del tema o de un mapa importado)
function fontFamilyOptions(current) {
  const options = FONT_FAMILIES.slice()
  if (current && !options.some(o => o.value === current)) {
    options.unshift({ value: current, label: firstFontFamily(current) })
  }
  return options
}

function fontSizeOptions(current) {
  const sizes = FONT_SIZES.slice()
  const n = Number(current)
  if (n && !sizes.includes(n)) {
    sizes.push(n)
    sizes.sort((a, b) => a - b)
  }
  return sizes.map(s => ({ value: s, label: String(s) }))
}

// Siguiente tamaño de la lista hacia arriba (+1) o hacia abajo (-1), como A▲/A▼ en Office
function stepFontSize(current, direction) {
  const n = Number(current) || 12
  if (direction > 0) return FONT_SIZES.find(s => s > n) || FONT_SIZES[FONT_SIZES.length - 1]
  return [...FONT_SIZES].reverse().find(s => s < n) || FONT_SIZES[0]
}

// textDecoration admite combinaciones ("underline line-through"); alterna una parte
function toggleDecorationValue(current, part) {
  const parts = new Set(String(current || '').split(/\s+/).filter(p => p && p !== 'none'))
  if (parts.has(part)) parts.delete(part)
  else parts.add(part)
  return parts.size ? [...parts].join(' ') : 'none'
}

function hasDecoration(current, part) {
  return String(current || '').split(/\s+/).includes(part)
}
