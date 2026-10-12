// Fase 3 · API de adjuntos (/api/maps/:id/files y /api/files/:id)
const { test, expect } = require('./fixtures')

const upload = (request, mapId, body, { name = 'nota.txt', type = 'text/plain' } = {}) =>
  request.post(`/api/maps/${mapId}/files`, {
    headers: { 'Content-Type': type, 'X-File-Name': encodeURIComponent(name) },
    data: body
  })

test.describe('API de adjuntos', () => {
  test('subir y descargar devuelve el mismo contenido con cabeceras seguras', async ({ request, maps }) => {
    const map = await maps.create()
    const content = Buffer.from('contenido de prueba ñ ✓')
    const res = await upload(request, map.id, content, { name: 'informe final.txt' })
    expect(res.status()).toBe(201)
    const file = await res.json()
    expect(file).toMatchObject({ name: 'informe final.txt', size: content.length, url: `/api/files/${file.id}` })

    const dl = await request.get(file.url)
    expect(dl.status()).toBe(200)
    expect(Buffer.compare(await dl.body(), content)).toBe(0)
    const h = dl.headers()
    expect(h['content-disposition']).toContain('attachment')
    expect(h['content-disposition']).toContain("filename*=UTF-8''informe%20final.txt")
    expect(h['content-type']).toBe('application/octet-stream')
    expect(h['x-content-type-options']).toBe('nosniff')
    expect(h['content-security-policy']).toContain('sandbox')
  })

  test('un HTML adjunto se descarga, nunca se sirve como página', async ({ request, maps }) => {
    const map = await maps.create()
    const res = await upload(request, map.id, Buffer.from('<script>alert(1)</script>'), { name: 'x.html', type: 'text/html' })
    const dl = await request.get((await res.json()).url)
    expect(dl.headers()['content-type']).toBe('application/octet-stream')
    expect(dl.headers()['content-disposition']).toMatch(/^attachment/)
  })

  test('el nombre se sanea: sin rutas ni caracteres de control', async ({ request, maps }) => {
    const map = await maps.create()
    const res = await upload(request, map.id, Buffer.from('x'), { name: '..\\..\\secreto\u0007.txt' })
    expect((await res.json()).name).toBe('secreto.txt')
    const res2 = await upload(request, map.id, Buffer.from('x'), { name: '../../etc/passwd' })
    expect((await res2.json()).name).toBe('passwd')
  })

  test('errores: mapa inexistente 404, archivo vacío 400, demasiado grande 413', async ({ request, maps }) => {
    expect((await upload(request, '00000000-0000-0000-0000-000000000000', Buffer.from('x'))).status()).toBe(404)
    const map = await maps.create()
    expect((await upload(request, map.id, Buffer.alloc(0))).status()).toBe(400)
    // El servidor de pruebas limita los adjuntos a 2 MB
    const big = await upload(request, map.id, Buffer.alloc(2 * 1024 * 1024 + 10, 1))
    expect(big.status()).toBe(413)
    expect((await big.json()).error).toContain('MB')
  })

  test('ids no válidos o inexistentes devuelven 404 (sin acceso a rutas del servidor)', async ({ request }) => {
    for (const id of ['..%2F..%2Fpackage.json', 'package.json', '00000000-0000-0000-0000-000000000000']) {
      expect((await request.get(`/api/files/${id}`)).status(), id).toBe(404)
    }
  })

  test('al borrar el mapa se borran sus adjuntos', async ({ request, maps }) => {
    const map = await maps.create()
    const file = await (await upload(request, map.id, Buffer.from('x'))).json()
    expect((await request.get(file.url)).status()).toBe(200)
    await request.delete(`/api/maps/${map.id}`)
    maps.forget(map.id)
    expect((await request.get(file.url)).status()).toBe(404)
  })
})
