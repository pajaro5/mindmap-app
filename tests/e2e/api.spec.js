// Pruebas de la API REST /api/maps (sin navegador)
const { test, expect } = require('./fixtures')

test.describe('API /api/maps', () => {
  test('crear un mapa devuelve 201 con los valores por defecto', async ({ request, maps }) => {
    const res = await request.post('/api/maps', { data: { title: 'API defaults' } })
    expect(res.status()).toBe(201)
    const map = await res.json()
    maps.track(map.id)
    expect(map.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(map.title).toBe('API defaults')
    expect(map.data.layout).toBe('mindMap')
    expect(map.data.theme.template).toBe('mindmanager')
    expect(map.data.root.data.text).toBe('Tema central')
  })

  test('sin título usa "Mapa sin título"', async ({ request, maps }) => {
    const res = await request.post('/api/maps', { data: {} })
    const map = await res.json()
    maps.track(map.id)
    expect(map.title).toBe('Mapa sin título')
  })

  test('el listado incluye el mapa creado solo con metadatos', async ({ request, maps }) => {
    const created = await maps.create()
    const list = await (await request.get('/api/maps')).json()
    const row = list.find(m => m.id === created.id)
    expect(row).toBeTruthy()
    expect(row.title).toBe(created.title)
    expect(row.data).toBeUndefined()
  })

  test('PUT actualiza título y datos por separado', async ({ request, maps }) => {
    const created = await maps.create()
    await request.put(`/api/maps/${created.id}`, { data: { title: 'Renombrado' } })
    let map = await maps.get(created.id)
    expect(map.title).toBe('Renombrado')
    expect(map.data.root.data.text).toBe('Tema central')

    const data = { ...map.data, root: { data: { text: 'Nuevo raíz' }, children: [] } }
    await request.put(`/api/maps/${created.id}`, { data: { data } })
    map = await maps.get(created.id)
    expect(map.title).toBe('Renombrado')
    expect(map.data.root.data.text).toBe('Nuevo raíz')
  })

  test('ids inexistentes devuelven 404', async ({ request }) => {
    expect((await request.get('/api/maps/no-existe')).status()).toBe(404)
    expect((await request.put('/api/maps/no-existe', { data: { title: 'x' } })).status()).toBe(404)
  })

  test('DELETE devuelve 204 y el mapa deja de existir', async ({ request, maps }) => {
    const created = await maps.create()
    expect((await request.delete(`/api/maps/${created.id}`)).status()).toBe(204)
    maps.forget(created.id)
    expect((await request.get(`/api/maps/${created.id}`)).status()).toBe(404)
  })
})
