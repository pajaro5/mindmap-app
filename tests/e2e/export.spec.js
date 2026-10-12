// Exportación a PNG y PDF
const fs = require('fs')
const { test, expect } = require('./fixtures')

for (const type of ['png', 'pdf']) {
  test(`exportar ${type.toUpperCase()} descarga un archivo válido`, async ({ openMap, page }, testInfo) => {
    const { app } = openMap
    await app.ribbonTab('export').click()
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      app.ribbonCmd('export', `export.${type}`).click()
    ])
    expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${type}$`))
    const file = testInfo.outputPath(download.suggestedFilename())
    await download.saveAs(file)
    const head = fs.readFileSync(file).subarray(0, 5)
    const signature = type === 'png' ? Buffer.from([0x89, 0x50, 0x4e, 0x47]) : Buffer.from('%PDF')
    expect(head.subarray(0, signature.length).equals(signature), `firma ${type} válida`).toBe(true)
  })
}
