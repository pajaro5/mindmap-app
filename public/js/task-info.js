// Información de tarea (como el panel "Task Info" de MindManager).
//
// Modelo:
//   - Prioridad y % completado NO se guardan aparte: son los marcadores de icono
//     priority_N y progress_N (igual que en MindManager), así hay una sola fuente de verdad.
//   - El resto va en node.data._task = { start, due, milestone, resources }
//       start, due   fechas 'AAAA-MM-DD' (sin hora ni zona horaria)
//       milestone    true si es un hito
//       resources    nombres de las personas asignadas
//     Con "_" delante: simple-mind-map trata como estilo cualquier campo que no conozca
//     (ver markers.js).
//   - En el lienzo se pinta una etiqueta a la derecha del texto con fechas, hito y recursos
//     (extensión nodeInnerPostfixList de la librería), en rojo si está vencida.

const TASK_KEY = '_task'
const TASK_MAX_RESOURCES = 20
const PROGRESS_STEPS = 8   // la librería tiene progress_1 … progress_8 (8 = completado)
const PRIORITY_MAX = 9

const isIsoDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}
const dayNumber = iso => Date.UTC(...iso.split('-').map((n, i) => Number(n) - (i === 1 ? 1 : 0))) / 86400000

// Fecha local de hoy en formato AAAA-MM-DD
function todayIso(now = new Date()) {
  const pad = n => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

// Días naturales entre inicio y vencimiento, ambos incluidos
function taskDurationDays(start, due) {
  if (!isIsoDate(start) || !isIsoDate(due)) return null
  const days = dayNumber(due) - dayNumber(start) + 1
  return days > 0 ? days : null
}

// Datos de tarea limpios, o undefined si no queda nada (para no guardar objetos vacíos)
function normalizeTask(task) {
  if (!task || typeof task !== 'object' || Array.isArray(task)) return undefined
  const result = {}
  if (isIsoDate(task.start)) result.start = task.start
  if (isIsoDate(task.due)) result.due = task.due
  if (task.milestone === true) result.milestone = true
  const seen = new Set()
  const resources = (Array.isArray(task.resources) ? task.resources : [])
    .map(cleanName)
    .filter(name => name && !seen.has(markerKey(name)) && seen.add(markerKey(name)))
    .slice(0, TASK_MAX_RESOURCES)
  if (resources.length) result.resources = resources
  return Object.keys(result).length ? result : undefined
}

// Valida un cambio antes de aplicarlo. Devuelve un mensaje de error o ''
function validateTask(task) {
  if (task.start && task.due && dayNumber(task.due) < dayNumber(task.start)) {
    return 'La fecha de vencimiento no puede ser anterior a la de inicio.'
  }
  return ''
}

// ---- Prioridad y % completado (marcadores de icono) ----
function priorityOf(icons) {
  const id = (icons || []).find(i => iconGroupOf(i) === 'priority')
  const n = id ? Number(id.split('_')[1]) : 0
  return n >= 1 && n <= PRIORITY_MAX ? n : 0
}

function progressOf(icons) {
  const id = (icons || []).find(i => iconGroupOf(i) === 'progress')
  const n = id ? Number(id.split('_')[1]) : 0
  return n >= 1 && n <= PROGRESS_STEPS ? Math.round(n * 100 / PROGRESS_STEPS) : 0
}

// 0 quita el icono; el resto se redondea al paso más cercano (12,5 %)
function withPriority(icons, priority) {
  const list = (icons || []).filter(i => iconGroupOf(i) !== 'priority')
  return priority >= 1 && priority <= PRIORITY_MAX ? toggleIconList(list, `priority_${priority}`, true) : list
}

function withProgress(icons, percent) {
  const list = (icons || []).filter(i => iconGroupOf(i) !== 'progress')
  const step = Math.round(Math.min(100, Math.max(0, Number(percent) || 0)) * PROGRESS_STEPS / 100)
  return step >= 1 ? toggleIconList(list, `progress_${step}`, true) : list
}

// Opciones del selector de % completado: cuartos, como MindManager, más el valor actual si
// viene de un icono intermedio (p. ej. 38 %)
function progressOptions(current) {
  const values = [0, 25, 50, 75, 100]
  if (current && !values.includes(current)) values.push(current)
  return values.sort((a, b) => a - b).map(v => ({ value: v, label: `${v} %` }))
}

// ---- Resumen que se pinta en el tema ----
const DATE_FORMAT = typeof Intl !== 'undefined'
  ? new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  : null

function formatTaskDate(iso) {
  if (!isIsoDate(iso)) return ''
  const date = new Date(dayNumber(iso) * 86400000)
  return DATE_FORMAT ? DATE_FORMAT.format(date).replace('.', '') : iso
}

// { text, state } o null si no hay nada que mostrar. state: 'normal' | 'overdue' | 'done'
function taskSummary(task, { progress = 0, today = todayIso() } = {}) {
  const t = normalizeTask(task)
  if (!t) return null
  const parts = []
  const dates = t.start && t.due && t.start !== t.due
    ? `${formatTaskDate(t.start)} → ${formatTaskDate(t.due)}`
    : t.due ? `Vence ${formatTaskDate(t.due)}`
      : t.start ? `Inicio ${formatTaskDate(t.start)}` : ''
  if (dates) parts.push(dates)
  if (t.resources) parts.push(t.resources.join(', '))
  const text = (t.milestone ? '◆ ' : '') + (parts.join(' · ') || 'Hito')
  const state = progress >= 100 ? 'done'
    : t.due && dayNumber(t.due) < dayNumber(today) ? 'overdue' : 'normal'
  return { text, state }
}

const TASK_STYLES = {
  normal: { fill: '#eef4fb', stroke: '#9ab7d8', color: '#1d4f8a' },
  overdue: { fill: '#fdecea', stroke: '#e0a19b', color: '#b3261e' },
  done: { fill: '#edf7ed', stroke: '#9cc79c', color: '#2b6a2b' }
}

// Contenido para nodeInnerPostfixList: { node, width, height } o null.
// El texto se crea con SVG.js .text() (nodo de texto, nunca HTML).
function createTaskContent(node) {
  const summary = taskSummary(node.getData(TASK_KEY), { progress: progressOf(node.getData('icon')) })
  if (!summary) return null
  const style = TASK_STYLES[summary.state]
  const draw = node.mindMap.draw
  const g = draw.group().addClass('smm-task-info').attr('data-state', summary.state)
  const text = g.text(summary.text).font({ size: 11, family: 'Segoe UI, Tahoma, Arial, sans-serif' }).fill(style.color)
  const box = text.bbox()
  const padX = 6
  const height = Math.max(18, Math.ceil(box.height) + 4)
  const width = Math.ceil(box.width) + padX * 2
  const rect = g.rect(width, height).radius(3).fill(style.fill).stroke({ color: style.stroke, width: 1 })
  rect.back()
  text.x(padX).cy(height / 2)
  g.remove()
  return { node: g, width, height }
}

// Se registra como plugin para que la extensión exista antes del primer render
class TaskInfoPlugin {
  constructor({ mindMap }) {
    this.mindMap = mindMap
    mindMap.nodeInnerPostfixList.push({ name: 'taskInfo', createContent: createTaskContent })
  }
  beforePluginRemove() {}
  beforePluginDestroy() {}
}
TaskInfoPlugin.instanceName = 'taskInfo'

// Recursos usados en el mapa (para sugerirlos al escribir)
function resourcesInTree(root) {
  const found = new Map()
  const walk = n => {
    if (!n) return
    const task = n.data && n.data[TASK_KEY]
    ;((task && task.resources) || []).forEach(r => {
      if (typeof r === 'string' && !found.has(markerKey(r))) found.set(markerKey(r), r)
    })
    ;(n.children || []).forEach(walk)
  }
  walk(root)
  return [...found.values()].sort((a, b) => a.localeCompare(b))
}
