// Generador de combinaciones pairwise (t=2) para las pruebas: cada par de valores de dos
// parámetros cualesquiera aparece en al menos una combinación. Algoritmo voraz tipo AETG,
// sin dependencias y con semilla fija (las mismas combinaciones en cada ejecución).
//
//   const combos = pairwise({ theme: [...], layout: [...], shadow: [null, true, false] })
//   // → [{ theme, layout, shadow }, ...]

// Generador pseudoaleatorio reproducible (mulberry32)
function seededRandom(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pairKey = (i, a, j, b) => i < j ? `${i}:${a}|${j}:${b}` : `${j}:${b}|${i}:${a}`

// Todos los pares de valores (por índice) que hay que cubrir
function allPairs(sizes) {
  const pairs = new Set()
  for (let i = 0; i < sizes.length; i++) {
    for (let j = i + 1; j < sizes.length; j++) {
      for (let a = 0; a < sizes[i]; a++) for (let b = 0; b < sizes[j]; b++) pairs.add(pairKey(i, a, j, b))
    }
  }
  return pairs
}

// Pares nuevos (aún sin cubrir) que aportaría poner el valor `v` en el parámetro `p`
function gain(row, p, v, uncovered) {
  let n = 0
  row.forEach((value, q) => {
    if (q !== p && value !== undefined && uncovered.has(pairKey(p, v, q, value))) n++
  })
  return n
}

function pairwise(params, { seed = 2026, candidates = 40 } = {}) {
  const names = Object.keys(params)
  const values = names.map(n => params[n])
  values.forEach((v, i) => { if (!Array.isArray(v) || !v.length) throw new Error(`pairwise: "${names[i]}" sin valores`) })
  const sizes = values.map(v => v.length)
  const random = seededRandom(seed)
  const uncovered = allPairs(sizes)
  const rows = []

  while (uncovered.size) {
    let best = null
    let bestGain = -1
    for (let c = 0; c < candidates; c++) {
      // Se parte de un par sin cubrir y el resto de parámetros se rellena en orden aleatorio
      // con el valor que más pares nuevos cubre
      const [first] = uncovered
      const [[i, a], [j, b]] = first.split('|').map(s => s.split(':').map(Number))
      const row = new Array(sizes.length)
      row[i] = a
      row[j] = b
      const order = sizes.map((_, k) => k).filter(k => k !== i && k !== j).sort(() => random() - 0.5)
      for (const p of order) {
        let bestValue = 0
        let bestValueGain = -1
        const start = Math.floor(random() * sizes[p])
        for (let k = 0; k < sizes[p]; k++) {
          const v = (start + k) % sizes[p]
          const g = gain(row, p, v, uncovered)
          if (g > bestValueGain) { bestValueGain = g; bestValue = v }
        }
        row[p] = bestValue
      }
      let total = 0
      for (let p = 0; p < row.length; p++) for (let q = p + 1; q < row.length; q++) if (uncovered.has(pairKey(p, row[p], q, row[q]))) total++
      if (total > bestGain) { bestGain = total; best = row }
    }
    for (let p = 0; p < best.length; p++) for (let q = p + 1; q < best.length; q++) uncovered.delete(pairKey(p, best[p], q, best[q]))
    rows.push(best)
  }
  return rows.map(row => Object.fromEntries(names.map((n, k) => [n, values[k][row[k]]])))
}

// Pares de valores que NO cubren unas combinaciones (vacío = cobertura t=2 completa)
function missingPairs(params, combos) {
  const names = Object.keys(params)
  const missing = []
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      for (const a of params[names[i]]) {
        for (const b of params[names[j]]) {
          const found = combos.some(c => Object.is(c[names[i]], a) && Object.is(c[names[j]], b))
          if (!found) missing.push(`${names[i]}=${JSON.stringify(a)} × ${names[j]}=${JSON.stringify(b)}`)
        }
      }
    }
  }
  return missing
}

// Reparte las combinaciones en `n` bloques (para varias pruebas en paralelo)
function chunk(list, n) {
  const size = Math.ceil(list.length / n)
  return Array.from({ length: n }, (_, k) => list.slice(k * size, (k + 1) * size)).filter(c => c.length)
}

module.exports = { pairwise, missingPairs, chunk }
