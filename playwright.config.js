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

// Cuarentena (lista en tests/impact-map.js): pruebas de fases empezadas y sin terminar. No se
// ejecutan para que un fallo en rojo siempre signifique algo; QUARANTINE=off las incluye.
const { QUARANTINE } = require('./tests/impact-map')

module.exports = defineConfig({
  testDir: './tests/e2e',
  testIgnore: process.env.QUARANTINE === 'off' ? [] : QUARANTINE.map(name => `**/${name}.*spec.js`),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Un reintento solo para DETECTAR pruebas inestables: Playwright las marca como "flaky" en
  // el informe y hay que corregirlas, no ignorarlas
  retries: 1,
  // Con más de 4 workers esta máquina (12 hilos, 16 GB) se satura y aparecen tiempos de espera
  // falsos; se puede cambiar con E2E_WORKERS
  workers: Number(process.env.E2E_WORKERS) || (process.env.CI ? 2 : 4),
  // results.json: duración de cada prueba (scripts/test-report.js saca las más lentas)
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/results.json' }]]
    : [['list'], ['json', { outputFile: 'test-results/results.json' }]],
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
