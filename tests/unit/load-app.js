// Carga los scripts de la app (public/js, en el orden de index.html) en un contexto de Node
// para probar su lógica pura sin navegador. Comparten un ámbito global como en la página, así
// que sus funciones y constantes se leen con app.<nombre>.
//
//   const app = loadApp()
//   app.parseMapFile(text, 'x.json')
//
// No hay DOM: las funciones que lo usan (Image, canvas, FileReader…) se prueban en las e2e.
// Se omiten los scripts que arrancan la página (app.js) o el visor del HTML exportado.
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const PUBLIC = path.join(__dirname, '..', '..', 'public')
const SKIP = ['/js/app.js', '/js/viewer.js']

function appScripts() {
  const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8')
  return [...html.matchAll(/<script src="(\/js\/[^"]+)"><\/script>/g)].map(m => m[1]).filter(src => !SKIP.includes(src))
}

function loadApp() {
  const sandbox = {
    console, crypto: globalThis.crypto, TextEncoder, TextDecoder, Blob, File, Response, URL,
    DecompressionStream, CompressionStream, structuredClone, setTimeout, clearTimeout,
    // Lo que la librería simple-mind-map pondría en la página (solo se usa dentro de funciones)
    MindMap: function MindMap() {}
  }
  sandbox.window = sandbox
  sandbox.globalThis = sandbox
  const context = vm.createContext(sandbox)
  for (const src of appScripts()) {
    const file = path.join(PUBLIC, src)
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file })
  }
  // Las declaraciones const/let/class de nivel superior no son propiedades del objeto global:
  // se leen evaluando su nombre en el contexto
  return new Proxy({}, {
    get: (_, name) => typeof name === 'string' ? vm.runInContext(name, context) : undefined
  })
}

module.exports = { loadApp, appScripts }
