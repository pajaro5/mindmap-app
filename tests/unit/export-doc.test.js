// Documento exportado (export-doc.js): numeración de títulos y opciones. Sin navegador.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { loadApp } = require('./load-app')

const app = loadApp()
const t = (text, children = []) => ({ data: { text }, children })

test('numeración: 1., 1.1., 1.1.1. y vuelve a subir varios niveles de golpe', () => {
  const root = t('Raíz', [
    t('A', [t('A1', [t('A1a'), t('A1b')]), t('A2')]),
    t('B', [t('B1', [t('B1a', [t('B1a-i')])])]),
    t('C')
  ])
  const numbers = [...app.mapDocument(root, { options: { numbering: true } })].map(x => `${x.number} ${x.lines[0]}`.trim())
  assert.deepEqual(numbers, ['Raíz', '1. A', '1.1. A1', '1.1.1. A1a', '1.1.2. A1b', '1.2. A2', '2. B', '2.1. B1', '2.1.1. B1a', '2.1.1.1. B1a-i', '3. C'])
  // Sin la opción, nada numerado
  assert.ok(app.mapDocument(root).every(x => x.number === ''))
})

test('opciones: valores no booleanos se ignoran y se usan los de por defecto', () => {
  const opts = app.normalizeDocOptions({ notes: false, numbering: 'sí', images: 0, otra: true })
  assert.deepEqual(JSON.parse(JSON.stringify(opts)), { markers: true, task: true, links: true, notes: false, callouts: true, extras: true, images: true, numbering: false })
})

test('imagen en Word: tamaño en EMU (9525 por píxel) y como mucho el ancho de la página (600 px)', () => {
  const extent = (w, h) => app.docxImageParagraph({ width: w, height: h, name: 'image1.png' }, 1).match(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/).slice(1).map(Number)
  assert.deepEqual(extent(80, 40), [80 * 9525, 40 * 9525])
  assert.deepEqual(extent(600, 300), [600 * 9525, 300 * 9525])
  assert.deepEqual(extent(1200, 500), [600 * 9525, 250 * 9525])
})

test('imagen del tema: data URL directa o por clave de imgMap; sin tamaño válido no se exporta', () => {
  const png = 'data:image/png;base64,AAAA'
  const root = {
    data: { text: 'R', imgMap: { smm_img_key_1: png } },
    children: [
      { data: { text: 'Directa', image: png, imageSize: { width: 80, height: 40 } }, children: [] },
      { data: { text: 'Clave', image: 'smm_img_key_1', imageSize: { width: 10, height: 20, custom: true } }, children: [] },
      { data: { text: 'Sin tamaño', image: png }, children: [] },
      { data: { text: 'Externa', image: 'https://x/y.png', imageSize: { width: 5, height: 5 } }, children: [] }
    ]
  }
  const images = app.mapDocument(root).slice(1).map(x => x.image && [x.image.url, x.image.width, x.image.height])
  assert.deepEqual(JSON.parse(JSON.stringify(images)), [[png, 80, 40], [png, 10, 20], null, null])
  assert.ok(app.mapDocument(root, { options: { images: false } }).every(x => x.image === null))
})
