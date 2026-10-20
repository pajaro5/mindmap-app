// Fase 25 · Pruebas pairwise (t=2) del Gantt: día de la semana de inicio × duración ×
// progreso × hito × calendario laborable × posición respecto a hoy. El oráculo (duración,
// estado y anchura de la barra) está escrito aquí a mano.
const { test, expect, setupMap, SAMPLE_TREE } = require('./fixtures')
const { pairwise, missingPairs } = require('./pairwise')

const PARAMS = {
  weekday: [1, 2, 3, 4, 5, 6, 0], // día de la semana del inicio (0 = domingo)
  length: [1, 3, 8, 15],          // días naturales
  progress: [0, 50, 100],
  milestone: [false, true],
  workweek: [false, true],
  when: ['past', 'now', 'future']
}
const COMBOS = pairwise(PARAMS)
const DAY = 24

const pad = v => String(v).padStart(2, '0')
const iso = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
const today = () => { const n = new Date(); return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())) }

// Fechas de inicio y fin que cumplen la combinación
function datesFor(c) {
  const base = today()
  // past: termina hace más de una semana; now: empieza hoy o antes y termina después de hoy; future: empieza en 20 días
  const anchor = new Date(base)
  if (c.when === 'past') anchor.setUTCDate(anchor.getUTCDate() - 30)
  if (c.when === 'now') anchor.setUTCDate(anchor.getUTCDate() - 1)
  if (c.when === 'future') anchor.setUTCDate(anchor.getUTCDate() + 20)
  while (anchor.getUTCDay() !== c.weekday) anchor.setUTCDate(anchor.getUTCDate() + (c.when === 'now' ? -1 : 1))
  const end = new Date(anchor)
  end.setUTCDate(end.getUTCDate() + c.length - 1)
  if (c.when === 'now' && end < base) end.setTime(base.getTime()) // al menos hasta hoy
  return { start: iso(anchor), due: iso(end), days: Math.round((end - anchor) / 86400000) + 1 }
}

function workingDays(start, days) {
  let n = 0
  const d = new Date(`${start}T00:00:00Z`)
  for (let i = 0; i < days; i++) {
    const w = d.getUTCDay()
    if (w !== 0 && w !== 6) n++
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return n
}

test('el generador cubre todos los pares', () => {
  expect(missingPairs(PARAMS, COMBOS)).toEqual([])
  expect(COMBOS.length).toBeLessThanOrEqual(36) // mínimo 28 (7 × 4); exhaustivo 1008
})

test.describe('pairwise: Gantt y calendario laborable', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'la combinatoria se prueba en Chromium; los escenarios, en los dos navegadores')

  test(`${COMBOS.length} combinaciones`, async ({ page, maps }) => {
    test.setTimeout(180000)
    const { app } = await setupMap(page, maps, { data: JSON.parse(JSON.stringify(SAMPLE_TREE)) })
    await app.clickRibbon('view', 'view.gantt')
    for (const c of COMBOS) {
      const { start, due, days } = datesFor(c)
      await page.evaluate(({ start, due, c }) => {
        const d = window.Alpine.$data(document.body)
        const mm = Alpine.raw(d.mindMap)
        const beta = mm.renderer.root.children[1]
        const icons = c.progress ? [`progress_${c.progress / 12.5}`] : []
        mm.renderer.setNodeDataRender(beta, { _task: { start, due, ...(c.milestone ? { milestone: true } : {}) }, icon: icons })
        mm.renderer.setNodeData(mm.renderer.root, { _workweek: c.workweek || undefined })
        mm.render()
      }, { start, due, c })
      const duration = c.workweek ? workingDays(start, days) : days
      const status = c.progress >= 100 ? 'done' : (c.when === 'past' ? 'overdue' : 'pending')
      const want = { text: `${duration} d`, width: days * DAY, status, milestone: c.milestone }
      await expect.poll(() => page.evaluate(() => {
        const row = document.querySelector('.gantt .gantt-row')
        const bar = document.querySelector('.gantt .gantt-bar')
        if (!row || !bar) return null
        return {
          text: row.querySelector('.gantt-duration').textContent.trim(),
          width: parseFloat(bar.style.width),
          status: ['done', 'overdue', 'pending'].find(s => bar.classList.contains(`gantt-${s}`)),
          milestone: bar.classList.contains('gantt-milestone')
        }
      }), { message: `${JSON.stringify(c)} ${start}→${due}` }).toEqual(want)
    }
  })
})
