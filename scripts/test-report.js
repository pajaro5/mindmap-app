// Resumen de la última ejecución de Playwright (test-results/results.json):
// pruebas inestables, las más lentas y el tiempo por archivo.
//   npm run test:stats [-- n]     (n = cuántas pruebas lentas mostrar; 20 por defecto)
const fs = require('fs')
const path = require('path')

const file = path.join(__dirname, '..', 'test-results', 'results.json')
if (!fs.existsSync(file)) {
  console.error('No hay test-results/results.json: ejecuta antes las pruebas.')
  process.exit(1)
}
const report = JSON.parse(fs.readFileSync(file, 'utf8'))
const top = Number(process.argv[2]) || 20

// Aplana suites → [{ file, title, project, status, duration, retries }]
const rows = []
const walk = (suite, titles) => {
  for (const spec of suite.specs || []) {
    for (const t of spec.tests || []) {
      const results = t.results || []
      rows.push({
        file: spec.file,
        title: [...titles, spec.title].filter(Boolean).join(' › '),
        project: t.projectName,
        status: t.status, // expected | unexpected | flaky | skipped
        duration: results.reduce((n, r) => n + (r.duration || 0), 0),
        retries: Math.max(0, results.length - 1)
      })
    }
  }
  for (const child of suite.suites || []) walk(child, child.file === child.title ? titles : [...titles, child.title])
}
report.suites.forEach(s => walk(s, []))

const secs = ms => `${(ms / 1000).toFixed(1)} s`
const ran = rows.filter(r => r.status !== 'skipped')
const total = ran.reduce((n, r) => n + r.duration, 0)
const count = status => rows.filter(r => r.status === status).length

console.log(`Pruebas: ${ran.length} ejecutadas · ${count('expected')} bien · ${count('unexpected')} fallan · ${count('flaky')} inestables · ${count('skipped')} omitidas`)
console.log(`Tiempo de pruebas (suma, sin paralelismo): ${secs(total)} · duración real: ${secs(report.stats.duration)}`)

const flaky = rows.filter(r => r.status === 'flaky')
if (flaky.length) {
  console.log('\nINESTABLES (pasaron al reintentar; hay que corregirlas):')
  flaky.forEach(r => console.log(`  [${r.project}] ${r.file} › ${r.title}`))
}
const failed = rows.filter(r => r.status === 'unexpected')
if (failed.length) {
  console.log('\nFALLAN:')
  failed.forEach(r => console.log(`  [${r.project}] ${r.file} › ${r.title}`))
}

console.log(`\nLas ${top} más lentas:`)
;[...ran].sort((a, b) => b.duration - a.duration).slice(0, top)
  .forEach(r => console.log(`  ${secs(r.duration).padStart(8)}  [${r.project}] ${r.file} › ${r.title}`))

const byFile = new Map()
for (const r of ran) byFile.set(r.file, (byFile.get(r.file) || 0) + r.duration)
console.log('\nTiempo por archivo:')
;[...byFile].sort((a, b) => b[1] - a[1])
  .forEach(([f, ms]) => console.log(`  ${secs(ms).padStart(8)}  ${(ms / total * 100).toFixed(0).padStart(3)} %  ${f}`))
