// Exportar a HTML interactivo (como el "HTML5 Interactive Map" de MindManager): un único
// archivo .html, de solo lectura, en el que las ramas se despliegan y contraen con clics.
//
// El archivo lleva dentro:
//   - la librería simple-mind-map (build ESM minificado, 1,5 MB) como texto; el visor la
//     carga como módulo desde un Blob, así funciona sin servidor (file://) y sin red;
//   - los módulos propios que hacen falta para pintar igual que la app (tema, iconos,
//     marcadores, información de tarea, llamadas, saneado) y el visor (viewer.js);
//   - los datos del mapa como JSON.
// Seguridad: una CSP impide cualquier conexión a la red; los bloques <script> se escapan
// para que ningún texto del mapa pueda cerrarlos; el visor vuelve a sanear el mapa.

const EXPORT_LIBRARY_URL = '/vendor/simple-mind-map-0.14.0-fix.3.esm.min.js'
// Orden de carga: cada módulo solo usa los anteriores (o los usa más tarde, al ejecutarse)
const EXPORT_SCRIPT_URLS = [
  '/js/icon-library.js', '/js/markers.js', '/js/task-info.js', '/js/callouts.js', '/js/diagrams.js',
  '/js/migrations.js', '/js/elements.js', '/js/rich-notes.js', '/js/mindmap-extensions.js', '/js/theme.js', '/js/map-format.js', '/js/relation-format.js', '/js/topic-links.js', '/js/viewer.js'
]

const EXPORT_CSP = "default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline'; img-src data: blob:; font-src data:"

// Dentro de <script> el navegador solo busca "</script" y "<!--". En el código solo pueden
// aparecer dentro de cadenas, plantillas, regex o comentarios, donde "\x3C" equivale a "<"
// (también en regex con /u, a diferencia de "\!")
const escapeScriptText = code => String(code).replace(/<(\/script|!--)/gi, '\\x3C$1')

// JSON seguro dentro de <script>: "<", ">" y "&" como escapes \u (siguen siendo JSON válido)
const jsonForScript = value => JSON.stringify(value)
  .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
  .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')

const escapeHtmlText = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Copia de los datos para exportar: sin la posición de la vista (el visor ajusta el mapa)
// y sin adjuntos, que están en el servidor y no se podrían abrir desde el archivo
function prepareExportData(data) {
  const copy = JSON.parse(JSON.stringify(data))
  delete copy.view
  const walk = node => {
    if (!node || !node.data) return
    delete node.data.attachmentUrl
    delete node.data.attachmentName
    delete node.data.isActive
    ;(node.children || []).forEach(walk)
  }
  walk(copy.root)
  return copy
}

// HTML completo del archivo exportado (función pura: fácil de probar)
function buildInteractiveHtml({ title, data, librarySource, scripts, exportedAt = new Date() }) {
  const safeTitle = escapeHtmlText(title || 'Mapa mental')
  const date = exportedAt.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${EXPORT_CSP}">
<meta name="generator" content="Mapas Mentales · HTML interactivo">
<title>${safeTitle}</title>
<style>
  html, body { height: 100%; margin: 0; }
  body { display: flex; flex-direction: column; font-family: ${FONT}; color: #1e2a3a; background: #fff; }
  .viewer-bar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 6px 12px;
    background: linear-gradient(#3f7cc4, #2b5f9e); color: #fff; }
  .viewer-title { font-size: 15px; font-weight: 600; margin-right: auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .viewer-meta { font-size: 11.5px; opacity: .85; margin-right: 8px; }
  .viewer-bar button { font: inherit; font-size: 12.5px; color: #1e2a3a; background: linear-gradient(#fff, #e3ecf7);
    border: 1px solid #9ab7d8; border-radius: 3px; padding: 3px 9px; cursor: pointer; }
  .viewer-bar button:hover { background: linear-gradient(#fff4dc, #ffd99a); border-color: #c2862a; }
  #mindMapContainer { flex: 1; min-height: 0; position: relative; overflow: hidden; }
  #viewerStatus { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #5b6b80; font-size: 14px; }
  .smm-callout { cursor: default !important; }
</style>
</head>
<body>
<header class="viewer-bar">
  <span class="viewer-title">${safeTitle}</span>
  <span class="viewer-meta">Solo lectura · exportado el ${escapeHtmlText(date)}</span>
  <button type="button" data-viewer="expand-all">Expandir todo</button>
  <button type="button" data-viewer="collapse">Contraer</button>
  <button type="button" data-viewer="fit">Ajustar</button>
  <button type="button" data-viewer="zoom-out" aria-label="Alejar">−</button>
  <button type="button" data-viewer="zoom-in" aria-label="Acercar">+</button>
</header>
<main id="mindMapContainer"><div id="viewerStatus">Cargando el mapa…</div></main>
<script type="application/json" id="map-data">${jsonForScript({ title: title || '', data })}</script>
<script type="text/plain" id="smm-lib">${escapeScriptText(librarySource)}</script>
${scripts.map(code => `<script>\n${escapeScriptText(code)}\n</script>`).join('\n')}
</body>
</html>
`
}

// Los recursos no cambian mientras la app está abierta: se descargan una vez
let exportAssetsPromise = null
function loadExportAssets() {
  if (!exportAssetsPromise) {
    const get = url => fetch(url).then(res => {
      if (!res.ok) throw new Error(`No se pudo cargar ${url} (HTTP ${res.status})`)
      return res.text()
    })
    exportAssetsPromise = Promise.all([get(EXPORT_LIBRARY_URL), ...EXPORT_SCRIPT_URLS.map(get)])
      .then(([librarySource, ...scripts]) => ({ librarySource, scripts }))
      .catch(err => { exportAssetsPromise = null; throw err })
  }
  return exportAssetsPromise
}

// Nombre de archivo seguro a partir del título del mapa
function exportFileName(title) {
  const base = String(title || 'mapa-mental').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
  return `${base || 'mapa-mental'}.html`
}

async function exportInteractiveHtml(mindMap, title) {
  const assets = await loadExportAssets()
  const html = buildInteractiveHtml({ title, data: prepareExportData(mindMap.getData(true)), ...assets })
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = exportFileName(title)
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
  return html.length
}
