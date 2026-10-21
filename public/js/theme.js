// Tema visual y preparación de simple-mind-map, compartidos por la app y por el visor del
// HTML interactivo exportado (export-html.js), para que el mapa se vea igual en los dos.

// Tema inspirado en MindManager: tema central azul, temas principales verdes con texto
// blanco y subtemas como texto sobre ramas curvas grises.
// Se registra como tema con nombre para que en la BD solo se guarde "mindmanager" y
// las personalizaciones del usuario, no una copia completa de estos valores.
const THEME_NAME = 'mindmanager'
const FONT = 'Segoe UI, Tahoma, Arial, sans-serif'
const MINDMANAGER_THEME = {
  backgroundColor: '#ffffff',
  lineColor: '#b9b9b9',
  lineWidth: 2,
  lineStyle: 'curve',
  rootLineKeepSameInCurve: false,
  generalizationLineColor: '#9ab7d8',
  iconSize: 18,
  paddingX: 14,
  paddingY: 6,
  root: {
    shape: 'rectangle',
    fontFamily: FONT,
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
    fillColor: '#3d8fd8',
    gradientStyle: true,
    startColor: '#6db2f0',
    endColor: '#2b6fbd',
    startDir: [0, 0],
    endDir: [0, 1],
    borderColor: '#24609f',
    borderWidth: 1,
    borderRadius: 14,
    paddingX: 34,
    paddingY: 22,
    lineWidth: 5,
    textAlign: 'center'
  },
  second: {
    shape: 'rectangle',
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ffffff',
    fillColor: '#7dc142',
    gradientStyle: true,
    startColor: '#a3d86a',
    endColor: '#66ab2c',
    startDir: [0, 0],
    endDir: [0, 1],
    borderColor: '#57962a',
    borderWidth: 1,
    borderRadius: 9,
    paddingX: 18,
    paddingY: 10,
    marginX: 90,
    marginY: 34,
    lineWidth: 2
  },
  node: {
    fontFamily: FONT,
    fontSize: 12,
    fontWeight: 'bold',
    color: '#2b2b2b',
    fillColor: 'transparent',
    borderWidth: 0,
    marginX: 44,
    marginY: 4,
    lineWidth: 1
  },
  generalization: {
    fontFamily: FONT,
    fontSize: 12,
    color: '#1d4f8a',
    fillColor: '#eaf3fd',
    borderColor: '#9ab7d8',
    borderWidth: 1,
    borderRadius: 6
  }
}

// simple-mind-map no incluye un reset de CSS para el texto enriquecido de los temas: sin
// esto el <p> hereda el margen por defecto del navegador (~16px) y el texto queda recortado
// fuera del tema, invisible. Lo necesitan la app y el HTML exportado.
const MAP_CONTENT_CSS = `
.smm-richtext-node-wrap, .smm-richtext-node-wrap p, .smm-richtext-node-wrap h1, .smm-richtext-node-wrap h2,
.smm-richtext-node-wrap h3, .smm-richtext-node-wrap ul, .smm-richtext-node-wrap ol, .smm-richtext-node-wrap blockquote {
  margin: 0;
  padding: 0;
}
/* Tooltip de las notas con formato (rich-notes.js) */
.note-tooltip {
  position: fixed; z-index: 3000; display: none; max-width: 340px; max-height: 300px; overflow: auto;
  padding: 8px 12px; border: 1px solid #c9d6e6; border-radius: 6px; background: #fff;
  box-shadow: 0 4px 14px rgba(0, 0, 0, .15); font: 13px/1.45 'Segoe UI', Arial, sans-serif; color: #1e2a3a;
  pointer-events: none; overflow-wrap: anywhere;
}
.note-tooltip p { margin: 0 0 4px; }
.note-tooltip ul, .note-tooltip ol { margin: 0 0 4px; padding-left: 20px; }
.note-tooltip a { color: #1c62b9; }`

function injectMapContentCss(doc = document) {
  if (doc.getElementById('mm-map-content-css')) return
  const style = doc.createElement('style')
  style.id = 'mm-map-content-css'
  style.textContent = MAP_CONTENT_CSS
  doc.head.appendChild(style)
}

// Plantilla con la que abrir un mapa: los creados antes del rediseño guardaban 'default'
function themeTemplateOf(savedTheme) {
  const template = savedTheme && savedTheme.template
  return !template || template === 'default' ? THEME_NAME : template
}

// Registra los temas visuales (map-format.js), la etiqueta de Información de tarea y los
// parches de la librería. Una vez por constructor (la librería ignora los plugins ya registrados).
function setupMindMapLibrary(MindMapCtor) {
  if (!MindMapCtor || MindMapCtor.__mmSetup) return
  injectMapContentCss()
  if (typeof MindMapCtor.defineTheme === 'function') defineMapThemes(MindMapCtor)
  if (typeof MindMapCtor.usePlugin === 'function') MindMapCtor.usePlugin(TaskInfoPlugin)
  patchLibraryBugs(MindMapCtor)
  // Flechas de las relaciones y límites en forma de nube (relation-format.js)
  patchRelationFormat(MindMapCtor)
  MindMapCtor.__mmSetup = true
}
