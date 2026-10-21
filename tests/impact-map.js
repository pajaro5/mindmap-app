// Qué pruebas e2e cubren cada parte de la app (regresión selectiva, scripts/test-changed.js).
// Las claves son prefijos de ruta; los valores, nombres de spec sin ".spec.js" (incluye su
// variante .pairwise si existe). Al crear un módulo o un spec nuevo hay que añadirlo aquí: una
// prueba (tests/unit/impact-map.test.js) comprueba que todo módulo y todo spec aparecen.

// Cuarentena: specs de fases empezadas y sin terminar. Su código y sus pruebas están en la rama
// wip/fases-pendientes; si se traen a main sin terminar, Playwright no los ejecuta
// (playwright.config.js) salvo con QUARANTINE=off. Al retomar una fase:
//   git checkout wip/fases-pendientes -- <archivos de la fase>
// y se quita de aquí, añadiendo sus módulos a IMPACT.
const QUARANTINE = ['diagram-edit', 'callouts-extras', 'format-extras', 'export-options', 'gantt']
// Módulos de esas fases (aún no se cargan en index.html)
const QUARANTINE_MODULES = ['public/js/gantt.js']

// Batería de humo: se ejecuta siempre en la regresión selectiva
const SMOKE = ['smoke', 'globals', 'ribbon', 'maps', 'editing']

// Cambios que afectan a todo: suite completa
const FULL = ['tests/e2e/fixtures.js', 'tests/e2e/pairwise.js', 'playwright.config.js', 'package.json', 'public/vendor/']

const IMPACT = {
  'server/': ['api', 'files-api', 'maps', 'map-file', 'templates'],
  'public/index.html': ['topic-menu', 'canvas-layout'],
  'public/css/': ['canvas-layout', 'view'],
  'public/js/app.js': ['topic-menu', 'clipboard', 'elements'],
  'public/js/callouts.js': ['callouts', 'export-doc'],
  'public/js/commands.js': ['topic-menu', 'edit-group'],
  'public/js/diagrams.js': ['diagrams', 'templates'],
  'public/js/elements.js': ['elements', 'files-api', 'map-file', 'export-html'],
  'public/js/export-doc.js': ['export-doc', 'map-file'],
  'public/js/export-html.js': ['export-html', 'export', 'map-file'],
  'public/js/format.js': ['format', 'format-painter'],
  'public/js/icon-library.js': ['markers', 'task-info'],
  'public/js/icons.js': ['ribbon'],
  'public/js/import-formats.js': ['import-formats', 'map-file'],
  'public/js/map-file.js': ['map-file', 'import-formats'],
  'public/js/map-format.js': ['map-format', 'export-html'],
  'public/js/markers.js': ['markers', 'task-info', 'find-filter'],
  'public/js/migrations.js': ['maps', 'markers', 'map-file', 'templates', 'export-html'],
  'public/js/mindmap-extensions.js': ['editing', 'edit-group', 'topic-menu', 'clipboard', 'format'],
  'public/js/paste-special.js': ['home-extras', 'clipboard'],
  'public/js/rich-notes.js': ['rich-notes', 'elements', 'edit-group', 'export-doc', 'find-filter', 'export-html'],
  'public/js/relation-format.js': ['relation-format', 'relationship-boundary', 'export-html'],
  'public/js/ribbon.js': ['ribbon'],
  'public/js/search-filter.js': ['find-filter', 'view-extras', 'export-html'],
  'public/js/task-info.js': ['task-info', 'export-doc'],
  'public/js/templates.js': ['templates', 'diagrams'],
  'public/js/theme.js': ['export-html', 'map-format', 'view'],
  'public/js/topic-links.js': ['home-extras', 'elements', 'export-html'],
  'public/js/viewer.js': ['export-html'],
  'public/js/view-extras.js': ['view-extras', 'find-filter', 'export-html'],
  'public/js/views.js': ['outline-presentation', 'view'],
  'docs/': [],
  'scripts/': [],
  'tests/unit/': [],
  'tests/impact-map.js': [],
  'howToCreateAMindmap.md': ['map-file'],
  'README.md': [],
  '.gitignore': []
}

module.exports = { QUARANTINE, QUARANTINE_MODULES, SMOKE, FULL, IMPACT }
