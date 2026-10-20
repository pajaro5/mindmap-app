// Pruebas unitarias de map-file.js (lógica de abrir y guardar como archivo), sin navegador.
// Las combinaciones son pairwise t=2; el oráculo está escrito aquí y los ZIP se generan y se
// leen con zlib de Node (tests/e2e/zip.js), no con el código de la app.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const zlib = require('zlib')
const { loadApp } = require('./load-app')
const { pairwise, missingPairs } = require('../e2e/pairwise')
const { makeZip, readZip: nodeReadZip } = require('../e2e/zip')

const app = loadApp()
// Los objetos creados dentro del contexto tienen otros prototipos: se comparan como JSON
const plain = value => JSON.parse(JSON.stringify(value))
const bytesOf = map => Object.fromEntries([...map].map(([k, v]) => [k, Buffer.from(v).toString('base64')]))
const b64 = buffer => Buffer.from(buffer).toString('base64')

async function rejectsWith(promiseOrFn, pattern) {
  await assert.rejects(typeof promiseOrFn === 'function' ? promiseOrFn() : promiseOrFn, err => {
    assert.match(err.message, pattern)
    assert.equal(err.constructor.name, 'MapFileError')
    return true
  })
}

// ---- readZip ----
const ZIP_PARAMS = {
  method: ['stored', 'deflate'],
  folder: ['', 'carpeta/', 'a/b c/'],
  names: ['ascii', 'utf8', 'spaces'],
  size: ['empty', 'small', 'binary200k'],
  count: [1, 3],
  comment: [false, true],
  withDirEntry: [false, true]
}
const ZIP_COMBOS = pairwise(ZIP_PARAMS)

function zipFixture(c, k) {
  const base = { ascii: 'file', utf8: 'ñandú-✓', spaces: 'mi archivo final' }[c.names]
  const content = i => c.size === 'empty' ? Buffer.alloc(0)
    : c.size === 'small' ? Buffer.from(`contenido ${i} de ${base} ✓\n`)
      : Buffer.from(Array.from({ length: 200 * 1024 }, (_, j) => (j * 31 + i * 7 + k) % 256))
  const files = Array.from({ length: c.count }, (_, i) => ({ name: `${c.folder}${base}-${i}.bin`, data: content(i) }))
  let zip = makeZip(c.withDirEntry && c.folder ? [{ name: c.folder, data: '' }, ...files] : files, { deflate: c.method === 'deflate' })
  if (c.comment) {
    const comment = Buffer.from('comentario del zip ✓')
    zip = Buffer.concat([zip, comment])
    zip.writeUInt16LE(comment.length, zip.length - comment.length - 2)
  }
  return { zip, files }
}

test('readZip: generador t=2 completo', () => {
  assert.deepEqual(missingPairs(ZIP_PARAMS, ZIP_COMBOS), [])
})

test(`readZip: ${ZIP_COMBOS.length} combinaciones (método × carpeta × nombres × tamaño × nº × comentario × carpeta explícita)`, async () => {
  for (const [k, c] of ZIP_COMBOS.entries()) {
    const { zip, files } = zipFixture(c, k)
    const got = await app.readZip(new Uint8Array(zip))
    const want = Object.fromEntries(files.map(f => [f.name, b64(f.data)]))
    assert.deepEqual(bytesOf(got), want, JSON.stringify(c))
  }
})

test('readZip: errores', async () => {
  const good = makeZip([{ name: 'a.json', data: '{}' }])
  const encrypted = Buffer.from(good)
  const central = encrypted.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
  encrypted.writeUInt16LE(1, central + 8)
  const bzip = Buffer.from(good)
  bzip.writeUInt16LE(12, bzip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])) + 10)
  const zip64 = Buffer.from(good)
  zip64.writeUInt16LE(0xffff, zip64.length - 22 + 10)
  // Directorio central con la firma de la entrada estropeada
  const badCentral = Buffer.from(good)
  badCentral.writeUInt32LE(0x12345678, badCentral.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])))
  const cases = [
    [Buffer.from('esto no es un zip'), /no es válido o está dañado/],
    [badCentral, /no es válido o está dañado/],
    [good.subarray(0, good.length - 30), /no es válido o está dañado/],
    [encrypted, /cifrado/],
    [bzip, /compresión que no se admite/],
    [zip64, /ZIP64/]
  ]
  for (const [bytes, pattern] of cases) await rejectsWith(app.readZip(new Uint8Array(bytes)), pattern)
})

// ---- Rutas ----
test('normalizeZipPath y findZipEntry', () => {
  const table = [
    ['./a/b.png', 'a/b.png'], ['a\\b\\c.png', 'a/b/c.png'], ['a/../b.png', 'b.png'],
    ['../../x.png', 'x.png'], ['a//b/./c', 'a/b/c'], ['', '']
  ]
  for (const [input, want] of table) assert.equal(app.normalizeZipPath(input), want, input)
  const files = new Map([['t/capturas/Foto.PNG', 1], ['t/capturas/foto.png', 2], ['t/adjuntos/x.txt', 3]])
  assert.equal(app.findZipEntry(files, 't/', 'capturas/foto.png'), 't/capturas/foto.png', 'exacta antes que sin mayúsculas')
  assert.equal(app.findZipEntry(files, 't/', 'CAPTURAS/FOTO.png'), 't/capturas/Foto.PNG', 'sin mayúsculas: la primera')
  assert.equal(app.findZipEntry(files, 't/sub/', '../adjuntos/x.txt'), 't/adjuntos/x.txt')
  assert.equal(app.findZipEntry(files, 't/', 'no.txt'), null)
})

test('findMapJson: elige mapa.json, el único .json o da un error claro', () => {
  const pick = names => app.findMapJson(new Map(names.map(n => [n, 1])))
  assert.equal(pick(['x/mapa.json', 'x/otro.json']), 'x/mapa.json')
  assert.equal(pick(['a/b/mapa.json', 'a/mapa.json']), 'a/mapa.json')
  assert.equal(pick(['t/MAPA.JSON', 't/datos.json']), 't/MAPA.JSON')
  assert.equal(pick(['t/tutorial.json', 'img.png']), 't/tutorial.json')
  assert.equal(pick(['__MACOSX/t/._mapa.json', 't/mi.json']), 't/mi.json')
  assert.equal(pick(['.hidden/a.json', 't/b.json']), 't/b.json')
  assert.throws(() => pick(['a.png']), /ningún archivo .json/)
  assert.throws(() => pick(['a.json', 'b.json']), /varios .json/)
})

// ---- parseMapFile ----
const PARSE_PARAMS = {
  wrapper: ['full', 'guide', 'bare'],
  title: ['given', 'empty', 'missing', 'spaces'],
  bom: [false, true],
  fileName: ['x.json', 'dir/Mi mapa.ZIP', 'C:\\carpeta\\plan.json', ''],
  layout: [undefined, 'fishbone'],
  version: [undefined, 1]
}
const PARSE_COMBOS = pairwise(PARSE_PARAMS)
const STEM = { 'x.json': 'x', 'dir/Mi mapa.ZIP': 'Mi mapa', 'C:\\carpeta\\plan.json': 'plan', '': 'Mapa importado' }

test(`parseMapFile: ${PARSE_COMBOS.length} combinaciones (envoltorio × título × BOM × nombre × diseño × versión)`, () => {
  assert.deepEqual(missingPairs(PARSE_PARAMS, PARSE_COMBOS), [])
  for (const c of PARSE_COMBOS) {
    const data = { root: { data: { text: 'R' }, children: [{ data: { text: 'H' } }] } }
    if (c.layout) data.layout = c.layout
    const title = { given: '  Mi título ', empty: '', missing: undefined, spaces: '   ' }[c.title]
    let content = c.wrapper === 'bare' ? data : { title, data }
    if (c.wrapper === 'full') content = { format: 'mindmap-app', version: c.version, ...content }
    const text = (c.bom ? '\uFEFF' : '') + JSON.stringify(content)
    const got = plain(app.parseMapFile(text, c.fileName))
    // En "bare" no hay título: siempre sale del nombre del archivo
    const wantTitle = c.wrapper !== 'bare' && c.title === 'given' ? 'Mi título' : STEM[c.fileName]
    assert.deepEqual(got, { title: wantTitle, data }, JSON.stringify(c))
  }
})

test('parseMapFile: errores', () => {
  const root = { data: { text: 'R' } }
  const cases = [
    ['{', /no es un JSON válido/],
    ['[]', /no contiene un mapa/],
    ['null', /no contiene un mapa/],
    ['"texto"', /no contiene un mapa/],
    [JSON.stringify({ format: 'xmind', data: { root } }), /no es un mapa de esta aplicación/],
    [JSON.stringify({ format: 'mindmap-app', version: 2, data: { root } }), /versión más nueva/],
    [JSON.stringify({ title: 'x' }), /estructura de un mapa/],
    [JSON.stringify({ data: { root: { text: 'sin data' } } }), /estructura de un mapa/],
    [JSON.stringify({ data: { root, layout: 3 } }), /estructura de un mapa/],
    [JSON.stringify({ data: { root, theme: 'x' } }), /estructura de un mapa/],
    [JSON.stringify({ data: { root: { data: { text: 'R' }, children: [{ data: [] }] } } }), /estructura de un mapa/],
    [JSON.stringify({ data: { root: { data: { text: 'R' }, children: {} } } }), /estructura de un mapa/]
  ]
  for (const [text, pattern] of cases) assert.throws(() => app.parseMapFile(text, 'f.json'), pattern, text)
})

// ---- resolveMapFiles (la imagen se sustituye por un doble: decodificarla necesita DOM) ----
const RESOLVE_PARAMS = {
  container: ['json', 'zip'],
  jsonDir: ['', 'tutorial/'],
  imageRef: ['none', 'exists', 'caseDiff', 'missing', 'badExt', 'decodeError'],
  imageWidth: [undefined, 200, 0, 'abc'],
  attachRef: ['none', 'exists', 'parentDir', 'missing'],
  attachName: [undefined, 'Guía &amp; más.pdf', '  '],
  foreignUrl: [false, true]
}
const RESOLVE_COMBOS = pairwise(RESOLVE_PARAMS)

test(`resolveMapFiles: ${RESOLVE_COMBOS.length} combinaciones (contenedor × carpeta × imagen × ancho × adjunto × nombre × adjunto ajeno)`, async () => {
  assert.deepEqual(missingPairs(RESOLVE_PARAMS, RESOLVE_COMBOS), [])
  for (const c of RESOLVE_COMBOS) {
    const label = JSON.stringify(c)
    const dir = c.jsonDir
    const files = c.container === 'zip' ? new Map([
      [`${dir}capturas/paso.png`, new Uint8Array([1, 2, 3])],
      [`${dir}capturas/roto.png`, new Uint8Array([9])],
      [`${dir}capturas/dibujo.bmp`, new Uint8Array([4])],
      [`${dir}adjuntos/guia.pdf`, new Uint8Array([5, 6])],
      ['compartido/plantilla.docx', new Uint8Array([7])]
    ]) : null
    // Doble de readImageFile: 400×300, o error para roto.png
    app.window.readImageFile = async file => {
      if (file.name === 'roto.png') throw new Error('El archivo no es una imagen válida.')
      return { url: `data:${file.type};base64,AAA`, width: 400, height: 300 }
    }
    const imageRefs = { exists: 'capturas/paso.png', caseDiff: 'CAPTURAS/Paso.PNG', missing: 'capturas/nada.png', badExt: 'capturas/dibujo.bmp', decodeError: 'capturas/roto.png' }
    const attachRefs = { exists: 'adjuntos/guia.pdf', parentDir: dir ? '../compartido/plantilla.docx' : 'compartido/plantilla.docx', missing: 'adjuntos/nada.pdf' }
    const t1 = { text: 'Imagen' }
    const t2 = { text: 'Adjunto' }
    if (c.imageRef !== 'none') Object.assign(t1, { imageFile: imageRefs[c.imageRef], ...(c.imageWidth !== undefined ? { imageWidth: c.imageWidth } : {}) })
    if (c.attachRef !== 'none') Object.assign(t2, { attachmentFile: attachRefs[c.attachRef], ...(c.attachName !== undefined ? { attachmentName: c.attachName } : {}) })
    if (c.foreignUrl) Object.assign(t2, { attachmentUrl: '/api/files/00000000-0000-4000-8000-000000000000' })
    const data = { root: { data: { text: 'R' }, children: [{ data: t1 }, { data: t2 }] } }

    const got = await app.resolveMapFiles(data, files, dir)
    const warnings = [...got.warnings]

    // Oráculo
    const want = []
    if (c.foreignUrl) want.push(/Se quitó el adjunto del tema "Adjunto": pertenece a otro mapa/)
    const imageOk = c.container === 'zip' && ['exists', 'caseDiff'].includes(c.imageRef)
    if (c.imageRef !== 'none' && !imageOk) {
      want.push(c.container === 'json' ? /Falta la imagen .*abre el \.zip/
        : c.imageRef === 'missing' ? /Falta la imagen "capturas\/nada\.png" del tema "Imagen"\.$/
          : c.imageRef === 'badExt' ? /no es una imagen PNG, JPEG, GIF o WebP/
            : /No se pudo usar la imagen .*no es una imagen válida/)
    }
    const attachOk = c.container === 'zip' && ['exists', 'parentDir'].includes(c.attachRef)
    if (c.attachRef !== 'none' && !attachOk) want.push(c.container === 'json' ? /Falta el adjunto .*abre el \.zip/ : /Falta el adjunto "adjuntos\/nada\.pdf"/)
    // Orden: los avisos de cada tema salen en el orden de los temas (Imagen antes que Adjunto)
    const order = w => /Imagen|imagen/.test(String(w)) ? 0 : 1
    want.sort((a, b) => order(a) - order(b))
    assert.equal(warnings.length, want.length, `${label}\n${warnings.join('\n')}`)
    warnings.forEach((w, i) => assert.match(w, want[i], label))

    // Imagen
    const width = Number(c.imageWidth)
    if (imageOk) {
      assert.equal(t1.image, 'data:image/png;base64,AAA', label)
      assert.deepEqual(plain(t1.imageSize), Number.isFinite(width) && width > 0
        ? { width: 200, height: 150, custom: true }
        : { width: 400, height: 300, custom: false }, label)
      assert.equal(t1.imageTitle, imageRefs[c.imageRef] === 'capturas/paso.png' ? 'paso.png' : 'paso.png', label)
    } else {
      assert.equal(t1.image, undefined, label)
      assert.equal(t1.imageTitle, undefined, label)
    }
    assert.equal('imageFile' in t1 || 'imageWidth' in t1, false, label)

    // Adjunto
    assert.equal('attachmentFile' in t2 || 'attachmentUrl' in t2, false, label)
    const named = typeof c.attachName === 'string' && c.attachName.trim() ? 'Guía & más.pdf' : null
    if (attachOk) {
      assert.equal(got.attachments.length, 1, label)
      const a = got.attachments[0]
      assert.equal(a.data, t2, label)
      assert.equal(a.name, named || (c.attachRef === 'exists' ? 'guia.pdf' : 'plantilla.docx'), label)
      assert.deepEqual([...a.bytes], c.attachRef === 'exists' ? [5, 6] : [7], label)
    } else {
      assert.equal(got.attachments.length, 0, label)
    }
    assert.equal('attachmentName' in t2, false, label)
  }
})

// ---- buildMapFile ----
const BUILD_PARAMS = {
  attachments: ['none', 'one', 'twoSame', 'twoDiff', 'threeSame'],
  fileName: ['nota.txt', 'a/b:c?.txt', 'sin extension', 'Ñandú &amp; Cía.PDF'],
  title: ['Plan', 'Plan: a/b "c"?', ''],
  invalidUrl: [false, true],
  nested: [false, true]
}
const BUILD_COMBOS = pairwise(BUILD_PARAMS)
// Nombre guardado en adjuntos/ para el nombre visible (oráculo escrito a mano)
const SAFE_NAME = { 'nota.txt': 'nota.txt', 'a/b:c?.txt': 'a_b_c_.txt', 'sin extension': 'sin extension', 'Ñandú &amp; Cía.PDF': 'Ñandú & Cía.PDF' }
const DUP = { 'nota.txt': n => `nota (${n}).txt`, 'a/b:c?.txt': n => `a_b_c_ (${n}).txt`, 'sin extension': n => `sin extension (${n})`, 'Ñandú &amp; Cía.PDF': n => `Ñandú & Cía (${n}).PDF` }
const FILE_BASE = { Plan: 'Plan', 'Plan: a/b "c"?': 'Plan a b c', '': 'mapa-mental' }

test(`buildMapFile: ${BUILD_COMBOS.length} combinaciones (adjuntos × nombre × título × URL no válida × anidado)`, async () => {
  assert.deepEqual(missingPairs(BUILD_PARAMS, BUILD_COMBOS), [])
  for (const c of BUILD_COMBOS) {
    const label = JSON.stringify(c)
    const count = { none: 0, one: 1, twoSame: 2, twoDiff: 2, threeSame: 3 }[c.attachments]
    const topics = Array.from({ length: 4 }, (_, i) => ({ data: { text: `T${i}` }, children: [] }))
    const nameOf = i => c.attachments === 'twoDiff' && i === 1 ? 'otro.txt' : c.fileName
    for (let i = 0; i < count; i++) {
      topics[i].data.attachmentUrl = `/api/files/0000000${i}-0000-4000-8000-000000000000`
      topics[i].data.attachmentName = nameOf(i)
    }
    if (c.invalidUrl) topics[3].data = { text: 'T3', attachmentUrl: 'https://ejemplo.com/x.pdf', attachmentName: 'x.pdf' }
    const root = { data: { text: 'R', imgMap: { smm_img_key_1: 'data:image/png;base64,AAA' } }, children: c.nested ? [{ data: { text: 'Grupo' }, children: topics }] : topics }
    const mapData = { layout: 'mindMap', root, theme: { template: 'mindmanager' }, view: {} }
    const original = JSON.stringify(mapData)
    const fetched = []
    const file = await app.buildMapFile(mapData, c.title, async url => {
      fetched.push(url)
      return new TextEncoder().encode(`contenido de ${url}`)
    })
    assert.equal(JSON.stringify(mapData), original, `no modifica los datos del mapa: ${label}`)
    const buf = Buffer.from(await file.blob.arrayBuffer())
    const isZip = count > 0
    assert.equal(file.name, `${FILE_BASE[c.title]}.${isZip ? 'zip' : 'json'}`, label)
    const entries = isZip ? nodeReadZip(buf) : null
    const json = JSON.parse(isZip ? entries['mapa.json'].toString('utf8') : buf.toString('utf8'))
    assert.deepEqual({ format: json.format, version: json.version, title: json.title }, { format: 'mindmap-app', version: 1, title: c.title }, label)
    assert.deepEqual(json.data.root.data.imgMap, { smm_img_key_1: 'data:image/png;base64,AAA' }, 'las imágenes van incrustadas')
    const savedTopics = c.nested ? json.data.root.children[0].children : json.data.root.children
    // Rutas esperadas: el primero con su nombre, los repetidos con (2), (3)…
    const used = {}
    const wantPaths = []
    for (let i = 0; i < count; i++) {
      const visible = nameOf(i) === 'otro.txt' ? 'otro.txt' : SAFE_NAME[nameOf(i)]
      used[visible] = (used[visible] || 0) + 1
      wantPaths.push(`adjuntos/${used[visible] === 1 ? visible : DUP[nameOf(i)](used[visible])}`)
    }
    for (let i = 0; i < 4; i++) {
      const d = savedTopics[i].data
      assert.equal(d.attachmentUrl, undefined, label)
      if (i < count) {
        assert.equal(d.attachmentFile, wantPaths[i], label)
        assert.equal(d.attachmentName, nameOf(i).replace('&amp;', '&'), label)
        assert.equal(entries[d.attachmentFile].toString('utf8'), `contenido de /api/files/0000000${i}-0000-4000-8000-000000000000`, label)
      } else {
        assert.equal(d.attachmentFile, undefined, label)
      }
    }
    if (isZip) assert.deepEqual(Object.keys(entries).sort(), ['mapa.json', ...wantPaths].sort(), label)
    assert.equal(fetched.length, count, 'una URL no válida no se descarga')
  }
})
