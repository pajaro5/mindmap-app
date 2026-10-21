// Versión del formato de los datos de un mapa y migraciones entre versiones.
//
// Los datos de un mapa ({ layout, root, theme, view }) llevan `schemaVersion`. Al abrir un
// mapa (de la base de datos, de un archivo o del HTML exportado) se aplican en orden las
// migraciones pendientes; al guardarlo se escribe la versión actual. Un mapa sin
// `schemaVersion` es de la versión 0 (anterior a este sistema).
//
// Migrar no es sanear: aquí se transforma lo que fue válido en una versión anterior; la
// seguridad (valores que no se aceptan nunca) es cosa de sanitizeMapTree (elements.js).
//
// Para cambiar el formato: añadir una migración al final de MIGRATIONS con `to` = versión
// nueva, subir SCHEMA_VERSION y probarla en tests/unit/migrations.test.js.

const MIGRATIONS = [
  {
    to: 1,
    name: 'claves antiguas: marcadores de texto y tema "default"',
    run(data) {
      const rd = data.root && data.root.data
      // Las categorías de marcadores de texto se guardaban en root.data.textMarkers
      if (rd && rd.textMarkers !== undefined) {
        if (rd._textMarkers === undefined) rd._textMarkers = rd.textMarkers
        delete rd.textMarkers
      }
      // Los mapas anteriores al rediseño guardaban el tema "default"
      if (data.theme && typeof data.theme === 'object' && data.theme.template === 'default') data.theme.template = 'mindmanager'
    }
  }
]

const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].to

// Versión de unos datos: un entero ≥ 0; cualquier otra cosa cuenta como 0
function schemaVersionOf(data) {
  const v = data && data.schemaVersion
  return Number.isInteger(v) && v >= 0 ? v : 0
}

// Migra en sitio los datos de un mapa hasta la versión actual.
// Devuelve { from, to, applied: [nombres], newer: true si son de una versión posterior }.
// Una versión posterior no se toca (no se sabe cómo bajarla): quien abre el mapa avisa.
function migrateMapData(data) {
  const from = schemaVersionOf(data)
  if (!data || typeof data !== 'object') return { from, to: from, applied: [], newer: false }
  if (from > SCHEMA_VERSION) return { from, to: from, applied: [], newer: true }
  const applied = []
  for (const migration of MIGRATIONS) {
    if (migration.to <= from) continue
    migration.run(data)
    applied.push(migration.name)
  }
  data.schemaVersion = SCHEMA_VERSION
  return { from, to: SCHEMA_VERSION, applied, newer: false }
}

// Versión con la que guardar: la actual, salvo que el mapa venga de una posterior (así una
// versión nueva de la app sigue sabiendo qué tiene delante)
function stampSchemaVersion(data, loadedVersion = 0) {
  data.schemaVersion = Math.max(SCHEMA_VERSION, Number.isInteger(loadedVersion) ? loadedVersion : 0)
  return data
}
