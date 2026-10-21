// Fase 18 · Pendientes de Inicio: pegado especial, estilos rápidos de tema, prioridad y
// progreso con clic en el icono, y vínculos a otro tema o a otro mapa
const { test, expect, setupMap, installFakeClipboard, SAMPLE_TREE } = require('./fixtures')

const clone = o => JSON.parse(JSON.stringify(o))
const cmd = (app, id) => app.ribbonCmd('home', id)
const dialog = page => page.locator('#appDialog')

async function openPasteSpecial(app) {
  await app.chooseFromMenu('home', 'clipboard.paste', 'clipboard.pasteSpecial')
  await expect(dialog(app.page).locator('[name="pasteText"]')).toBeVisible()
}

test.describe('Pegado especial', () => {
  test('un tema por línea: la sangría y las viñetas marcan el nivel; un solo paso de deshacer', async ({ page, maps }) => {
    const text = '- Fase 1\n    - Diseño\n    - Pruebas\n- Fase 2\n\t1. Entrega\n'
    const { app } = await setupMap(page, maps, { beforeGoto: p => installFakeClipboard(p) })
    await page.evaluate(t => { window.__clipboard.text = t }, text)
    await app.selectNode('Gamma')
    await openPasteSpecial(app)
    await expect(dialog(page).locator('[name="pasteText"]')).toHaveValue(text)
    await expect(dialog(page).locator('[name="pasteMode"][value="lines"]')).toBeChecked()
    await expect(dialog(page)).toContainText('5 temas')
    await app.recordsHistory(() => dialog(page).getByRole('button', { name: 'Pegar' }).click())
    await expect(dialog(page)).toBeHidden()
    await expect.poll(async () => (await app.tree()).c[2]).toEqual({
      t: 'Gamma',
      c: [
        { t: 'Fase 1', c: [{ t: 'Diseño', c: [] }, { t: 'Pruebas', c: [] }] },
        { t: 'Fase 2', c: [{ t: 'Entrega', c: [] }] }
      ]
    })
    await app.qat('edit.undo').click()
    await expect.poll(async () => (await app.tree()).c[2].c).toEqual([])
  })

  test('como un solo tema: varias líneas en un tema', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps, { beforeGoto: p => installFakeClipboard(p) })
    await page.evaluate(() => { window.__clipboard.text = 'Primera línea\nSegunda línea' })
    await app.selectNode('Beta')
    await openPasteSpecial(app)
    await dialog(page).locator('[name="pasteMode"][value="single"]').check()
    await expect(dialog(page)).toContainText('1 tema')
    await dialog(page).getByRole('button', { name: 'Pegar' }).click()
    await expect.poll(async () => (await app.tree()).c[1].c.length).toBe(1)
    const text = await page.evaluate(() => {
      const beta = Alpine.raw(window.Alpine.$data(document.body).mindMap).renderer.root.children[1]
      return topicLines(beta.children[0].getData('text'))
    })
    expect(text).toEqual(['Primera línea', 'Segunda línea'])
  })

  test('si el navegador no deja leer el portapapeles, se puede pegar en el cuadro', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps, { beforeGoto: p => installFakeClipboard(p, { denyRead: true }) })
    await app.selectNode('Beta')
    await openPasteSpecial(app)
    const area = dialog(page).locator('[name="pasteText"]')
    await expect(area).toHaveValue('')
    await dialog(page).getByRole('button', { name: 'Pegar' }).click()
    await expect(dialog(page).locator('.dialog-error')).toHaveText(/Escribe o pega/)
    await area.fill('Uno\nDos')
    await dialog(page).getByRole('button', { name: 'Pegar' }).click()
    await expect.poll(async () => (await app.tree()).c[1].c.map(c => c.t)).toEqual(['Uno', 'Dos'])
  })

  test('[Seguridad] el texto pegado con HTML se queda como texto', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps, { beforeGoto: p => installFakeClipboard(p) })
    const payload = '<img src=x onerror="window.__xss=1">'
    await page.evaluate(t => { window.__clipboard.text = t }, payload)
    await app.selectNode('Beta')
    await openPasteSpecial(app)
    await dialog(page).getByRole('button', { name: 'Pegar' }).click()
    await expect(app.node(payload)).toBeVisible()
    await page.waitForTimeout(200)
    expect(await page.evaluate(() => window.__xss)).toBeUndefined()
  })

  test('sin tema seleccionado, Pegado especial está deshabilitado', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.ribbonPanel('home').locator('[data-menu-for="clipboard.paste"]').click()
    await expect(app.menu.locator('[data-cmd="clipboard.pasteSpecial"]')).toBeDisabled()
  })
})

test.describe('Estilos rápidos de tema', () => {
  test('la galería aplica el estilo a los temas seleccionados en un paso y marca el actual', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNodes('Beta', 'Gamma')
    await cmd(app, 'style.quick').click()
    await expect(app.menu.locator('[data-option]')).toHaveCount(8)
    await app.recordsHistory(() => app.menu.locator('[data-option="red"]').click())
    for (const t of ['Beta', 'Gamma']) {
      await expect.poll(() => app.nodeData(t, 'fillColor')).toBe('#c00000')
      expect(await app.nodeData(t, 'gradientStyle')).toBe(false)
      expect(await app.nodeData(t, 'color')).toBe('#ffffff')
    }
    await expect.poll(async () => ((await app.nodeRender('Beta')) || {}).fill).toBe('#c00000')
    await cmd(app, 'style.quick').click()
    await expect(app.menu.locator('[data-option="red"]')).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('Escape')

    await app.qat('edit.undo').click()
    await expect.poll(() => app.nodeData('Beta', 'fillColor')).toBeUndefined()
    expect(await app.nodeData('Gamma', 'fillColor')).toBeUndefined()
  })

  test('"Solo texto" quita el relleno y el borde', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.selectNode('Beta')
    await cmd(app, 'style.quick').click()
    await app.menu.locator('[data-option="plain"]').click()
    await expect.poll(async () => ((await app.nodeRender('Beta')) || {}).fill).toBe('transparent')
    expect(Number((await app.nodeRender('Beta')).strokeWidth)).toBe(0)
  })
})

test.describe('Prioridad y progreso con clic en el icono', () => {
  test('clic en la prioridad pasa a la siguiente (tras la 9, la 1); clic en el progreso avanza un cuarto', async ({ page, maps }) => {
    const data = clone(SAMPLE_TREE)
    data.root.children[1].data.icon = ['priority_8', 'progress_6']
    data.root.children[2].data.icon = ['flag_red']
    const { app } = await setupMap(page, maps, { data })
    // El evento que emite la librería al hacer clic en un icono del tema
    const clickIcon = async (text, id) => {
      await page.evaluate(([text, id]) => {
        const strip = s => String(s).replace(/<[^>]+>/g, '').trim()
        const mm = Alpine.raw(window.Alpine.$data(document.body).mindMap)
        const node = mm.renderer.root.children.find(n => strip(n.getData('text')) === text)
        mm.emit('node_icon_click', node, id, new MouseEvent('click'), null)
      }, [text, id])
    }
    // Cada clic con su propia entrada de historial: la librería funde los cambios que caen en
    // 100 ms, y en una máquina rápida (CI) dos clics seguidos acababan en una sola entrada
    await app.recordsHistory(() => clickIcon('Beta', 'priority_8'))
    await expect.poll(async () => [...((await app.nodeData('Beta', 'icon')) || [])].sort()).toEqual(['priority_9', 'progress_6'].sort())
    await app.recordsHistory(() => clickIcon('Beta', 'priority_9'))
    await expect.poll(async () => [...((await app.nodeData('Beta', 'icon')) || [])].sort()).toEqual(['priority_1', 'progress_6'].sort())
    // progress_6 = 75 % → 100 % (progress_8) → 25 % (progress_2)
    await app.recordsHistory(() => clickIcon('Beta', 'progress_6'))
    await expect.poll(async () => [...((await app.nodeData('Beta', 'icon')) || [])].sort()).toEqual(['priority_1', 'progress_8'].sort())
    await app.settleHistory()
    await app.recordsHistory(() => clickIcon('Beta', 'progress_8'))
    await expect.poll(async () => [...((await app.nodeData('Beta', 'icon')) || [])].sort()).toEqual(['priority_1', 'progress_2'].sort())
    // Otros iconos no cambian
    await clickIcon('Gamma', 'flag_red')
    await page.waitForTimeout(200)
    expect(await app.nodeData('Gamma', 'icon')).toEqual(['flag_red'])

    await app.qat('edit.undo').click()
    await expect.poll(async () => [...((await app.nodeData('Beta', 'icon')) || [])].sort()).toEqual(['priority_1', 'progress_8'].sort())
  })

  test('clic real sobre el icono de prioridad del tema', async ({ page, maps }) => {
    const data = clone(SAMPLE_TREE)
    data.root.children[1].data.icon = ['priority_2']
    const { app } = await setupMap(page, maps, { data })
    const box = await app.node('Beta').boundingBox()
    // El icono va a la izquierda del texto
    const iconBox = await page.evaluate(() => {
      const beta = Alpine.raw(window.Alpine.$data(document.body).mindMap).renderer.root.children[1]
      const r = beta._iconData[0].node.node.getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    })
    expect(iconBox.x).toBeGreaterThan(box.x)
    await page.mouse.click(iconBox.x, iconBox.y)
    await expect.poll(async () => [...((await app.nodeData('Beta', 'icon')) || [])].sort()).toEqual(['priority_3'].sort())
  })
})

test.describe('Vínculos a un tema o a otro mapa', () => {
  test('vínculo a un tema: salta a él desplegando su rama', async ({ page, maps }) => {
    const data = clone(SAMPLE_TREE)
    data.root.children[0].data.expand = false // Alfa contraído: "Alfa uno" no se ve
    data.root.children[0].children[0].data.uid = 'alfa-uno-uid'
    const { app, map } = await setupMap(page, maps, { data })
    await expect(app.node('Alfa uno')).toHaveCount(0)
    await app.selectNode('Gamma')
    await cmd(app, 'element.hyperlink').click()
    await dialog(page).locator('[name="linkKind"][value="topic"]').check()
    const select = dialog(page).locator('[name="linkTopic"]')
    await expect(select.locator('option', { hasText: 'Alfa uno' })).toHaveCount(1)
    await expect(select.locator('option', { hasText: /^\s*Gamma$/ })).toHaveCount(0) // no a sí mismo
    await select.selectOption('alfa-uno-uid')
    await dialog(page).getByRole('button', { name: 'Aceptar' }).click()
    await expect.poll(() => app.nodeData('Gamma', 'hyperlink')).toMatch(/^topic:/)
    expect(await app.nodeData('Gamma', 'hyperlinkTitle')).toBe('Ir a: Alfa uno')

    await app.node('Gamma').locator('a').first().click()
    await expect(app.node('Alfa uno')).toBeVisible()
    await expect.poll(async () => page.evaluate(() => {
      const list = window.Alpine.$data(document.body).activeNodeList
      return list.length === 1 ? list[0].getData('text').replace(/<[^>]+>/g, '') : null
    })).toBe('Alfa uno')

    // Al reabrir el diálogo se muestra el destino elegido
    await app.selectNode('Gamma')
    await cmd(app, 'element.hyperlink').click()
    await expect(dialog(page).locator('[name="linkKind"][value="topic"]')).toBeChecked()
    await expect(dialog(page).locator('[name="linkTopic"] option:checked')).toHaveText(/Alfa uno/)
    await dialog(page).getByRole('button', { name: 'Cancelar' }).click()
    await expect.poll(async () => (await maps.get(map.id)).data.root.children[2].data.hyperlink).toMatch(/^topic:/)
  })

  test('vínculo a otro mapa: lo abre', async ({ page, maps }) => {
    const other = await maps.create()
    const { app } = await setupMap(page, maps)
    await app.selectNode('Beta')
    await cmd(app, 'element.hyperlink').click()
    await dialog(page).locator('[name="linkKind"][value="map"]').check()
    await dialog(page).locator('[name="linkMap"]').selectOption(other.id)
    await dialog(page).getByRole('button', { name: 'Aceptar' }).click()
    await expect.poll(() => app.nodeData('Beta', 'hyperlink')).toBe(`map:${other.id}`)
    await app.node('Beta').locator('a').first().click()
    await expect.poll(async () => (await app.state()).currentId).toBe(other.id)
  })

  test('un vínculo a un tema que ya no existe avisa sin romper nada', async ({ page, maps }) => {
    const data = clone(SAMPLE_TREE)
    data.root.children[1].data.hyperlink = 'topic:no-existe'
    const { app } = await setupMap(page, maps, { data })
    await app.node('Beta').locator('a').first().click()
    await expect(app.errorBanner).toContainText('ya no existe')
  })

  test('[Seguridad] vínculos internos malformados se descartan al abrir el mapa', async ({ page, maps }) => {
    const data = clone(SAMPLE_TREE)
    data.root.children[0].data.hyperlink = 'topic:<script>alert(1)</script>'
    data.root.children[1].data.hyperlink = 'map:../../etc/passwd'
    data.root.children[2].data.hyperlink = 'javascript:alert(1)'
    const { app } = await setupMap(page, maps, { data })
    for (const t of ['Alfa', 'Beta', 'Gamma']) expect(await app.nodeData(t, 'hyperlink')).toBeUndefined()
  })
})
