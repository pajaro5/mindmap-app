// Regresión selectiva: pruebas unitarias + e2e de lo que cambió + batería de humo.
//
//   node scripts/test-changed.js                 cambios sin commit (y archivos nuevos)
//   node scripts/test-changed.js --since main~3  cambios desde una referencia de git
//   node scripts/test-changed.js --dry-run       solo muestra qué se ejecutaría
//   Opciones extra para Playwright tras "--":     node scripts/test-changed.js -- --project=chromium
//
// Usa tests/impact-map.js. Un archivo que no aparezca en el mapa provoca la suite completa
// (más vale de más que de menos).
const { execSync, spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const { QUARANTINE, QUARANTINE_MODULES, SMOKE, FULL, IMPACT } = require('../tests/impact-map')

const ROOT = path.join(__dirname, '..')
const args = process.argv.slice(2)
const dash = args.indexOf('--')
const extra = dash >= 0 ? args.slice(dash + 1) : []
const own = dash >= 0 ? args.slice(0, dash) : args
const since = own.includes('--since') ? own[own.indexOf('--since') + 1] : null
const dryRun = own.includes('--dry-run')

const git = cmd => execSync(`git ${cmd}`, { cwd: ROOT, encoding: 'utf8' }).split('\n').map(s => s.trim()).filter(Boolean)
const changed = since
  ? git(`diff --name-only ${since}`)
  : [...git('diff --name-only HEAD'), ...git('ls-files --others --exclude-standard')]

const specsOf = name => ['', '.pairwise']
  .map(suffix => `tests/e2e/${name}${suffix}.spec.js`)
  .filter(f => fs.existsSync(path.join(ROOT, f)))

const plan = { full: false, reasons: [], specs: new Set(SMOKE.flatMap(specsOf)) }
for (const file of new Set(changed)) {
  if (FULL.some(p => file.startsWith(p))) {
    plan.full = true
    plan.reasons.push(`${file} afecta a todas las pruebas`)
    continue
  }
  const spec = file.match(/^tests\/e2e\/(.+?)(\.pairwise)?\.spec\.js$/)
  // Lo que está en cuarentena no se ejecuta
  if ((spec && QUARANTINE.includes(spec[1])) || QUARANTINE_MODULES.includes(file)) continue
  if (spec) {
    specsOf(spec[1]).forEach(s => plan.specs.add(s))
    continue
  }
  const key = Object.keys(IMPACT).filter(p => file.startsWith(p)).sort((a, b) => b.length - a.length)[0]
  if (key === undefined) {
    plan.full = true
    plan.reasons.push(`${file} no está en tests/impact-map.js`)
    continue
  }
  IMPACT[key].flatMap(specsOf).forEach(s => plan.specs.add(s))
}

console.log(`Cambios: ${changed.length ? changed.join(', ') : '(ninguno)'}`)
if (plan.full) console.log(`Suite e2e COMPLETA: ${plan.reasons.join('; ')}`)
else console.log(`E2E (${plan.specs.size} archivos): ${[...plan.specs].map(s => path.basename(s, '.spec.js')).join(', ')}`)
if (dryRun) process.exit(0)

const run = (cmd, cmdArgs) => spawnSync(cmd, cmdArgs, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' }).status
const unit = run('node', ['--test', 'tests/unit/*.test.js'])
if (unit !== 0) {
  console.error('Fallan las pruebas unitarias: no se lanzan las e2e.')
  process.exit(unit)
}
process.exit(run('npx', ['playwright', 'test', ...(plan.full ? [] : [...plan.specs]), ...extra]))
