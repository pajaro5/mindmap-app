// Fase 1 · Portapapeles: Copiar, Cortar, Pegar (cinta y teclado), respaldo sin permisos
// y pegado de texto externo. El portapapeles del sistema se simula para que el resultado
// no dependa de los permisos del navegador sin interfaz.
const { test, expect, installFakeClipboard, setupMap } = require('./fixtures')

const childrenOf = (tree, text) => {
  const find = n => n.t === text ? n : n.c.map(find).find(Boolean)
  const node = find(tree)
  return node ? node.c.map(c => c.t) : null
}

test.describe('Portapapeles', () => {
  test('Copiar y Pegar desde la cinta duplica la rama como subtema', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps, { beforeGoto: p => installFakeClipboard(p) })
    await app.selectNode('Alfa')
    await app.ribbonCmd('home', 'clipboard.copy').click()
    await app.selectNode('Beta')
    await app.ribbonCmd('home', 'clipboard.paste').click()

    await expect.poll(async () => childrenOf(await app.tree(), 'Beta')).toEqual(['Alfa'])
    const tree = await app.tree()
    expect(childrenOf(tree, 'Raíz')).toEqual(['Alfa', 'Beta', 'Gamma'])
    // La rama pegada conserva sus hijos
    expect(tree.c[1].c[0].c.map(c => c.t)).toEqual(['Alfa uno'])
  })

  test('Cortar y Pegar mueve la rama', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps, { beforeGoto: p => installFakeClipboard(p) })
    await app.selectNode('Alfa')
    await app.ribbonCmd('home', 'clipboard.cut').click()
    await expect.poll(async () => childrenOf(await app.tree(), 'Raíz')).toEqual(['Beta', 'Gamma'])

    await app.selectNode('Gamma')
    await app.ribbonCmd('home', 'clipboard.paste').click()
    await expect.poll(async () => childrenOf(await app.tree(), 'Gamma')).toEqual(['Alfa'])
    expect(childrenOf(await app.tree(), 'Alfa')).toEqual(['Alfa uno'])
  })

  test('los atajos Ctrl+C y Ctrl+V funcionan', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps, { beforeGoto: p => installFakeClipboard(p) })
    await app.selectNode('Gamma')
    await page.keyboard.press('ControlOrMeta+c')
    await app.selectNode('Beta')
    await page.keyboard.press('ControlOrMeta+v')
    await expect.poll(async () => childrenOf(await app.tree(), 'Beta')).toEqual(['Gamma'])
  })

  test('si el navegador deniega leer el portapapeles, pega lo copiado dentro de la app', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps, { beforeGoto: p => installFakeClipboard(p, { denyRead: true }) })
    await app.selectNode('Alfa')
    await app.ribbonCmd('home', 'clipboard.copy').click()
    await app.selectNode('Gamma')
    await app.ribbonCmd('home', 'clipboard.paste').click()

    await expect.poll(async () => childrenOf(await app.tree(), 'Gamma')).toEqual(['Alfa'])
    expect(await page.evaluate(() => window.__clipboard.reads)).toBeGreaterThan(0)
    await expect(app.errorBanner).toBeHidden()
  })

  test('pegar texto copiado desde otra aplicación crea un subtema con ese texto', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps, { beforeGoto: p => installFakeClipboard(p) })
    await page.evaluate(() => { window.__clipboard.text = 'Texto externo' })
    await app.selectNode('Beta')
    await app.ribbonCmd('home', 'clipboard.paste').click()
    await expect.poll(async () => childrenOf(await app.tree(), 'Beta')).toEqual(['Texto externo'])
  })

  test('pegar queda en el historial: Deshacer lo revierte', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps, { beforeGoto: p => installFakeClipboard(p) })
    await app.selectNode('Gamma')
    await app.ribbonCmd('home', 'clipboard.copy').click()
    await app.selectNode('Beta')
    await app.ribbonCmd('home', 'clipboard.paste').click()
    await expect.poll(async () => childrenOf(await app.tree(), 'Beta')).toEqual(['Gamma'])

    await app.qat('edit.undo').click()
    await expect.poll(async () => childrenOf(await app.tree(), 'Beta')).toEqual([])
  })

  test('el contenido copiado se guarda en el portapapeles del sistema', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps, { beforeGoto: p => installFakeClipboard(p) })
    await app.selectNode('Alfa')
    await app.ribbonCmd('home', 'clipboard.copy').click()
    await expect.poll(() => page.evaluate(() => window.__clipboard.text)).toContain('Alfa uno')
  })
})
