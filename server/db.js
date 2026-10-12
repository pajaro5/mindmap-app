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
  )
`)

module.exports = db
