const fs = require('fs')
const path = require('path')
const Database = require('better-sqlite3')

// DB_PATH permite aislar la base de datos (p. ej. ':memory:' en las pruebas e2e)
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'mindmaps.db')
if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true })
const db = new Database(dbPath)

db.pragma('journal_mode = WAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS maps (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Adjuntos de los temas. El contenido vive en disco (FILES_DIR/<id>); aquí los metadatos
  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    map_id TEXT NOT NULL,
    name TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS files_map_id ON files(map_id);

  -- Plantillas guardadas por el usuario ("Guardar como plantilla"); las de serie van en el cliente
  CREATE TABLE IF NOT EXISTS templates (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    data TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`)

module.exports = db
