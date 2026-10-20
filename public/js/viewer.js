// Visor del HTML interactivo exportado (se incrusta en el archivo; ver export-html.js).
// Mapa de solo lectura: se pueden desplegar y contraer ramas, moverse y hacer zoom.
// Se ejecuta sin servidor (file://) y sin red: la página lleva una CSP que lo impide.

async function startInteractiveViewer() {
  const statusEl = document.getElementById('viewerStatus')
  try {
    // La librería va como texto en la página y se carga como módulo desde un Blob
    const source = document.getElementById('smm-lib').textContent
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
    const mod = await import(url)
    URL.revokeObjectURL(url)
    const MindMap = mod.default
    window.simpleMindMap = MindMap
    setupMindMapLibrary(MindMap)

    const payload = JSON.parse(document.getElementById('map-data').textContent)
    const data = payload.data
    // El archivo pudo editarse a mano: se sanea igual que al abrir un mapa en la app
    sanitizeMapTree(data.root)

    const savedTheme = data.theme || {}
    const mindMap = new MindMap({
      el: document.getElementById('mindMapContainer'),
      data: data.root,
      layout: data.layout || 'mindMap',
      // Tema, ramas, fondo y sombras del mapa (map-format.js)
      ...mapFormatOptions(data.root.data, savedTheme),
      readonly: true,
      fit: true,
      maxTag: 10,
      iconList: libraryIconList(),
      enableShortcutOnlyWhenMouseInSvg: true,
      // Un vínculo a otro tema salta a él; a otro mapa no se puede (no está en el archivo)
      customHyperlinkJump: url => {
        const internal = internalLinkOf(url)
        if (!internal) return openHyperlinkSafely(url)
        if (internal.kind === 'topic' && window.__viewer) window.__viewer.mindMap.execCommand('GO_TARGET_NODE', internal.uid)
      },
      errorHandler: (code, error) => console.error(code, error),
      ...diagramMapOptions(data.root.data)
    })
    guardTextEditBoxes(mindMap)
    installMapFormat(mindMap, savedTheme)
    // Diagramas: fondo (zonas y rótulos) y sin líneas desde el título
    attachDiagram(mindMap)

    // Llamadas: solo se dibujan (en el visor no se seleccionan ni se mueven)
    const calloutHandlers = { isActive: () => false, onPointerDown: () => {}, onDoubleClick: () => {} }
    const drawCalloutLayer = () => renderCallouts(mindMap, calloutHandlers)
    mindMap.on('node_tree_render_end', drawCalloutLayer)
    drawCalloutLayer()

    bindViewerToolbar(mindMap)
    window.__viewer = { mindMap }
    statusEl.textContent = ''
    document.body.classList.add('viewer-ready')
  } catch (err) {
    console.error(err)
    statusEl.textContent = 'No se pudo mostrar el mapa: ' + (err && err.message ? err.message : err)
  }
}

function bindViewerToolbar(mindMap) {
  const on = (action, fn) => {
    const el = document.querySelector(`[data-viewer="${action}"]`)
    if (el) el.addEventListener('click', fn)
  }
  // Desplegar/contraer en bloque cambia el mapa con el mismo comando que en la app
  on('expand-all', () => { mindMap.execCommand('EXPAND_ALL'); setTimeout(() => mindMap.view.fit(), 50) })
  on('collapse', () => { mindMap.execCommand('UNEXPAND_TO_LEVEL', 1); setTimeout(() => mindMap.view.fit(), 50) })
  on('fit', () => mindMap.view.fit())
  on('zoom-in', () => mindMap.view.enlarge())
  on('zoom-out', () => mindMap.view.narrow())
  window.addEventListener('resize', () => mindMap.resize())
}

startInteractiveViewer()
