// Sentido horario en el diseño radial (clockwise.js): los temas principales se reparten como
// las agujas del reloj (derecha de arriba abajo, luego izquierda de abajo arriba), también en el
// HTML exportado y al arrastrar; la importación de MindManager respeta los lados y los colores.
const fs = require('fs')
const { pathToFileURL } = require('url')
const { test, expect, setupMap, AppPage } = require('./fixtures')
const { makeZip } = require('./zip')

const leaf = text => ({ data: { text }, children: [] })
const radial = (texts, extra = {}) => ({
  layout: 'mindMap',
  root: { data: { text: 'Centro' }, children: texts.map(leaf) },
  theme: { template: 'mindmanager', config: {} },
  view: {},
  ...extra
})

// Centro de cada tema en pantalla (lo que ve el usuario)
async function centers(page, texts, nodeOf) {
  const out = {}
  for (const text of texts) {
    const box = await nodeOf(text).boundingBox()
    out[text] = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  }
  return out
}

// Recorrido del reloj: los de la derecha de arriba abajo y los de la izquierda de abajo arriba
function clockwiseReading(pos, rootX) {
  const right = Object.keys(pos).filter(t => pos[t].x > rootX).sort((a, b) => pos[a].y - pos[b].y)
  const left = Object.keys(pos).filter(t => pos[t].x < rootX).sort((a, b) => pos[b].y - pos[a].y)
  return { right, left }
}

test('sin lado guardado: la primera mitad a la derecha y el resto a la izquierda, en sentido horario', async ({ page, maps }) => {
  const texts = ['Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco']
  const { app } = await setupMap(page, maps, { data: radial(texts) })
  const rootX = (await centers(page, ['Centro'], t => app.node(t))).Centro.x
  expect(clockwiseReading(await centers(page, texts, t => app.node(t)), rootX))
    .toEqual({ right: ['Uno', 'Dos', 'Tres'], left: ['Cuatro', 'Cinco'] })

  // Un tema principal nuevo va al final del recorrido: arriba del todo en la izquierda
  await app.node('Cinco').click()
  await page.keyboard.press('Enter')
  await app.typeNewTopic('Seis')
  const all = [...texts, 'Seis']
  expect(clockwiseReading(await centers(page, all, t => app.node(t)), rootX))
    .toEqual({ right: ['Uno', 'Dos', 'Tres'], left: ['Cuatro', 'Cinco', 'Seis'] })
})

test('el lado guardado (dir) manda y la izquierda sigue de abajo arriba', async ({ page, maps }) => {
  const data = radial(['A', 'B', 'C', 'D'])
  data.root.children.forEach((c, i) => { c.data.dir = ['right', 'left', 'left', 'left'][i] })
  const { app } = await setupMap(page, maps, { data })
  const rootX = (await centers(page, ['Centro'], t => app.node(t))).Centro.x
  expect(clockwiseReading(await centers(page, ['A', 'B', 'C', 'D'], t => app.node(t)), rootX))
    .toEqual({ right: ['A'], left: ['B', 'C', 'D'] })

  // Insertar un tema no cambia los lados guardados (antes la librería los reescribía todos y,
  // p. ej., se perdía lo que había hecho Equilibrar)
  await app.node('A').click()
  await page.keyboard.press('Enter')
  await app.typeNewTopic('E')
  const dirs = await page.evaluate(() => Alpine.raw(window.Alpine.$data(document.body).mindMap)
    .getData(false).children.map(c => [c.data.text.replace(/<[^>]+>/g, ''), c.data.dir]))
  expect(dirs).toEqual([['A', 'right'], ['E', undefined], ['B', 'left'], ['C', 'left'], ['D', 'left']])
  expect(clockwiseReading(await centers(page, ['A', 'E', 'B', 'C', 'D'], t => app.node(t)), rootX))
    .toEqual({ right: ['A', 'E'], left: ['B', 'C', 'D'] })
})

test('las ramas de la izquierda con subtemas no se solapan', async ({ page, maps }) => {
  // Ramas más altas que su tema: el diseño separa a los hermanos (updateBrothers), que en la
  // izquierda están de abajo arriba
  const branch = (name, n) => ({ data: { text: name }, children: Array.from({ length: n }, (_, i) => leaf(`${name}${i + 1}`)) })
  const data = radial([])
  data.root.children = [branch('Ra', 1), branch('Rb', 1), branch('Rc', 1), branch('La', 5), branch('Lb', 5), branch('Lc', 5)]
  const { app } = await setupMap(page, maps, { data })
  const span = async name => {
    const texts = [name, ...[1, 2, 3, 4, 5].map(i => `${name}${i}`)]
    const pos = await centers(page, texts, t => app.node(t))
    const ys = Object.values(pos).map(p => p.y)
    return { top: Math.min(...ys), bottom: Math.max(...ys) }
  }
  const [la, lb, lc] = [await span('La'), await span('Lb'), await span('Lc')]
  // De arriba abajo: Lc, Lb, La, sin solaparse
  expect(lc.bottom).toBeLessThan(lb.top)
  expect(lb.bottom).toBeLessThan(la.top)
})

test('arrastrar en el lado izquierdo deja el tema donde se suelta', async ({ page, maps }) => {
  const texts = ['Uno', 'Dos', 'Tres', 'Cuatro']
  const { app } = await setupMap(page, maps, { data: radial(texts) })
  // Izquierda, de arriba abajo: Cuatro, Tres. Se arrastra Tres al cuarto superior de Cuatro
  // (zona de "soltar encima" de la librería)
  const target = await app.node('Cuatro').boundingBox()
  const box = await app.node('Tres').boundingBox()
  await app.recordsHistory(async () => {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 10, box.y + box.height / 2 - 10, { steps: 4 })
    await page.mouse.move(target.x + target.width / 2, target.y, { steps: 12 })
    // La franja de "soltar encima" es de pocos píxeles junto al borde superior (más abajo es
    // "soltar dentro", como subtema). Se recorre como haría el usuario hasta que la librería la
    // marca; busca el destino al mover y con retardo (throttle), así que se espera tras cada paso
    let found = false
    for (const dy of [2, 1, 0, 3, -1, -2, 4, -3]) {
      await page.mouse.move(target.x + target.width / 2, target.y + dy, { steps: 2 })
      await page.waitForTimeout(200)
      found = await page.evaluate(() => {
        const drag = Alpine.raw(window.Alpine.$data(document.body).mindMap).drag
        return !!(drag.prevNode || drag.nextNode)
      })
      if (found) break
    }
    expect(found, 'la librería debe marcar la posición encima de Cuatro').toBe(true)
    await page.mouse.up()
  })
  await expect.poll(async () => {
    const pos = await centers(page, ['Tres', 'Cuatro'], t => app.node(t))
    return pos.Tres.y < pos.Cuatro.y
  }, { message: 'Tres debe quedar encima de Cuatro' }).toBe(true)
  const order = await page.evaluate(() => Alpine.raw(window.Alpine.$data(document.body).mindMap)
    .getData(false).children.map(c => c.data.text.replace(/<[^>]+>/g, '')))
  // Recorrido del reloj: Cuatro (abajo) antes que Tres (arriba)
  expect(order).toEqual(['Uno', 'Dos', 'Cuatro', 'Tres'])
})

test('el HTML exportado reparte los temas igual', async ({ page, maps }, testInfo) => {
  const texts = ['Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco']
  const { app } = await setupMap(page, maps, { data: radial(texts) })
  await app.ribbonTab('export').click()
  const [download] = await Promise.all([page.waitForEvent('download'), app.ribbonCmd('export', 'export.html').click()])
  const file = testInfo.outputPath(download.suggestedFilename())
  await download.saveAs(file)
  const viewer = await page.context().newPage()
  await viewer.goto(pathToFileURL(file).href)
  await expect(viewer.locator('body.viewer-ready')).toHaveCount(1, { timeout: 30000 })
  const nodeOf = text => viewer.locator('#mindMapContainer .smm-node')
    .filter({ has: viewer.locator('foreignObject').getByText(text, { exact: true }) })
  const rootX = (await centers(viewer, ['Centro'], nodeOf)).Centro.x
  expect(clockwiseReading(await centers(viewer, texts, nodeOf), rootX))
    .toEqual({ right: ['Uno', 'Dos', 'Tres'], left: ['Cuatro', 'Cinco'] })
  fs.rmSync(file, { force: true })
})

// .mmap con la estructura de MindManager 24: lado en Offset CX, colores AARRGGBB y colores por
// defecto en StyleGroup (el primer tema principal no tiene color propio)
function mmap() {
  const color = (fill, line) => `<ap:Color FillColor="${fill}" LineColor="${line}"/>`
  const topic = (text, cx, colorXml = '', sub = '') =>
    `<ap:Topic>${sub ? `<ap:SubTopics>${sub}</ap:SubTopics>` : ''}<ap:Text PlainText="${text}"/>${colorXml}<ap:Offset CX="${cx}" CY="0."/></ap:Topic>`
  const subtopic = text => `<ap:Topic><ap:Text PlainText="${text}"/></ap:Topic>`
  const xml = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<ap:Map xmlns:ap="http://schemas.mindjet.com/MindManager/Application/2003"><ap:OneTopic><ap:Topic><ap:SubTopics>' +
    topic('R1', '32.29') +
    topic('R2', '32.29', color('ffffeee5', 'fff85e19'), subtopic('R2 sub')) +
    topic('R3', '32.29', color('ffffe6ee', 'ffdd1652')) +
    topic('L1', '-32.29', color('ffe6f5ff', 'ff106aa6')) +
    topic('L2', '-32.29', color('ffccfecc', 'ff008000')) +
    '</ap:SubTopics><ap:Text PlainText="Gobernanza"/>' + color('ffe7e7f2', 'ff000000') + '</ap:Topic></ap:OneTopic>' +
    '<ap:StyleGroup><ap:RootTopicDefaultsGroup><ap:DefaultColor FillColor="ffecf4fa" LineColor="ff3283c0"/></ap:RootTopicDefaultsGroup>' +
    '<ap:RootSubTopicDefaultsGroup Level="0"><ap:DefaultColor FillColor="ffecf4fa" LineColor="ff3283c0"/></ap:RootSubTopicDefaultsGroup>' +
    '<ap:RootSubTopicDefaultsGroup Level="1"><ap:DefaultColor FillColor="00000000"/></ap:RootSubTopicDefaultsGroup></ap:StyleGroup>' +
    '</ap:Map>'
  return { name: 'gobernanza.mmap', mimeType: 'application/octet-stream', buffer: makeZip([{ name: 'Document.xml', data: xml }]) }
}

test('importar de MindManager: lados, sentido horario y colores de las ramas', async ({ page, maps }) => {
  test.skip(test.info().project.name !== 'chromium', 'importación ya cubierta en los dos navegadores en import-formats')
  const app = new AppPage(page)
  await app.goto()
  await app.chooseFile(() => app.clickRibbon('export', 'map.openFile'), mmap())
  await expect.poll(() => page.evaluate(() => window.Alpine.$data(document.body).currentTitle)).toBe('Gobernanza')
  maps.track(await page.evaluate(() => window.Alpine.$data(document.body).currentId))
  await app.expectNodeCount(7)

  const texts = ['R1', 'R2', 'R3', 'L1', 'L2']
  const rootX = (await centers(page, ['Gobernanza'], t => app.node(t))).Gobernanza.x
  expect(clockwiseReading(await centers(page, texts, t => app.node(t)), rootX))
    .toEqual({ right: ['R1', 'R2', 'R3'], left: ['L1', 'L2'] })

  const data = await page.evaluate(() => {
    const tree = Alpine.raw(window.Alpine.$data(document.body).mindMap).getData(false)
    const pick = d => ({ fillColor: d.fillColor, borderColor: d.borderColor, lineColor: d.lineColor, color: d.color, dir: d.dir })
    return { root: pick(tree.data), main: tree.children.map(c => pick(c.data)) }
  })
  // Central: relleno y borde propios, sin color de línea (las ramas llevan el suyo)
  expect(data.root).toEqual({ fillColor: '#e7e7f2', borderColor: '#000000', lineColor: undefined, color: '#1e2a3a', dir: undefined })
  expect(data.main).toEqual([
    { fillColor: '#ecf4fa', borderColor: '#3283c0', lineColor: '#3283c0', color: '#1e2a3a', dir: 'right' }, // por defecto
    { fillColor: '#ffeee5', borderColor: '#f85e19', lineColor: '#f85e19', color: '#1e2a3a', dir: 'right' },
    { fillColor: '#ffe6ee', borderColor: '#dd1652', lineColor: '#dd1652', color: '#1e2a3a', dir: 'right' },
    { fillColor: '#e6f5ff', borderColor: '#106aa6', lineColor: '#106aa6', color: '#1e2a3a', dir: 'left' },
    { fillColor: '#ccfecc', borderColor: '#008000', lineColor: '#008000', color: '#1e2a3a', dir: 'left' }
  ])

  // Lo que se ve: la línea hacia la rama y la del subtema (heredada) con el color de la rama
  const strokes = await page.evaluate(() => {
    const root = Alpine.raw(window.Alpine.$data(document.body).mindMap).renderer.root
    const r2 = root.children.find(n => n.getData('text').replace(/<[^>]+>/g, '') === 'R2')
    return { toBranch: root._lines[root.children.indexOf(r2)].attr('stroke'), toSub: r2._lines[0].attr('stroke') }
  })
  expect(strokes).toEqual({ toBranch: '#f85e19', toSub: '#f85e19' })
})
