// Plantillas de serie, inspiradas en las de MindManager (mismos propósitos y estructura; el
// contenido está escrito para esta app). Se describen con un pequeño lenguaje (T) y se
// convierten en datos de mapa al crear el mapa, resolviendo las fechas relativas al día de hoy.
//
// T(texto, opciones, hijos). Opciones:
//   note       texto de la nota
//   icon       marcadores de icono (ids de icon-library.js / la librería)
//   tags       marcadores de texto (nombres definidos en `markers` de la plantilla)
//   task       { start, due } en días desde hoy, resources, milestone
//   callout    texto de una llamada
//   collapsed  la rama empieza contraída

const T = (text, opts = {}, children = []) => (Array.isArray(opts) ? { text, children: opts } : { text, ...opts, children })

const ESTADO = { name: 'Estado', color: '#2b6fbd', markers: ['Pendiente', 'En curso', 'Hecho', 'Bloqueado'] }

const TEMPLATE_CATEGORIES = [
  { id: 'meetings', name: 'Reuniones' },
  { id: 'projects', name: 'Proyectos' }
]

const BUILTIN_TEMPLATES = [
  // ---------- Reuniones ----------
  {
    id: 'formal-agenda', category: 'meetings', name: 'Agenda formal',
    description: 'Orden del día con horarios, acuerdos y tareas con responsable y fecha.',
    markers: [ESTADO],
    root: T('Reunión: [tema]', [
      T('Datos', [
        T('Fecha y hora', { task: { due: 7 } }),
        T('Lugar o enlace'),
        T('Convoca'),
        T('Asistentes', { note: 'Una persona por subtema. Marca con el icono de Personas a quien modera.' })
      ]),
      T('Objetivo', { note: 'Qué debe haberse conseguido al terminar la reunión.' }),
      T('Orden del día', [
        T('1. Bienvenida (5 min)'),
        T('2. Acuerdos de la reunión anterior (10 min)'),
        T('3. Tema principal (30 min)'),
        T('4. Varios (10 min)')
      ]),
      T('Acuerdos', { icon: ['symbol_check'] }),
      T('Tareas', { callout: 'Cada tarea con responsable y fecha (panel Info. de tarea).' }, [
        T('Acción 1', { tags: ['Pendiente'], task: { due: 14, resources: ['Responsable'] } })
      ]),
      T('Próxima reunión', { task: { due: 21 } })
    ])
  },
  {
    id: 'meeting', category: 'meetings', name: 'Reunión',
    description: 'Estructura sencilla para preparar, conducir y cerrar cualquier reunión.',
    markers: [ESTADO],
    root: T('Reunión', [
      T('Objetivo'),
      T('Participantes'),
      T('Temas', [T('Tema 1'), T('Tema 2'), T('Tema 3')]),
      T('Notas', { note: 'Usa las notas de cada tema para los detalles.' }),
      T('Decisiones', { icon: ['symbol_check'] }),
      T('Acciones', [T('Acción 1', { tags: ['Pendiente'], task: { due: 7, resources: ['Responsable'] } })]),
      T('Seguimiento')
    ])
  },
  {
    id: 'brainstorming', category: 'meetings', name: 'Lluvia de ideas',
    description: 'Guía para una sesión de ideas: reto, reglas, ideas agrupadas y selección.',
    root: T('Lluvia de ideas: [reto]', [
      T('Pregunta o reto', { icon: ['symbol_question'], note: 'Formúlalo como pregunta: «¿Cómo podríamos…?»' }),
      T('Reglas', { collapsed: true }, [
        T('Cantidad antes que calidad'),
        T('Sin críticas durante la sesión'),
        T('Construir sobre las ideas de otros'),
        T('Una idea por tema')
      ]),
      T('Ideas', { callout: 'Escribe sin filtrar: Enter crea la siguiente idea.' }, [
        T('Grupo A', [T('Idea')]),
        T('Grupo B', [T('Idea')])
      ]),
      T('Ideas destacadas', { icon: ['symbol_star'] }),
      T('Próximos pasos')
    ])
  },
  {
    id: 'decision-making', category: 'meetings', name: 'Toma de decisiones',
    description: 'Compara opciones con criterios explícitos y deja la decisión documentada.',
    root: T('Decisión: [qué hay que decidir]', [
      T('Contexto'),
      T('Criterios', [T('Coste'), T('Impacto'), T('Riesgo'), T('Plazo')]),
      T('Opciones', [
        T('Opción A', [T('Ventajas', { icon: ['arrow_rising'] }), T('Inconvenientes', { icon: ['arrow_falling'] })]),
        T('Opción B', [T('Ventajas', { icon: ['arrow_rising'] }), T('Inconvenientes', { icon: ['arrow_falling'] })]),
        T('Opción C', [T('Ventajas', { icon: ['arrow_rising'] }), T('Inconvenientes', { icon: ['arrow_falling'] })])
      ]),
      T('Evaluación', { note: 'Puntúa cada opción frente a cada criterio; usa los iconos de Prioridad.' }),
      T('Decisión', { icon: ['symbol_check'] }),
      T('Plan de acción', [T('Acción 1', { task: { due: 7, resources: ['Responsable'] } })])
    ])
  },
  {
    id: 'feedback', category: 'meetings', name: 'Reunión de feedback',
    description: 'Recoge qué funciona, qué mejorar y los compromisos que salen de la reunión.',
    root: T('Feedback: [proyecto o persona]', [
      T('Contexto'),
      T('Lo que funciona', { icon: ['face_happy'] }),
      T('Lo que se puede mejorar', { icon: ['face_confused'] }),
      T('Ideas y propuestas', { icon: ['symbol_idea'] }),
      T('Compromisos', [T('Compromiso 1', { task: { due: 14, resources: ['Responsable'] } })])
    ])
  },
  {
    id: 'informational', category: 'meetings', name: 'Reunión informativa',
    description: 'Para presentar información: mensaje clave, puntos principales y preguntas.',
    root: T('Presentación: [tema]', [
      T('Mensaje clave', { icon: ['symbol_star'], note: 'Si el público solo recuerda una cosa, que sea esta.' }),
      T('Contexto'),
      T('Puntos principales', [T('Punto 1'), T('Punto 2'), T('Punto 3')]),
      T('Preguntas', { icon: ['symbol_question'] }),
      T('Materiales', { icon: ['symbol_document'] }),
      T('Próximos pasos')
    ])
  },
  {
    id: 'pre-meeting', category: 'meetings', name: 'Preparación de reunión',
    description: 'Investigación previa: objetivos, interesados, información y preguntas.',
    root: T('Preparar: [reunión]', [
      T('Objetivo de la reunión'),
      T('Interesados', { icon: ['people_team'] }, [T('Persona'), T('Qué espera de la reunión')]),
      T('Información necesaria', { icon: ['symbol_search'] }),
      T('Preguntas a resolver', { icon: ['symbol_question'] }),
      T('Posibles objeciones', { icon: ['symbol_warning'] }),
      T('Preparativos', [
        T('Enviar convocatoria', { task: { due: 1 } }),
        T('Preparar documentación', { task: { due: 3 } }),
        T('Reunión', { task: { due: 5, milestone: true } })
      ])
    ])
  },
  {
    id: 'problem-solving-meeting', category: 'meetings', name: 'Resolución de problemas',
    description: 'Del problema a la solución: síntomas, causas, alternativas y plan.',
    root: T('Problema: [descripción breve]', [
      T('Definición del problema', { note: 'Qué pasa, dónde, desde cuándo y a quién afecta.' }),
      T('Síntomas'),
      T('Causas posibles', [T('Causa 1'), T('Causa 2')]),
      T('Causa raíz', { icon: ['symbol_target'] }),
      T('Soluciones posibles', [T('Solución 1'), T('Solución 2')]),
      T('Solución elegida', { icon: ['symbol_check'] }),
      T('Plan de acción', [T('Acción 1', { task: { due: 7, resources: ['Responsable'] } })])
    ])
  },
  {
    id: 'stand-up', category: 'meetings', name: 'Reunión diaria',
    description: 'Stand-up del equipo: qué hizo cada uno, qué hará y qué le bloquea.',
    root: T('Reunión diaria', [
      T('Fecha', { task: { start: 0 } }),
      T('Persona 1', [T('Ayer'), T('Hoy'), T('Bloqueos', { icon: ['symbol_stop'] })]),
      T('Persona 2', [T('Ayer'), T('Hoy'), T('Bloqueos', { icon: ['symbol_stop'] })]),
      T('Bloqueos del equipo', { icon: ['traffic_red'] }),
      T('Acuerdos')
    ])
  },
  {
    id: 'work-session', category: 'meetings', name: 'Sesión de trabajo',
    description: 'Notas de una sesión de trabajo en equipo: objetivo, actividades y resultados.',
    markers: [ESTADO],
    root: T('Sesión de trabajo: [tema]', [
      T('Objetivo de la sesión'),
      T('Punto de partida'),
      T('Actividades', [T('Actividad 1', { tags: ['Pendiente'] }), T('Actividad 2', { tags: ['Pendiente'] })]),
      T('Resultados', { icon: ['symbol_check'] }),
      T('Pendientes'),
      T('Próxima sesión', { task: { due: 7 } })
    ])
  },

  // ---------- Proyectos ----------
  {
    id: 'project-plan', category: 'projects', name: 'Plan de proyecto',
    description: 'Objetivos, alcance, fases con tareas y fechas, equipo, riesgos y presupuesto.',
    markers: [ESTADO],
    root: T('Proyecto: [nombre]', [
      T('Objetivos', { icon: ['symbol_target'] }, [T('Objetivo 1'), T('Objetivo 2')]),
      T('Alcance', [T('Incluye'), T('No incluye')]),
      T('Fases', { callout: 'Las fechas se calculan desde hoy: ajústalas en Info. de tarea.' }, [
        T('Inicio', { task: { start: 0, due: 7 } }, [
          T('Acta de constitución', { tags: ['Pendiente'], task: { start: 0, due: 3, resources: ['Jefe de proyecto'] } }),
          T('Reunión de arranque', { task: { due: 7, milestone: true } })
        ]),
        T('Planificación', { task: { start: 7, due: 21 } }, [
          T('Plan detallado', { tags: ['Pendiente'], task: { start: 7, due: 17 } }),
          T('Plan aprobado', { task: { due: 21, milestone: true } })
        ]),
        T('Ejecución', { task: { start: 21, due: 60 } }, [
          T('Entregable 1', { tags: ['Pendiente'], task: { start: 21, due: 40 } }),
          T('Entregable 2', { tags: ['Pendiente'], task: { start: 35, due: 60 } })
        ]),
        T('Cierre', { task: { start: 60, due: 70 } }, [
          T('Lecciones aprendidas', { tags: ['Pendiente'], task: { start: 60, due: 67 } }),
          T('Entrega final', { task: { due: 70, milestone: true } })
        ])
      ]),
      T('Equipo', { icon: ['people_team'] }, [T('Patrocinador'), T('Jefe de proyecto', { icon: ['people_owner'] }), T('Equipo')]),
      T('Riesgos', { icon: ['symbol_warning'] }),
      T('Presupuesto', { icon: ['symbol_money'] }),
      T('Comunicación')
    ])
  },
  {
    id: 'project-charter', category: 'projects', name: 'Acta de constitución',
    description: 'Documento de arranque: propósito, objetivos, entregables, hitos y aprobación.',
    root: T('Acta: [proyecto]', [
      T('Propósito y justificación'),
      T('Objetivos', { note: 'Específicos, medibles, alcanzables, relevantes y con fecha.' }),
      T('Requisitos principales'),
      T('Entregables', { icon: ['symbol_document'] }),
      T('Hitos', [
        T('Arranque', { task: { due: 7, milestone: true } }),
        T('Entrega intermedia', { task: { due: 35, milestone: true } }),
        T('Entrega final', { task: { due: 70, milestone: true } })
      ]),
      T('Supuestos y restricciones'),
      T('Riesgos iniciales', { icon: ['symbol_warning'] }),
      T('Presupuesto', { icon: ['symbol_money'] }),
      T('Interesados', { icon: ['people_team'] }),
      T('Aprobación', { icon: ['symbol_check'], task: { due: 7, resources: ['Patrocinador'] } })
    ])
  },
  {
    id: 'project-control', category: 'projects', name: 'Control de proyecto',
    description: 'Seguimiento de plazos, costes, alcance, calidad, riesgos y acciones correctivas.',
    root: T('Control: [proyecto]', [
      T('Calendario', [T('Próximos hitos'), T('Retrasos', { icon: ['traffic_amber'] })]),
      T('Costes', { icon: ['symbol_money'] }, [T('Previsto'), T('Real'), T('Desviación')]),
      T('Alcance', [T('Cambios solicitados'), T('Cambios aprobados')]),
      T('Calidad'),
      T('Riesgos e incidencias', { icon: ['symbol_warning'] }),
      T('Recursos', { icon: ['people_team'] }),
      T('Acciones correctivas', [T('Acción 1', { task: { due: 7, resources: ['Responsable'] } })])
    ])
  },
  {
    id: 'project-dashboard', category: 'projects', name: 'Panel de proyecto',
    description: 'Todo el proyecto de un vistazo: estado, hitos, tareas, riesgos y equipo.',
    markers: [ESTADO],
    root: T('Panel: [proyecto]', [
      T('Estado general', { icon: ['traffic_green'], callout: 'Cambia el semáforo según el estado del proyecto.' }),
      T('Hitos', [T('Próximo hito', { task: { due: 14, milestone: true } })]),
      T('Tareas', [
        T('En curso', { tags: ['En curso'] }),
        T('Bloqueadas', { tags: ['Bloqueado'], icon: ['symbol_stop'] }),
        T('Hechas', { tags: ['Hecho'], icon: ['progress_8'] })
      ]),
      T('Riesgos', { icon: ['symbol_warning'] }),
      T('Presupuesto', { icon: ['symbol_money'] }),
      T('Equipo', { icon: ['people_team'] }),
      T('Documentos', { icon: ['symbol_document'] })
    ])
  },
  {
    id: 'project-status', category: 'projects', name: 'Informe de estado',
    description: 'Informe periódico: estado, logros, próximos pasos, riesgos y decisiones.',
    root: T('Estado: [proyecto]', [
      T('Periodo', { task: { start: -7, due: 0 } }),
      T('Estado general', { icon: ['traffic_green'] }),
      T('Logros del periodo', { icon: ['symbol_check'] }),
      T('Próximos pasos', [T('Paso 1', { task: { due: 7 } })]),
      T('Riesgos e incidencias', { icon: ['symbol_warning'] }),
      T('Decisiones necesarias', { icon: ['symbol_question'] }),
      T('Indicadores')
    ])
  },
  {
    id: 'task-list', category: 'projects', name: 'Lista de tareas',
    description: 'Lista sencilla con estado y progreso; lo completado se pinta en verde.',
    markers: [ESTADO],
    layout: 'logicalStructure',
    root: T('Tareas', { callout: 'Marca el progreso en Info. de tarea: al 100 % la tarea se pinta en verde.' }, [
      T('Tarea 1', { tags: ['Pendiente'], icon: ['priority_1'], task: { due: 2 } }),
      T('Tarea 2', { tags: ['Pendiente'], icon: ['priority_2'], task: { due: 5 } }),
      T('Tarea 3', { tags: ['Pendiente'], task: { due: 7 } }),
      T('Tarea 4', { tags: ['Pendiente'] }),
      T('Tarea 5', { tags: ['Pendiente'] })
    ])
  },
  {
    id: 'event-basic', category: 'projects', name: 'Plan de evento (básico)',
    description: 'Lo esencial para organizar un evento: fecha, invitados, presupuesto y logística.',
    markers: [ESTADO],
    root: T('Evento: [nombre]', [
      T('Objetivo'),
      T('Fecha y lugar', { task: { due: 30, milestone: true } }),
      T('Invitados', { icon: ['people_team'] }),
      T('Presupuesto', { icon: ['symbol_money'] }),
      T('Logística', [T('Comida y bebida', { tags: ['Pendiente'] }), T('Material', { tags: ['Pendiente'] }), T('Transporte', { tags: ['Pendiente'] })]),
      T('Comunicación', [T('Invitaciones', { tags: ['Pendiente'], task: { due: 10 } })]),
      T('Después del evento', [T('Agradecimientos', { task: { due: 33 } })])
    ])
  },
  {
    id: 'event-full', category: 'projects', name: 'Plan de evento (completo)',
    description: 'Planificación detallada: proveedores, programa, comunicación y contingencias.',
    markers: [ESTADO],
    root: T('Evento: [nombre]', [
      T('Concepto', [T('Objetivo'), T('Público'), T('Formato')]),
      T('Fecha y lugar', [T('Opción principal', { task: { due: 60, milestone: true } }), T('Alternativa')]),
      T('Presupuesto', { icon: ['symbol_money'] }, [T('Ingresos'), T('Gastos')]),
      T('Equipo', { icon: ['people_team'] }, [T('Coordinación', { icon: ['people_owner'] }), T('Logística'), T('Comunicación')]),
      T('Proveedores', [
        T('Catering', { tags: ['Pendiente'], task: { due: 30 } }),
        T('Audiovisuales', { tags: ['Pendiente'], task: { due: 30 } }),
        T('Decoración', { tags: ['Pendiente'], task: { due: 40 } }),
        T('Seguridad', { tags: ['Pendiente'], task: { due: 40 } })
      ]),
      T('Programa', [T('Apertura'), T('Ponencias'), T('Pausa'), T('Cierre')]),
      T('Comunicación', [
        T('Invitaciones', { tags: ['Pendiente'], task: { due: 20 } }),
        T('Redes sociales', { tags: ['Pendiente'], task: { start: 20, due: 60 } }),
        T('Prensa', { tags: ['Pendiente'], task: { due: 50 } })
      ]),
      T('Inscripciones', { task: { start: 20, due: 55 } }),
      T('Plan B', { icon: ['symbol_warning'], note: 'Qué hacer si falla el lugar, un proveedor o el tiempo.' }),
      T('Evaluación posterior', { task: { due: 67 } })
    ])
  },
  {
    id: 'risk-management', category: 'projects', name: 'Gestión de riesgos',
    description: 'Identifica, evalúa y responde a los riesgos, con responsable y seguimiento.',
    root: T('Riesgos: [proyecto]', [
      T('Riesgos identificados', { callout: 'Prioridad 1 = riesgo alto. Filtra por prioridad en Vista › Filtro.' }, [
        T('Riesgo 1', { icon: ['priority_1'] }, [
          T('Probabilidad'), T('Impacto'), T('Respuesta'),
          T('Seguimiento', { task: { due: 14, resources: ['Responsable'] } })
        ]),
        T('Riesgo 2', { icon: ['priority_2'] }, [T('Probabilidad'), T('Impacto'), T('Respuesta')]),
        T('Riesgo 3', { icon: ['priority_3'] }, [T('Probabilidad'), T('Impacto'), T('Respuesta')])
      ]),
      T('Categorías', { collapsed: true }, [T('Técnicos'), T('Económicos'), T('Personas'), T('Externos')]),
      T('Tipos de respuesta', { collapsed: true }, [T('Evitar'), T('Reducir'), T('Transferir'), T('Aceptar')]),
      T('Revisión periódica', { task: { due: 30 } })
    ])
  }
]

// ---- De plantilla a mapa ----
function addDaysIso(baseIso, days) {
  const date = new Date(dayNumber(baseIso) * 86400000 + Math.round(days) * 86400000)
  return date.toISOString().slice(0, 10)
}

// Convierte una plantilla de serie en datos de mapa, con las fechas a partir de `today`
function instantiateTemplate(template, today = todayIso()) {
  const defs = normalizeMarkerDefs(template.markers || [])
  const build = (node, isRoot) => {
    const data = { text: node.text, expand: !node.collapsed }
    if (isRoot && defs.length) data[TEXT_MARKERS_KEY] = defs
    if (node.note) data.note = node.note
    if (node.icon) data.icon = [...node.icon]
    if (node.tags) data.tag = node.tags.map(name => tagFor(defs, name))
    if (node.task) {
      const t = node.task
      const task = normalizeTask({
        start: t.start !== undefined ? addDaysIso(today, t.start) : undefined,
        due: t.due !== undefined ? addDaysIso(today, t.due) : undefined,
        milestone: t.milestone === true,
        resources: t.resources
      })
      if (task) data[TASK_KEY] = task
    }
    if (node.callout) data[CALLOUTS_KEY] = [{ id: createUid(), text: node.callout, dx: 24, dy: -14 }]
    return { data, children: (node.children || []).map(child => build(child, false)) }
  }
  return {
    layout: template.layout || 'mindMap',
    root: build(template.root, true),
    theme: { template: THEME_NAME, config: {} },
    view: {}
  }
}

// Una plantilla guardada por el usuario: el mapa tal cual, sin la vista ni la selección
function mapDataFromSavedTemplate(saved) {
  const data = JSON.parse(JSON.stringify(saved.data))
  delete data.view
  return { ...data, view: {} }
}

// "Guardar como plantilla": copia del mapa; opcionalmente sin fechas ni recursos
function templateDataFromMap(mapData, { stripTasks = false } = {}) {
  const data = JSON.parse(JSON.stringify(mapData))
  delete data.view
  const walk = node => {
    if (!node || !node.data) return
    delete node.data.isActive
    delete node.data.attachmentUrl
    delete node.data.attachmentName
    if (stripTasks) delete node.data[TASK_KEY]
    ;(node.children || []).forEach(walk)
  }
  walk(data.root)
  return data
}

// ---- Vista previa esquemática (SVG) ----
// Tema central y, a su alrededor, una píldora por tema principal (no se dibuja el texto)
function templatePreviewSvg(tree, layout = 'mindMap') {
  const W = 168
  const H = 96
  const children = (tree.children || []).slice(0, 8)
  const root = { x: layout === 'mindMap' ? W / 2 : 30, y: H / 2 }
  const parts = []
  const side = (i, n) => layout === 'mindMap' ? (i < Math.ceil(n / 2) ? 1 : -1) : 1
  const slots = { 1: [], '-1': [] }
  children.forEach((c, i) => slots[side(i, children.length)].push(c))
  for (const dir of [1, -1]) {
    const list = slots[dir]
    list.forEach((c, i) => {
      const y = H * (i + 1) / (list.length + 1)
      const x = dir === 1 ? (layout === 'mindMap' ? W - 34 : 104) : 34
      parts.push(`<path d="M${root.x} ${root.y}C${(root.x + x) / 2} ${root.y} ${(root.x + x) / 2} ${y} ${x} ${y}" fill="none" stroke="#b9b9b9" stroke-width="1.5"/>`)
      parts.push(`<rect x="${x - 16}" y="${y - 5}" width="32" height="10" rx="3" fill="#7dc142"/>`)
    })
  }
  parts.push(`<rect x="${root.x - 22}" y="${root.y - 9}" width="44" height="18" rx="5" fill="#3d8fd8"/>`)
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${parts.join('')}</svg>`
}

// Árbol de un mapa guardado con la forma que usa la vista previa ({ children })
function toPreviewTree(root) {
  return { children: ((root && root.children) || []).map(c => ({ children: c.children || [] })) }
}

// Número de temas (para mostrarlo en la galería)
function countTopics(tree) {
  return 1 + (tree.children || []).reduce((n, c) => n + countTopics(c), 0)
}
