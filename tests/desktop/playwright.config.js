// Pruebas de la app de escritorio (Electron): `npm run test:desktop`. Van aparte de las e2e del
// navegador porque cada prueba arranca la app entera con su propia carpeta de datos temporal.
const { defineConfig } = require('@playwright/test')

module.exports = defineConfig({
  testDir: '.',
  testMatch: '*.spec.js',
  workers: 1,
  retries: 1,
  timeout: 60_000,
  reporter: [['list']]
})
