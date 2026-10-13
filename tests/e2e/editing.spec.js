// Edición de temas con teclado y con la cinta; deshacer/rehacer
const { test, expect } = require('./fixtures')

test('editar el texto del tema central', async ({ openMap, page }) => {
  const { app } = openMap
  await app.rootNode.dblclick()
  const editBox = page.locator('.smm-richtext-node-edit-wrap')
  await expect(editBox).toBeVisible()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.type('Mi Proyecto')
  await page.keyboard.press('Enter')
  await expect(app.rootNode).toContainText('Mi Proyecto')
})

test('Tab crea un subtema y Enter un tema hermano', async ({ openMap, page }) => {
  const { app } = openMap
  await app.selectRoot()
  await page.keyboard.press('Tab')
  await app.typeNewTopic('Subtema 1')
  await app.expectNodeCount(2)

  await app.nodes.filter({ hasText: 'Subtema 1' }).click()
  await page.keyboard.press('Enter')
  await app.typeNewTopic('Subtema 2')
  await app.expectNodeCount(3)
  await expect(app.nodes.filter({ hasText: 'Subtema 2' })).toHaveCount(1)
})

test('deshacer y rehacer desde la barra de acceso rápido', async ({ openMap, page }) => {
  const { app } = openMap
  await app.selectRoot()
  await app.recordsHistory(async () => {
    await page.keyboard.press('Tab')
    await app.expectNodeCount(2)
    await app.clickEmptyCanvas()
  })
  // Al cerrar la edición del tema nuevo la librería añade otra entrada con retardo: si
  // Deshacer llega antes, deshace esa y el tema sigue ahí (fallo intermitente en Firefox)
  await expect(app.editBox).toBeHidden()
  await app.settleHistory()

  await app.qat('edit.undo').click()
  await app.expectNodeCount(1)
  await app.qat('edit.redo').click()
  await app.expectNodeCount(2)
})

test('Esc termina la edición del tema, conserva el texto y los atajos vuelven a funcionar', async ({ openMap, page }) => {
  const { app } = openMap
  await app.selectRoot()
  await page.keyboard.press('Tab')
  await expect(app.editBox).toBeVisible()
  await page.keyboard.type('Escrito')
  await page.keyboard.press('Escape')
  await expect(app.editBox).toBeHidden()
  await expect.poll(() => app.page.evaluate(() => document.activeElement === document.body)).toBe(true)
  await expect(app.node('Escrito')).toBeVisible()
  await app.settleHistory()

  // Ctrl+Z responde enseguida (antes el foco seguía dentro del cuadro de edición)
  await page.keyboard.press('Control+z')
  await expect(app.node('Escrito')).toHaveCount(0)
})

// Error de la librería corregido en stripTransientHistoryFlags: con el equipo lento, la
// entrada de historial del tema nuevo guardaba `inserting: true` y Deshacer no lo quitaba
// (Era intermitente y dependía de la velocidad del equipo; aquí se comprueba la causa de
// forma determinista: la instantánea tomada justo después de insertar no lleva la marca)
test('el historial no guarda la marca temporal de "tema recién insertado"', async ({ openMap, page }) => {
  const { app } = openMap
  await app.selectRoot()
  const snapshot = await page.evaluate(() => {
    const mm = window.Alpine.$data(document.body).mindMap
    mm.execCommand('INSERT_CHILD_NODE')
    // En el mismo instante en que la librería tomaría la instantánea del historial
    const hasFlag = n => !!n && (n.inserting === true || (n.children || []).some(hasFlag))
    return { liveHasFlag: hasFlag(mm.renderer.renderTree), copy: JSON.stringify(mm.command.getCopyData()) }
  })
  // La marca existe en los datos vivos (si no, la prueba no probaría nada)…
  expect(snapshot.liveHasFlag).toBe(true)
  // …pero no en lo que se guarda en el historial
  expect(snapshot.copy).not.toContain('"inserting"')

  await expect(app.editBox).toBeVisible()
  await page.keyboard.press('Escape')
  await app.expectNodeCount(2)
  await app.settleHistory()
  await app.qat('edit.undo').click()
  await app.expectNodeCount(1)
})

test('escribir en el título del mapa no dispara los atajos del mapa', async ({ openMap, page }) => {
  const { app } = openMap
  await app.selectRoot()
  await page.keyboard.press('Tab')
  await app.typeNewTopic('No me borres')
  await app.node('No me borres').click()
  // Con un tema seleccionado, teclear en el título no debe borrarlo ni crear temas
  await app.titleInput.click()
  await page.keyboard.press('End')
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Delete')
  await page.keyboard.press('Tab')
  await app.expectNodeCount(2)
  await expect(app.node('No me borres')).toHaveCount(1)
})

test('cinta: Subtema, Tema y Eliminar', async ({ openMap, page }) => {
  const { app } = openMap
  await app.selectRoot()
  await app.ribbonCmd('home', 'topic.insertChild').click()
  await app.expectNodeCount(2)
  await page.keyboard.press('Escape')

  // El nodo recién creado queda activo: insertar un hermano
  await app.ribbonCmd('home', 'topic.insertSibling').click()
  await app.expectNodeCount(3)
  await page.keyboard.press('Escape')

  await app.ribbonCmd('home', 'topic.remove').click()
  await app.expectNodeCount(2)
})
