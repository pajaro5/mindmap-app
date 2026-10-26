// Genera build/icon.png (256×256, fondo transparente) a partir de public/favicon.svg: es el icono
// de la app de escritorio, del instalador y de los accesos directos (electron-builder lo
// convierte a .ico). Se vuelve a ejecutar solo si cambia el logo: `node scripts/make-icon.js`.
const fs = require('fs')
const path = require('path')
const { chromium } = require('@playwright/test')

const SIZE = 256
const svg = fs.readFileSync(path.join(__dirname, '..', 'public', 'favicon.svg'), 'utf8')
const out = path.join(__dirname, '..', 'build', 'icon.png')

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } })
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${SIZE}px;height:${SIZE}px}</style>${svg}`)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  await page.locator('svg').screenshot({ path: out, omitBackground: true })
  await browser.close()
  console.log(`Icono generado: ${path.relative(process.cwd(), out)}`)
})()
