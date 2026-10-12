// Fase 1 · Copiar formato (de un solo uso, como en Office/MindManager)
const { test, expect, setupMap } = require('./fixtures')

test.describe('Copiar formato', () => {
  test('aplica el formato del tema origen al destino y se desactiva', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.setNodeStyle('Alfa', 'fillColor', '#ff0000')
    await app.setNodeStyle('Alfa', 'fontWeight', 'bold')
    const painter = app.ribbonCmd('home', 'clipboard.formatPainter')

    await app.selectNode('Alfa')
    await painter.click()
    await expect(painter).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('body')).toHaveClass(/painter-active/)

    await app.node('Beta').click()
    await expect.poll(() => app.nodeData('Beta', 'fillColor')).toBe('#ff0000')
    expect(await app.nodeData('Beta', 'fontWeight')).toBe('bold')

    // Un solo uso: el siguiente clic ya no copia el formato
    await expect(painter).toHaveAttribute('aria-pressed', 'false')
    await app.node('Gamma').click()
    expect(await app.nodeData('Gamma', 'fillColor')).toBeUndefined()
  })

  test('Esc cancela el modo copiar formato', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.setNodeStyle('Alfa', 'fillColor', '#00aa00')
    await app.selectNode('Alfa')
    await app.ribbonCmd('home', 'clipboard.formatPainter').click()
    expect(await app.isPainterActive()).toBe(true)

    await page.keyboard.press('Escape')
    await expect.poll(() => app.isPainterActive()).toBe(false)
    await app.node('Beta').click()
    expect(await app.nodeData('Beta', 'fillColor')).toBeUndefined()
  })

  test('volver a pulsar el botón cancela el modo', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    const painter = app.ribbonCmd('home', 'clipboard.formatPainter')
    await app.selectNode('Alfa')
    await painter.click()
    await expect(painter).toHaveAttribute('aria-pressed', 'true')
    await painter.click()
    await expect(painter).toHaveAttribute('aria-pressed', 'false')
  })

  test('aplicar el formato queda en el historial', async ({ page, maps }) => {
    const { app } = await setupMap(page, maps)
    await app.setNodeStyle('Alfa', 'fillColor', '#123456')
    await app.selectNode('Alfa')
    await app.ribbonCmd('home', 'clipboard.formatPainter').click()
    await app.node('Beta').click()
    await expect.poll(() => app.nodeData('Beta', 'fillColor')).toBe('#123456')

    await app.qat('edit.undo').click()
    await expect.poll(() => app.nodeData('Beta', 'fillColor')).toBeUndefined()
  })
})
