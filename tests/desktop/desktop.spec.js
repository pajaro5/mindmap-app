// App de escritorio (desktop/main.js): arranque, datos en la carpeta del usuario, guardado al
// cerrar y seguridad de la ventana. Cada prueba usa una carpeta de datos temporal propia.
const fs = require('fs')
const os = require('os')
const path = require('path')
const { test, expect, _electron: electron } = require('@playwright/test')

const ROOT = path.join(__dirname, '..', '..')
// MINDMAP_DESKTOP_EXE=dist/win-unpacked/Mapas Mentales.exe prueba la app ya empaquetada (con
// el código dentro del .asar) en lugar de `electron .`
const EXE = process.env.MINDMAP_DESKTOP_EXE
const launchOptions = userData => ({
  ...(EXE ? { executablePath: path.resolve(EXE), args: [] } : { args: [ROOT] }),
  env: { ...process.env, MINDMAP_USER_DATA: userData }
})

// Apps abiertas en la prueba: se cierran al final aunque la prueba falle (si no, Windows no
// deja borrar su carpeta de datos)
let launched = []

async function launch(userData) {
  const app = await electron.launch(launchOptions(userData))
  launched.push(app)
  const page = await app.firstWindow()
  await page.waitForFunction(() => window.Alpine && typeof window.Alpine.$data(document.body).loadMapList === 'function')
  return { app, page }
}

// Cierra la ventana como lo haría el usuario (botón X) y espera a que la app termine
async function closeLikeUser(app) {
  const closed = app.waitForEvent('close')
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
  await closed
}

let userData
test.beforeEach(() => { userData = fs.mkdtempSync(path.join(os.tmpdir(), 'mindmap-desktop-')) })
test.afterEach(async () => {
  for (const app of launched) await app.close().catch(() => {})
  launched = []
  fs.rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
})

test('arranca en 127.0.0.1 con la base de datos en la carpeta del usuario', async () => {
  const { app, page } = await launch(userData)
  expect(page.url()).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/)
  await expect(page).toHaveTitle('Mis Mapas Mentales')
  await expect(page.locator('.qat [data-cmd="map.new"]')).toBeVisible()
  expect(fs.existsSync(path.join(userData, 'mindmaps.db'))).toBe(true)
  expect(fs.existsSync(path.join(userData, 'files'))).toBe(true)

  // El servidor no es accesible desde la red local: solo escucha en 127.0.0.1
  const port = new URL(page.url()).port
  const lan = Object.values(os.networkInterfaces()).flat().find(i => i && i.family === 'IPv4' && !i.internal)
  if (lan) {
    const reachable = await fetch(`http://${lan.address}:${port}/api/maps`, { signal: AbortSignal.timeout(3000) })
      .then(() => true, () => false)
    expect(reachable).toBe(false)
  }
  await app.close()
})

async function newMap(page) {
  await page.locator('.qat [data-cmd="map.new"]').click()
  const root = page.locator('#mindMapContainer .smm-node').first()
  await expect(root).toBeVisible()
  await page.waitForFunction(() => window.Alpine.$data(document.body).mindMap.command.history.length > 0)
  return root
}

async function savedRootOfOnlyMap(page) {
  return page.evaluate(async () => {
    const [map] = await (await fetch('/api/maps')).json()
    return JSON.stringify((await (await fetch(`/api/maps/${map.id}`)).json()).data.root)
  })
}

test('un cambio hecho en el mismo instante en que se cierra la ventana se guarda', async () => {
  let { app, page } = await launch(userData)
  await newMap(page)
  // El cambio y el cierre (como el botón X) van seguidos desde el proceso principal: la
  // librería aún no ha avisado del cambio (lo hace a los 100 ms) ni se ha programado el
  // autoguardado (800 ms). window.close() desde la página no sirve: se salta el evento close.
  const closed = app.waitForEvent('close')
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    return win.webContents.executeJavaScript(`(() => {
      const mm = Alpine.raw(Alpine.$data(document.body).mindMap)
      mm.execCommand('SET_NODE_TEXT', mm.renderer.root, 'Último cambio')
    })()`).then(() => win.close())
  })
  await closed

  ;({ app, page } = await launch(userData))
  expect(await savedRootOfOnlyMap(page)).toContain('Último cambio')
  await app.close()
})

// La misma lógica sin el ida y vuelta entre procesos (que en un equipo lento ya pasa de 100 ms
// y dejaría programado el autoguardado): cambio y guardado de cierre en el mismo instante
test('el guardado de cierre guarda un cambio aunque el autoguardado aún no esté programado', async () => {
  const { app, page } = await launch(userData)
  await newMap(page)
  // Que no quede ningún autoguardado del mapa recién creado
  await page.waitForFunction(() => !window.Alpine.$data(document.body).saveTimer)
  const state = await page.evaluate(async () => {
    const d = window.Alpine.$data(document.body)
    const mm = window.Alpine.raw(d.mindMap)
    mm.execCommand('SET_NODE_TEXT', mm.renderer.root, 'Cambio inmediato')
    const scheduled = !!d.saveTimer
    await window.mindmapFlushBeforeClose()
    return { scheduled }
  })
  expect(state.scheduled).toBe(false)
  expect(await savedRootOfOnlyMap(page)).toContain('Cambio inmediato')
  await app.close()
})

test('un autoguardado lento que sigue en curso no pisa el guardado de cierre', async () => {
  const { app, page } = await launch(userData)
  await newMap(page)
  await page.evaluate(async () => {
    const d = window.Alpine.$data(document.body)
    const mm = window.Alpine.raw(d.mindMap)
    // El primer PUT tarda 400 ms en salir hacia el servidor
    const realFetch = window.fetch
    let delayNext = true
    window.fetch = (url, opts) => {
      if (opts && opts.method === 'PUT' && delayNext) {
        delayNext = false
        return new Promise(resolve => setTimeout(resolve, 400)).then(() => realFetch(url, opts))
      }
      return realFetch(url, opts)
    }
    mm.execCommand('SET_NODE_TEXT', mm.renderer.root, 'Versión vieja')
    d.saveCurrentMap() // en curso, sin esperar
    mm.execCommand('SET_NODE_TEXT', mm.renderer.root, 'Versión nueva')
    await window.mindmapFlushBeforeClose()
    await new Promise(resolve => setTimeout(resolve, 600))
  })
  expect(await savedRootOfOnlyMap(page)).toContain('Versión nueva')
  await app.close()
})

test('cerrar con el texto de un tema a medio escribir lo conserva', async () => {
  let { app, page } = await launch(userData)
  const root = await newMap(page)
  await root.click()
  await page.keyboard.press('Tab')
  await expect(page.locator('.smm-richtext-node-edit-wrap')).toBeVisible()
  await page.keyboard.type('Sin pulsar Enter')
  await closeLikeUser(app)

  ;({ app, page } = await launch(userData))
  expect(await savedRootOfOnlyMap(page)).toContain('Sin pulsar Enter')
  await app.close()
})

test('los vínculos web se abren en el navegador del sistema, no en la app', async () => {
  const { app, page } = await launch(userData)
  await app.evaluate(({ shell }) => {
    global.openedExternally = []
    shell.openExternal = async url => { global.openedExternally.push(url) }
  })
  // window.open devuelve null cuando no se abre ninguna ventana
  const opened = await page.evaluate(() => [
    window.open('https://example.com/a', '_blank', 'noopener,noreferrer'),
    window.open('file:///C:/Windows/System32/calc.exe', '_blank'),
    window.open('/api/maps', '_blank')
  ].map(w => w !== null))
  expect(opened).toEqual([false, false, false])
  await expect.poll(() => app.evaluate(() => global.openedExternally)).toEqual(['https://example.com/a'])
  expect(app.windows()).toHaveLength(1)

  // Navegar fuera de la app tampoco cambia la ventana
  const url = page.url()
  await page.evaluate(() => { location.href = 'https://example.org/' })
  await expect.poll(() => app.evaluate(() => global.openedExternally)).toEqual(['https://example.com/a', 'https://example.org/'])
  expect(page.url()).toBe(url)
  await app.close()
})

test('permisos: portapapeles sí; cámara, ubicación y notificaciones no', async () => {
  const { app, page } = await launch(userData)
  const states = await page.evaluate(async () => {
    const out = {}
    for (const name of ['clipboard-read', 'geolocation', 'notifications', 'camera']) {
      try { out[name] = (await navigator.permissions.query({ name })).state } catch { out[name] = 'error' }
    }
    return out
  })
  expect(states['clipboard-read']).toBe('granted')
  expect(states.geolocation).not.toBe('granted')
  expect(states.notifications).not.toBe('granted')
  expect(states.camera).not.toBe('granted')
  await app.close()
})

test('una segunda copia de la app no abre otra ventana', async () => {
  const { app } = await launch(userData)
  const second = await electron.launch(launchOptions(userData)).catch(() => null)
  // La segunda copia termina sola (si Playwright llegó a conectarse, se espera a que se cierre)
  if (second) {
    const proc = second.process()
    const ended = proc.exitCode !== null || await Promise.race([
      new Promise(resolve => proc.once('exit', () => resolve(true))),
      new Promise(resolve => setTimeout(() => resolve(proc.exitCode !== null), 15_000))
    ])
    if (!ended) await second.close().catch(() => {})
    expect(ended).toBe(true)
  }
  expect(app.windows()).toHaveLength(1)
  await app.close()
})
