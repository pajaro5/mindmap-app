// Configuración de las pruebas e2e. Playwright arranca su propio servidor en un puerto
// distinto (3101) con una base de datos en memoria, así las pruebas nunca tocan
// data/mindmaps.db ni chocan con un servidor de desarrollo ya abierto.
const os = require('os')
const path = require('path')
const { defineConfig, devices } = require('@playwright/test')

const PORT = Number(process.env.E2E_PORT || 3101)
const baseURL = `http://localhost:${PORT}`
// Adjuntos de las pruebas en una carpeta temporal propia (nunca en data/files)
const FILES_DIR = path.join(os.tmpdir(), 'mindmap-e2e-files')

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    viewport: { width: 1280, height: 720 },
    acceptDownloads: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } },
    // Firefox en paralelo es inestable con Playwright 1.63 (error interno al cerrar contextos:
    // "Browser.removeBrowserContext ... _maybeDontRestoreTabs"); en serie pasa al 100%.
    { name: 'firefox', workers: 1, use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 720 } } }
  ],
  webServer: {
    command: 'node server/index.js',
    url: `${baseURL}/api/maps`,
    env: { PORT: String(PORT), DB_PATH: ':memory:', FILES_DIR, MAX_FILE_BYTES: String(2 * 1024 * 1024) },
    reuseExistingServer: false,
    timeout: 30_000
  }
})
