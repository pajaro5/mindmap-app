// Los scripts de public/js son clásicos y comparten el ámbito global: si dos declaran la
// misma función, la que carga después sustituye a la otra sin ningún error (pasó con
// taskSummary en la Fase 15 y la app dejó de abrir mapas). Esta prueba lo impide.
const fs = require('fs')
const path = require('path')
const { test, expect } = require('@playwright/test')

test('ningún nombre global se declara en dos scripts', () => {
  const dir = path.join(__dirname, '..', '..', 'public', 'js')
  const seen = new Map()
  const duplicates = []
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
    const source = fs.readFileSync(path.join(dir, file), 'utf8')
    // Declaraciones de primer nivel (sin sangría)
    for (const [, name] of source.matchAll(/^(?:async\s+)?(?:function\s*\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) {
      if (seen.has(name) && seen.get(name) !== file) duplicates.push(`${name}: ${seen.get(name)} y ${file}`)
      else seen.set(name, file)
    }
  }
  expect(duplicates).toEqual([])
})
