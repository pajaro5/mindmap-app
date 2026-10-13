// Fase 6 · Grupo Edición de Inicio: Dividir, Seleccionar (+ desplegable) y Limpiar (+ desplegable)
const { test, expect, setupMap, SAMPLE_TREE } = require('./fixtures')

const cmd = (app, id) => app.ribbonCmd('home', id)
const clone = o => JSON.parse(JSON.stringify(o))
const selectedTexts = page => page.evaluate(() =>
  window.Alpine.$data(document.body).mindMap.renderer.activeNodeList
    .map(n => n.getData('text').replace(/<[^>]+>/g, '').trim()).sort())

// Raíz → Alfa (Alfa uno), Beta (Beta uno), Gamma
const TWO_LEVELS = (() => {
  const data = clone(SAMPLE_TREE)
  data.root.children[1].children = [{ data: { text: 'Beta uno' }, children: [] }]
  return data
})()

test.describe('Dividir', () => {
  test('divide un tema de varios párrafos en hermanos consecutivos; deshacer en un paso', async ({ page, maps }) => {
    const data = clone(SAMPLE_TREE)
    Object.assign(data.root.children[0].data, { text: '<p><span>Uno</span></p><p><span>Dos</span></p><p><span>Tres</span></p>', richText: true })
    const { app } = await setupMap(page, maps, { data })
    await app.selectNode('Beta')
    await expect(cmd(app, 'topic.split')).toBeDisabled()

    await app.nodes.filter({ hasText: 'Tres' }).first().click()
    await expect(cmd(app, 'topic.split')).toBeEnabled()
    await app.recordsHistory(() => cmd(app, 'topic.split').click())

    await expect.poll(() => app.tree()).toEqual({
      t: 'Raíz',
      c: [
        { t: 'Uno', c: [{ t: 'Alfa uno', c: [] }] },
        { t: 'Dos', c: [] },
        { t: 'Tres', c: [] },
        { t: 'Beta', c: [] },
        { t: 'Gamma', c: [] }
      ]
    })
    await app.qat('edit.undo').click()
    await expect.poll(async () => (await app.tree()).c.map(n => n.t)).toEqual(['UnoDosTres', 'Beta', 'Gamma'])
  })

  test('las líneas con caracteres especiales se conservan como texto (sin interpretar HTML)', async ({ page, maps }) => {
    const data = clone(SAMPLE_TREE)
    data.root.children[2].data.text = 'Gamma\na < b & c\n<img src=x onerror="window.__xss=1">'
    const { app } = await setupMap(page, maps, { data })
    await app.nodes.filter({ hasText: 'Gamma' }).first().click()
    await cmd(app, 'topic.split').click()
    // Texto visible de los temas (lo guardado va escapado, porque es HTML)
    await app.expectNodeCount(7)
    await expect.poll(async () => (await app.nodeTexts()).map(t => t.trim()))
      .toEqual(expect.arrayContaining(['Gamma', 'a < b & c', '<img src=x onerror="window.__xss=1">']))
    await expect(app.node('a < b & c')).toBeVisible()
    await page.waitForTimeout(200)
    expect(await page.evaluate(() => window.__xss)).toBeUndefined()
  })

  test('el tema central no se divide', async ({ page, maps }) => {
    const data = clone(SAMPLE_TREE)
    data.root.data.text = 'Línea 1\nLínea 2'
    const { app } = await setupMap(page, maps, { data })
    await app.selectRoot()
    await expect(cmd(app, 'topic.split')).toBeDisabled()
  })
})

test.describe('Seleccionar', () => {
  test('el botón selecciona todos los temas', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNode('Beta')
    await cmd(app, 'select.all').click()
    await expect.poll(() => selectedTexts(page)).toEqual(['Alfa', 'Alfa uno', 'Beta', 'Gamma', 'Raíz'])
  })

  test('Seleccionar hermanos', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNode('Beta')
    await app.chooseFromMenu('home', 'select.all', 'select.siblings')
    await expect.poll(() => selectedTexts(page)).toEqual(['Alfa', 'Beta', 'Gamma'])
    expect((await app.state()).activeCount).toBe(3)
  })

  test('Seleccionar el mismo nivel', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps, { data: TWO_LEVELS })
    await app.selectNode('Alfa uno')
    await app.chooseFromMenu('home', 'select.all', 'select.level')
    await expect.poll(() => selectedTexts(page)).toEqual(['Alfa uno', 'Beta uno'])
  })

  test('Seleccionar la rama', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps, { data: TWO_LEVELS })
    await app.selectNode('Alfa')
    await app.chooseFromMenu('home', 'select.all', 'select.branch')
    await expect.poll(() => selectedTexts(page)).toEqual(['Alfa', 'Alfa uno'])
  })

  test('Seleccionar con los mismos marcadores (icono o texto)', async ({ page, maps }) => {
    const data = clone(TWO_LEVELS)
    data.root.children[0].data.icon = ['priority_1']
    data.root.children[2].data.icon = ['priority_1', 'flag_red']
    data.root.children[1].children[0].data.tag = [{ text: 'Ana', style: { fill: '#2b6fbd' } }]
    data.root.children[0].children[0].data.tag = [{ text: 'ana', style: { fill: '#2b6fbd' } }]
    const { app } = await setupMap(page, maps, { data })

    await app.selectNode('Beta')
    await app.ribbonPanel('home').locator('[data-menu-for="select.all"]').click()
    await expect(app.menu.locator('[data-cmd="select.sameMarkers"]')).toBeDisabled()
    await page.keyboard.press('Escape')

    await app.selectNode('Alfa')
    await app.chooseFromMenu('home', 'select.all', 'select.sameMarkers')
    await expect.poll(() => selectedTexts(page)).toEqual(['Alfa', 'Gamma'])

    await app.selectNode('Beta uno')
    await app.chooseFromMenu('home', 'select.all', 'select.sameMarkers')
    await expect.poll(() => selectedTexts(page)).toEqual(['Alfa uno', 'Beta uno'])
  })

  test('el desplegable no se sale de la ventana por la derecha', async ({ page, maps }) => {
    await page.setViewportSize({ width: 1400, height: 760 })
    const { app } = await setupMap(page, maps)
    await app.selectNode('Beta')
    const arrow = app.ribbonPanel('home').locator('[data-menu-for="select.all"]')
    await arrow.scrollIntoViewIfNeeded()
    await arrow.click()
    await expect(app.menu).toBeVisible()
    await expect.poll(async () => (await app.menu.boundingBox()).x + (await app.menu.boundingBox()).width)
      .toBeLessThanOrEqual(1400)
  })

  test('los temas de ramas contraídas no se seleccionan', async ({ page, maps }) => {
    const data = clone(TWO_LEVELS)
    data.root.children[1].data.expand = false
    const { app } = await setupMap(page, maps, { data })
    await app.selectNode('Alfa uno')
    await app.chooseFromMenu('home', 'select.all', 'select.level')
    await expect.poll(() => selectedTexts(page)).toEqual(['Alfa uno'])
  })
})

test.describe('Limpiar', () => {
  const RICH = () => {
    const data = clone(SAMPLE_TREE)
    data.root.data._textMarkers = [{ id: 'c1', name: 'Estado', color: '#2b6fbd', markers: [{ id: 'm1', name: 'Hecho' }] }]
    Object.assign(data.root.data, { color: '#ff0000' })
    Object.assign(data.root.children[1].data, {
      color: '#c00000', fontStyle: 'italic', fillColor: '#ffff00',
      icon: ['priority_2'], tag: [{ text: 'Hecho', style: { fill: '#2b6fbd' } }],
      note: 'Nota de Beta', hyperlink: 'https://example.com/', hyperlinkTitle: 'Ejemplo'
    })
    return data
  }

  test('el botón Limpiar quita el formato propio y conserva marcadores y elementos', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps, { data: RICH() })
    await app.selectNode('Beta')
    await app.recordsHistory(() => cmd(app, 'clear.format').click())
    await expect.poll(() => app.nodeData('Beta', 'color')).toBeUndefined()
    expect(await app.nodeData('Beta', 'fontStyle')).toBeUndefined()
    expect(await app.nodeData('Beta', 'fillColor')).toBeUndefined()
    expect(await app.nodeData('Beta', 'icon')).toEqual(['priority_2'])
    expect(await app.nodeData('Beta', 'note')).toBe('Nota de Beta')

    await app.qat('edit.undo').click()
    await expect.poll(() => app.nodeData('Beta', 'color')).toBe('#c00000')
  })

  test('quitar el formato del tema central no borra las categorías de marcadores', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps, { data: RICH() })
    await app.selectRoot()
    await cmd(app, 'clear.format').click()
    await expect.poll(() => app.nodeData('Raíz', 'color')).toBeUndefined()
    expect((await app.nodeData('Raíz', '_textMarkers')).map(c => c.name)).toEqual(['Estado'])
  })

  test('Quitar marcadores, notas e hipervínculos: se habilitan solo si hay algo que quitar', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps, { data: RICH() })
    await app.selectNode('Gamma')
    await app.ribbonPanel('home').locator('[data-menu-for="clear.format"]').click()
    for (const id of ['clear.markers', 'clear.notes', 'clear.links']) {
      await expect(app.menu.locator(`[data-cmd="${id}"]`)).toBeDisabled()
    }
    await expect(app.menu.locator('[data-cmd="clear.all"]')).toBeEnabled()
    await page.keyboard.press('Escape')

    await app.selectNode('Beta')
    await app.chooseFromMenu('home', 'clear.format', 'clear.markers')
    await expect.poll(() => app.nodeData('Beta', 'icon')).toBeUndefined()
    expect(await app.nodeData('Beta', 'tag')).toBeUndefined()
    expect(await app.nodeData('Beta', 'note')).toBe('Nota de Beta')

    await app.chooseFromMenu('home', 'clear.format', 'clear.notes')
    await expect.poll(() => app.nodeData('Beta', 'note')).toBeUndefined()
    expect(await app.nodeData('Beta', 'hyperlink')).toBe('https://example.com/')

    await app.chooseFromMenu('home', 'clear.format', 'clear.links')
    await expect.poll(() => app.nodeData('Beta', 'hyperlink')).toBeUndefined()
    expect(await app.nodeData('Beta', 'hyperlinkTitle')).toBeUndefined()
    expect(await app.nodeData('Beta', 'color')).toBe('#c00000')
  })

  test('Limpiar todo deja el tema limpio y se deshace en un paso', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps, { data: RICH() })
    await app.selectNode('Beta')
    await app.recordsHistory(() => app.chooseFromMenu('home', 'clear.format', 'clear.all'))
    await expect.poll(async () => {
      const keys = ['color', 'fontStyle', 'fillColor', 'icon', 'tag', 'note', 'hyperlink']
      return Promise.all(keys.map(k => app.nodeData('Beta', k)))
    }).toEqual([undefined, undefined, undefined, undefined, undefined, undefined, undefined])

    await app.qat('edit.undo').click()
    await expect.poll(() => app.nodeData('Beta', 'note')).toBe('Nota de Beta')
    expect(await app.nodeData('Beta', 'icon')).toEqual(['priority_2'])
    expect(await app.nodeData('Beta', 'color')).toBe('#c00000')
  })

  test('con el panel Notas abierto, la nota borrada no reaparece al cambiar de tema', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps, { data: RICH() })
    await app.selectNode('Beta')
    await cmd(app, 'element.notes').click()
    await expect(page.locator('.notes-editor')).toHaveValue('Nota de Beta')

    await app.chooseFromMenu('home', 'clear.format', 'clear.notes')
    await expect(page.locator('.notes-editor')).toHaveValue('')
    await app.selectNode('Gamma')
    await app.selectNode('Beta')
    await page.waitForTimeout(700)
    expect(await app.nodeData('Beta', 'note')).toBeUndefined()

    // Deshacer devuelve la nota y el editor la muestra
    await app.qat('edit.undo').click()
    await expect.poll(() => app.nodeData('Beta', 'note')).toBe('Nota de Beta')
  })
})
