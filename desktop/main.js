// Aplicación de escritorio (Electron). Arranca el servidor de la app dentro de este mismo
// proceso, solo en 127.0.0.1 y en un puerto libre, con la base de datos y los adjuntos en la
// carpeta de datos del usuario (%APPDATA%\Mapas Mentales), y lo muestra en una ventana.
// MINDMAP_USER_DATA cambia esa carpeta (lo usan las pruebas de tests/desktop).
const path = require('path')
const { app, BrowserWindow, Menu, shell, session } = require('electron')
const { isAppUrl, isExternalUrl, isAllowedPermission } = require('./policy')

if (process.env.MINDMAP_USER_DATA) app.setPath('userData', process.env.MINDMAP_USER_DATA)

// El mismo servidor que `npm start`, configurado con sus variables de entorno
function startServer() {
  const dataDir = app.getPath('userData')
  process.env.HOST = '127.0.0.1'
  process.env.PORT = '0'
  process.env.DB_PATH = path.join(dataDir, 'mindmaps.db')
  process.env.FILES_DIR = path.join(dataDir, 'files')
  const server = require('../server')
  return new Promise((resolve, reject) => {
    if (server.listening) return resolve(server.address().port)
    server.once('listening', () => resolve(server.address().port))
    server.once('error', reject)
  })
}

function createWindow(origin) {
  const win = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    show: false,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false }
  })
  win.once('ready-to-show', () => win.show())

  // Vínculos de los temas (window.open) y navegaciones fuera de la app: al navegador del sistema
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url, origin)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (isAppUrl(url, origin)) return
    event.preventDefault()
    if (isExternalUrl(url, origin)) shell.openExternal(url)
  })

  // Antes de cerrar se guarda lo que esperaba al autoguardado (si no, se perdería la última
  // edición de los 800 ms anteriores). Si la página no responde, se cierra igualmente.
  let flushed = false
  win.on('close', event => {
    if (flushed) return
    event.preventDefault()
    const flush = win.webContents.executeJavaScript('window.mindmapFlushBeforeClose ? window.mindmapFlushBeforeClose() : null')
    const timeout = new Promise(resolve => setTimeout(resolve, 5000))
    Promise.race([flush, timeout]).catch(() => {}).finally(() => {
      flushed = true
      win.close()
    })
  })

  win.loadURL(`${origin}/`)
  return win
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  // Una segunda copia de la app no abre otra ventana: trae al frente la que ya está abierta
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
  })

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null)
    const port = await startServer()
    const origin = `http://127.0.0.1:${port}`
    session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
      callback(isAllowedPermission(permission, details.requestingUrl || wc.getURL(), origin))
    })
    session.defaultSession.setPermissionCheckHandler((wc, permission, requestingOrigin) =>
      isAllowedPermission(permission, requestingOrigin, origin))
    createWindow(origin)
  })

  app.on('window-all-closed', () => app.quit())
}
