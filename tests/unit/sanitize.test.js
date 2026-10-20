// Pruebas unitarias de los saneadores: lo que protege a la app de datos que llegan de fuera
// (archivos abiertos, mapas editados a mano, plantillas). Combinaciones pairwise t=2 con el
// oráculo escrito aquí.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { loadApp } = require('./load-app')
const { pairwise, missingPairs } = require('../e2e/pairwise')

const app = loadApp()
const plain = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value))
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

// ---- Información de tarea ----
const TASK_PARAMS = {
  start: ['valid', 'leap', 'feb30', 'shortFormat', 'number', 'absent'],
  due: ['valid', 'feb30', 'absent'],
  milestone: [true, 'true', false, 'absent'],
  resources: ['absent', 'dupes', 'blanks', 'many', 'string', 'mixedTypes']
}
const TASK_COMBOS = pairwise(TASK_PARAMS)
const DATES = { valid: '2026-03-02', leap: '2024-02-29', feb30: '2026-02-30', shortFormat: '2026-3-2', number: 20260302 }
const RESOURCES = {
  dupes: { input: ['Ana', 'ana ', ' Juan', 'JUAN'], want: ['Ana', 'Juan'] },
  blanks: { input: ['', '   ', '\u0001Luis\u0002', 'Eva\n'], want: ['Luis', 'Eva'] },
  many: { input: Array.from({ length: 25 }, (_, i) => `Persona ${i}`), want: Array.from({ length: 20 }, (_, i) => `Persona ${i}`) },
  string: { input: 'Ana', want: [] },
  mixedTypes: { input: [{}, 3, null, 'x'.repeat(50)], want: ['3', 'x'.repeat(40)] }
}

test(`normalizeTask: ${TASK_COMBOS.length} combinaciones (inicio × vencimiento × hito × recursos)`, () => {
  assert.deepEqual(missingPairs(TASK_PARAMS, TASK_COMBOS), [])
  for (const c of TASK_COMBOS) {
    const input = {}
    if (c.start !== 'absent') input.start = DATES[c.start]
    if (c.due !== 'absent') input.due = c.due === 'valid' ? '2026-03-09' : '2026-02-30'
    if (c.milestone !== 'absent') input.milestone = c.milestone
    if (c.resources !== 'absent') input.resources = RESOURCES[c.resources].input
    const want = {}
    if (['valid', 'leap'].includes(c.start)) want.start = DATES[c.start]
    if (c.due === 'valid') want.due = '2026-03-09'
    if (c.milestone === true) want.milestone = true
    if (c.resources !== 'absent' && RESOURCES[c.resources].want.length) want.resources = RESOURCES[c.resources].want
    assert.deepEqual(plain(app.normalizeTask(input)), Object.keys(want).length ? want : undefined, JSON.stringify(c))
  }
  for (const bad of [null, undefined, 'x', [], 3]) assert.equal(app.normalizeTask(bad), undefined)
})

// ---- Llamadas ----
const CALLOUT_PARAMS = {
  text: ['ok', 'blank', 'nonString', 'long', 'controls'],
  id: ['valid', 'spaces', 'absent', 'duplicate'],
  dx: ['int', 'float', 'huge', 'string'],
  dy: ['int', 'negHuge', 'absent'],
  count: [1, 12]
}
const CALLOUT_COMBOS = pairwise(CALLOUT_PARAMS)

test(`normalizeCallouts: ${CALLOUT_COMBOS.length} combinaciones (texto × id × dx × dy × cantidad)`, () => {
  assert.deepEqual(missingPairs(CALLOUT_PARAMS, CALLOUT_COMBOS), [])
  const TEXT = { ok: ['Revisar', 'Revisar'], blank: ['  \n ', null], nonString: [42, null], long: ['a'.repeat(600), 'a'.repeat(500)], controls: ['\u0001Ojo\taquí\r\nya\u007f', 'Ojoaquí\nya'] }
  const DX = { int: [40, 40], float: [3.6, 4], huge: [99999, 3000], string: ['10', 24] }
  const DY = { int: [-30, -30], negHuge: [-5000, -3000], absent: [undefined, -14] }
  for (const c of CALLOUT_COMBOS) {
    const label = JSON.stringify(c)
    const [text, wantText] = TEXT[c.text]
    const items = Array.from({ length: c.count }, (_, i) => {
      const item = { text, dx: DX[c.dx][0] }
      if (DY[c.dy][0] !== undefined) item.dy = DY[c.dy][0]
      if (c.id === 'valid') item.id = `c${i}`
      if (c.id === 'spaces') item.id = 'a b'
      if (c.id === 'duplicate') item.id = 'mismo'
      return item
    })
    const got = plain(app.normalizeCallouts(items))
    if (wantText === null) {
      assert.equal(got, undefined, label)
      continue
    }
    assert.equal(got.length, Math.min(c.count, 10), label)
    const ids = new Set()
    got.forEach((g, i) => {
      assert.equal(g.text, wantText, label)
      assert.equal(g.dx, DX[c.dx][1], label)
      assert.equal(g.dy, DY[c.dy][1], label)
      if (c.id === 'valid') assert.equal(g.id, `c${i}`, label)
      else if (c.id === 'duplicate' && i === 0) assert.equal(g.id, 'mismo', label)
      else assert.match(g.id, UUID, label)
      assert.equal(ids.has(g.id), false, `ids únicos: ${label}`)
      ids.add(g.id)
    })
  }
  for (const bad of [null, 'x', {}, [], [null, 3, 'texto']]) assert.equal(app.normalizeCallouts(bad), undefined)
})

// ---- Etiquetas ----
test('normalizeTags: formato, color, duplicados y valores inválidos', () => {
  const got = plain(app.normalizeTags([
    { text: 'Urgente', style: { fill: '#C00000' } },
    'urgente ',
    'Simple',
    { text: '  ' },
    { text: 'Color raro', style: { fill: 'red' } },
    { text: 'x'.repeat(60), style: { fill: '#123456' } },
    null, 7, {}
  ]))
  assert.deepEqual(got, [
    { text: 'Urgente', style: { fill: '#C00000' } },
    { text: 'Simple', style: { fill: '#7f7f7f' } },
    { text: 'Color raro', style: { fill: '#7f7f7f' } },
    { text: 'x'.repeat(40), style: { fill: '#123456' } }
  ])
  assert.deepEqual(plain(app.normalizeTags('Urgente')), [])
})

// ---- Hipervínculos ----
test('normalizeHyperlink e isSafeHyperlink', () => {
  const normal = [
    ['ejemplo.com/x?a=1', 'https://ejemplo.com/x?a=1'],
    ['  http://a.com  ', 'http://a.com/'],
    ['ana@b.com', 'mailto:ana@b.com'],
    ['mailto:ana@b.com', 'mailto:ana@b.com'],
    ['HTTPS://A.COM/Ruta', 'https://a.com/Ruta']
  ]
  for (const [input, want] of normal) assert.deepEqual(plain(app.normalizeHyperlink(input)), { ok: true, url: want }, input)
  for (const input of ['', '   ', 'javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,<b>', 'file:///C:/x', 'vbscript:x', 'ftp://a.com']) {
    assert.equal(app.normalizeHyperlink(input).ok, false, input)
  }
  const safe = ['https://a.com', 'http://a.com', 'mailto:a@b.com']
  const unsafe = ['javascript:alert(1)', ' javascript:alert(1)', 'data:text/html,x', 'a.com', '', 'file:///x', '//a.com']
  for (const url of safe) assert.equal(app.isSafeHyperlink(url), true, url)
  for (const url of unsafe) assert.equal(app.isSafeHyperlink(url), false, url)
})

// ---- sanitizeMapTree: valores de cada campo, en combinación ----
const PNG = 'data:image/png;base64,iVBORw0KGgo='
const TREE_PARAMS = {
  hyperlink: ['none', 'safe', 'js', 'dataUrl'],
  hyperlinkTitle: ['none', 'plain', 'html', 'escaped'],
  attachment: ['none', 'valid', 'external', 'traversal'],
  image: ['none', 'dataUrl', 'noSize', 'js', 'svg', 'keyOk', 'keyMissing'],
  icon: ['none', 'valid', 'mixed', 'notArray'],
  position: ['none', 'numbers', 'string'],
  depth: [0, 1, 3]
}
const TREE_COMBOS = pairwise(TREE_PARAMS)

test(`sanitizeMapTree: ${TREE_COMBOS.length} combinaciones (vínculo × título × adjunto × imagen × iconos × posición × profundidad)`, () => {
  assert.deepEqual(missingPairs(TREE_PARAMS, TREE_COMBOS), [])
  for (const c of TREE_COMBOS) {
    const label = JSON.stringify(c)
    const d = { text: 'Tema' }
    const want = { text: 'Tema' }
    let fixes = 0
    const link = { safe: 'https://ejemplo.com', js: 'javascript:alert(1)', dataUrl: 'data:text/html,<b>x</b>' }[c.hyperlink]
    if (link) d.hyperlink = link
    const title = { plain: 'Web', html: '<img src=x onerror=alert(1)>', escaped: 'a &amp; b' }[c.hyperlinkTitle]
    if (title) d.hyperlinkTitle = title
    if (c.hyperlink === 'safe') {
      want.hyperlink = link
      if (title) want.hyperlinkTitle = c.hyperlinkTitle === 'html' ? '&lt;img src=x onerror=alert(1)&gt;' : title
      if (c.hyperlinkTitle === 'html') fixes++
    } else if (link) {
      fixes++ // vínculo inseguro: se quita junto con su título
    } else if (title) {
      want.hyperlinkTitle = c.hyperlinkTitle === 'html' ? '&lt;img src=x onerror=alert(1)&gt;' : title
      if (c.hyperlinkTitle === 'html') fixes++
    }
    const url = { valid: '/api/files/0b7c1c62-1111-4111-8111-111111111111', external: 'https://malo.com/x.exe', traversal: '/api/files/../../etc/passwd' }[c.attachment]
    if (url) {
      Object.assign(d, { attachmentUrl: url, attachmentName: 'x.pdf' })
      if (c.attachment === 'valid') Object.assign(want, { attachmentUrl: url, attachmentName: 'x.pdf' })
      else fixes++
    }
    const imgMap = { smm_img_key_ok: PNG, smm_img_key_bad: 'javascript:alert(1)' }
    const size = { width: 10, height: 20 }
    const images = {
      dataUrl: [{ image: PNG, imageSize: size, imageTitle: 'a.png' }, true],
      noSize: [{ image: PNG, imageTitle: 'a.png' }, false],
      js: [{ image: 'javascript:alert(1)', imageSize: size }, false],
      svg: [{ image: 'data:image/svg+xml;base64,PHN2Zz4=', imageSize: size }, false],
      keyOk: [{ image: 'smm_img_key_ok', imageSize: size }, true],
      keyMissing: [{ image: 'smm_img_key_nada', imageSize: size }, false]
    }
    if (images[c.image]) {
      const [fields, ok] = images[c.image]
      Object.assign(d, fields)
      if (ok) Object.assign(want, fields)
      else fixes++
    }
    const icons = { valid: [['priority_1', 'flag_red'], ['priority_1', 'flag_red']], mixed: [['priority_1', 3, 'x y', null], ['priority_1']], notArray: ['priority_1', []] }[c.icon]
    if (icons) {
      d.icon = icons[0]
      want.icon = icons[1]
      if (c.icon !== 'valid') fixes++
    }
    if (c.position === 'numbers') Object.assign(d, { customLeft: 10, customTop: -5 }) && Object.assign(want, { customLeft: 10, customTop: -5 })
    if (c.position === 'string') { Object.assign(d, { customLeft: '10', customTop: 5 }); fixes++ }

    // El tema va a la profundidad indicada; en la raíz también vive el almacén de imágenes
    let tree = { data: d, children: [] }
    for (let k = 0; k < c.depth; k++) tree = { data: { text: `Nivel ${k}` }, children: [tree] }
    tree.data.imgMap = { ...imgMap }
    const fixed = app.sanitizeMapTree(tree)
    let node = tree
    for (let k = 0; k < c.depth; k++) node = node.children[0]
    const got = plain(node.data)
    if (c.depth === 0) delete got.imgMap
    assert.deepEqual(got, want, label)
    // La entrada no válida del almacén siempre se descarta (1 corrección más)
    assert.deepEqual(plain(tree.data.imgMap), { smm_img_key_ok: PNG }, label)
    assert.equal(fixed, fixes + 1, label)
  }
})
