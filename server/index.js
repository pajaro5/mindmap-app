const express = require('express')
const crypto = require('crypto')
const db = require('./db')

const app = express()
const PORT = process.env.PORT || 3001

app.use(express.json({ limit: '20mb' }))
app.use(express.static(require('path').join(__dirname, '..', 'public')))

const defaultMapData = () => ({
  layout: 'logicalStructure',
  root: {
    data: { text: 'Tema central', expand: true },
    children: []
  },
  theme: { template: 'default', config: {} },
  view: {}
})

// Listar mapas (sin el contenido completo, solo metadata)
app.get('/api/maps', (req, res) => {
  const rows = db
    .prepare('SELECT id, title, created_at, updated_at FROM maps ORDER BY updated_at DESC')
    .all()
  res.json(rows)
})

// Crear mapa nuevo
app.post('/api/maps', (req, res) => {
  const id = crypto.randomUUID()
  const title = (req.body && req.body.title) || 'Mapa sin título'
  const data = JSON.stringify(defaultMapData())
  db.prepare('INSERT INTO maps (id, title, data) VALUES (?, ?, ?)').run(id, title, data)
  const row = db.prepare('SELECT * FROM maps WHERE id = ?').get(id)
  res.status(201).json({ ...row, data: JSON.parse(row.data) })
})

// Obtener un mapa completo
app.get('/api/maps/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM maps WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'Mapa no encontrado' })
  res.json({ ...row, data: JSON.parse(row.data) })
})

// Actualizar título y/o contenido del mapa
app.put('/api/maps/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM maps WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'Mapa no encontrado' })

  const title = req.body.title !== undefined ? req.body.title : row.title
  const data = req.body.data !== undefined ? JSON.stringify(req.body.data) : row.data

  db.prepare(
    `UPDATE maps SET title = ?, data = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(title, data, req.params.id)

  const updated = db.prepare('SELECT * FROM maps WHERE id = ?').get(req.params.id)
  res.json({ ...updated, data: JSON.parse(updated.data) })
})

// Borrar mapa
app.delete('/api/maps/:id', (req, res) => {
  db.prepare('DELETE FROM maps WHERE id = ?').run(req.params.id)
  res.status(204).end()
})

app.listen(PORT, () => {
  console.log(`Mindmap app corriendo en http://localhost:${PORT}`)
})
