// Vista Gantt (Vista › Gantt) y calendario laborable.
//
// Las filas son los temas con fecha de inicio o de vencimiento (Información de tarea), en
// orden de lectura y con su sangría; cada una tiene una barra desde el inicio hasta el
// vencimiento (o un rombo si es un hito o solo tiene una fecha y es hito).
// Calendario laborable: con root.data._workweek = true, la duración cuenta solo de lunes a
// viernes (en el panel Información de tarea y en el Gantt) y el Gantt sombrea los fines de semana.

const WORKWEEK_KEY = '_workweek'
const GANTT_DAY_WIDTH = 24
const GANTT_MIN_DAYS = 14

// Día de la semana (0 = domingo) de una fecha AAAA-MM-DD
const weekdayOf = day => new Date(day * 86400000).getUTCDay()

// Días de lunes a viernes entre inicio y vencimiento, ambos incluidos
function workingDaysBetween(start, due) {
  if (!isIsoDate(start) || !isIsoDate(due)) return null
  const from = dayNumber(start)
  const to = dayNumber(due)
  if (to < from) return null
  let count = 0
  for (let d = from; d <= to; d++) {
    const w = weekdayOf(d)
    if (w !== 0 && w !== 6) count++
  }
  return count
}

function taskDuration(start, due, workweek) {
  return workweek ? workingDaysBetween(start, due) : taskDurationDays(start, due)
}

// Estado para colorear la barra: completada, vencida o en curso
function ganttStatus(task, progress, today) {
  if (progress >= 100) return 'done'
  const end = task.due || task.start
  return end && dayNumber(end) < dayNumber(today) ? 'overdue' : 'pending'
}

// Filas del Gantt a partir del árbol de datos (también de las ramas contraídas)
function ganttRows(tree, { today = todayIso(), workweek = false } = {}) {
  const rows = []
  const walk = (node, depth) => {
    if (!node || !node.data) return
    const task = normalizeTask(node.data[TASK_KEY]) || {}
    if (task.start || task.due) {
      const progress = progressOf(node.data.icon)
      rows.push({
        uid: node.data.uid,
        text: topicPlainText(node.data).split('\n')[0] || '(sin texto)',
        depth,
        start: task.start || task.due,
        due: task.due || task.start,
        milestone: !!task.milestone,
        progress,
        duration: taskDuration(task.start || task.due, task.due || task.start, workweek),
        status: ganttStatus(task, progress, today)
      })
    }
    ;(node.children || []).forEach(child => walk(child, depth + 1))
  }
  walk(tree, 0)
  return rows
}

// Días que muestra la escala: un día antes del primer inicio y uno después del último
// vencimiento, y al menos dos semanas
function ganttRange(rows) {
  if (!rows.length) return null
  const from = Math.min(...rows.map(r => dayNumber(r.start))) - 1
  let to = Math.max(...rows.map(r => dayNumber(r.due))) + 1
  if (to - from + 1 < GANTT_MIN_DAYS) to = from + GANTT_MIN_DAYS - 1
  return { from, to, days: to - from + 1 }
}

// Posición de la barra de una fila (en píxeles desde el inicio de la escala)
function ganttBar(row, range) {
  const x = (dayNumber(row.start) - range.from) * GANTT_DAY_WIDTH
  const width = (dayNumber(row.due) - dayNumber(row.start) + 1) * GANTT_DAY_WIDTH
  return { x, width }
}

// Columnas de la escala: [{ day, label (día del mes), month (en el día 1 o el primero), weekend }]
function ganttScale(range) {
  const out = []
  for (let d = range.from; d <= range.to; d++) {
    const date = new Date(d * 86400000)
    const w = date.getUTCDay()
    out.push({
      day: d,
      label: String(date.getUTCDate()),
      month: date.getUTCDate() === 1 || d === range.from
        ? date.toLocaleDateString('es', { month: 'short', year: 'numeric', timeZone: 'UTC' })
        : '',
      weekend: w === 0 || w === 6
    })
  }
  return out
}
