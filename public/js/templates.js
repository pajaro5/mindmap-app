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
  { id: 'projects', name: 'Proyectos' },
  { id: 'strategy', name: 'Estrategia y análisis' },
  { id: 'personal', name: 'Personal' },
  { id: 'layouts', name: 'Organigramas, cronologías y causa-efecto' },
  { id: 'diagrams', name: 'Diagramas' }
]

// Matriz 2×2 con ejes: celdas en orden de lectura (arriba-izquierda, arriba-derecha, …)
const matrix2x2 = (axes, cells) => ({ type: 'matrix', rows: 2, cols: 2, ...axes, items: cells.map(([id, label, color]) => ({ id, label, color })) })

const CANDIDATURA = { name: 'Candidatura', color: '#7048e8', markers: ['Enviada', 'Entrevista', 'Oferta', 'Descartada'] }
const VIAJE = { name: 'Preparado', color: '#2f9e44', markers: ['Pendiente', 'Hecho'] }

// Las cuatro preguntas de cada perspectiva del cuadro de mando integral
const scorecardRows = () => [T('Objetivo'), T('Indicador'), T('Meta'), T('Iniciativa')]
// Una cadena de «¿Por qué?» anidados (5 porqués)
const whyChain = depth => depth === 0 ? [] : [T(`¿Por qué? (${6 - depth})`, whyChain(depth - 1))]

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
  },

  // ---------- Estrategia y análisis ----------
  {
    id: 'swot', category: 'strategy', name: 'Análisis DAFO',
    description: 'Debilidades, amenazas, fortalezas y oportunidades, y las estrategias que salen de cruzarlas.',
    root: T('DAFO: [empresa o proyecto]', { note: 'Fortalezas y debilidades son internas; oportunidades y amenazas, externas.' }, [
      T('Fortalezas', { icon: ['flag_green'] }, [T('Fortaleza 1'), T('Fortaleza 2')]),
      T('Debilidades', { icon: ['flag_red'] }, [T('Debilidad 1'), T('Debilidad 2')]),
      T('Oportunidades', { icon: ['arrow_rising'] }, [T('Oportunidad 1'), T('Oportunidad 2')]),
      T('Amenazas', { icon: ['symbol_warning'] }, [T('Amenaza 1'), T('Amenaza 2')]),
      T('Estrategias', { icon: ['symbol_target'] }, [
        T('Ofensivas (fortalezas + oportunidades)'),
        T('Defensivas (fortalezas + amenazas)'),
        T('De reorientación (debilidades + oportunidades)'),
        T('De supervivencia (debilidades + amenazas)')
      ])
    ])
  },
  {
    id: 'pest', category: 'strategy', name: 'Análisis PEST',
    description: 'Factores políticos, económicos, sociales y tecnológicos del entorno.',
    root: T('PEST: [mercado o proyecto]', [
      T('Políticos', [T('Estabilidad política'), T('Política fiscal'), T('Comercio exterior')]),
      T('Económicos', [T('Crecimiento'), T('Inflación y tipos de interés'), T('Empleo')]),
      T('Sociales', [T('Demografía'), T('Estilos de vida'), T('Educación')]),
      T('Tecnológicos', [T('Innovación'), T('Automatización'), T('Infraestructuras')]),
      T('Conclusiones', { icon: ['symbol_check'] })
    ])
  },
  {
    id: 'pestle', category: 'strategy', name: 'Análisis PESTEL',
    description: 'PEST ampliado con factores ecológicos y legales.',
    root: T('PESTEL: [mercado o proyecto]', [
      T('Políticos'),
      T('Económicos'),
      T('Sociales'),
      T('Tecnológicos'),
      T('Ecológicos', [T('Normativa ambiental'), T('Clima'), T('Sostenibilidad')]),
      T('Legales', [T('Laboral'), T('Consumo'), T('Protección de datos')]),
      T('Impacto en el proyecto', { icon: ['symbol_target'], note: 'Marca con Prioridad 1 los factores con más impacto.' })
    ])
  },
  {
    id: 'destep', category: 'strategy', name: 'Análisis DESTEP',
    description: 'Entorno demográfico, económico, social, tecnológico, ecológico y político.',
    root: T('DESTEP: [mercado]', [
      T('Demográfico', [T('Población'), T('Edad'), T('Hogares')]),
      T('Económico', [T('Renta'), T('Consumo')]),
      T('Social', [T('Valores'), T('Tendencias')]),
      T('Tecnológico'),
      T('Ecológico'),
      T('Político'),
      T('Oportunidades y amenazas')
    ])
  },
  {
    id: 'five-forces', category: 'strategy', name: 'Cinco fuerzas de Porter',
    description: 'Atractivo de un sector según la competencia y el poder de cada actor.',
    root: T('Cinco fuerzas: [sector]', [
      T('Rivalidad entre competidores', { icon: ['symbol_target'] }, [T('Número de competidores'), T('Crecimiento del sector'), T('Diferenciación')]),
      T('Amenaza de nuevos competidores', [T('Barreras de entrada'), T('Inversión necesaria')]),
      T('Poder de los proveedores', [T('Concentración'), T('Coste de cambiar de proveedor')]),
      T('Poder de los clientes', [T('Volumen de compra'), T('Sensibilidad al precio')]),
      T('Amenaza de sustitutos', [T('Alternativas'), T('Relación calidad-precio')]),
      T('Conclusión', { icon: ['symbol_check'], note: 'Valora cada fuerza (alta, media, baja) con los iconos de semáforo.' })
    ])
  },
  {
    id: 'strategic-plan', category: 'strategy', name: 'Plan estratégico',
    description: 'Misión, visión, objetivos estratégicos, iniciativas e indicadores.',
    markers: [ESTADO],
    root: T('Plan estratégico: [organización]', [
      T('Misión', { note: 'Por qué existe la organización.' }),
      T('Visión', { note: 'Dónde quiere estar en 3 a 5 años.' }),
      T('Valores'),
      T('Análisis de situación', [T('DAFO'), T('Entorno'), T('Clientes')]),
      T('Objetivos estratégicos', { icon: ['symbol_target'] }, [
        T('Objetivo 1', { task: { due: 365 } }, [T('Iniciativa', { tags: ['Pendiente'], task: { due: 90, resources: ['Responsable'] } })]),
        T('Objetivo 2', { task: { due: 365 } }, [T('Iniciativa', { tags: ['Pendiente'], task: { due: 180, resources: ['Responsable'] } })])
      ]),
      T('Indicadores'),
      T('Revisión', { task: { due: 90, milestone: true } })
    ])
  },
  {
    id: 'business-plan', category: 'strategy', name: 'Plan de negocio',
    description: 'Todos los apartados de un plan de negocio, del resumen al plan financiero.',
    root: T('Plan de negocio: [empresa]', [
      T('Resumen ejecutivo', { note: 'Escríbelo al final: una página con lo esencial.' }),
      T('Empresa', [T('Misión'), T('Forma jurídica'), T('Ubicación')]),
      T('Producto o servicio', [T('Propuesta de valor'), T('Precio')]),
      T('Mercado', [T('Clientes objetivo'), T('Tamaño del mercado'), T('Tendencias')]),
      T('Competencia'),
      T('Marketing y ventas'),
      T('Operaciones'),
      T('Equipo', { icon: ['people_team'] }),
      T('Plan financiero', { icon: ['symbol_money'] }, [T('Inversión inicial'), T('Previsión de ventas'), T('Cuenta de resultados'), T('Financiación')]),
      T('Riesgos', { icon: ['symbol_warning'] }),
      T('Hitos', [T('Lanzamiento', { task: { due: 90, milestone: true } })])
    ])
  },
  {
    id: 'business-model-canvas', category: 'strategy', name: 'Modelo de negocio (Canvas)',
    description: 'Los nueve bloques del Business Model Canvas.',
    root: T('Modelo de negocio: [empresa]', [
      T('Propuesta de valor', { icon: ['symbol_star'], note: 'Qué problema resuelves y por qué te eligen.' }),
      T('Segmentos de clientes', { icon: ['people_client'] }),
      T('Canales'),
      T('Relación con los clientes'),
      T('Fuentes de ingresos', { icon: ['symbol_money'] }),
      T('Recursos clave'),
      T('Actividades clave'),
      T('Socios clave', { icon: ['people_team'] }),
      T('Estructura de costes')
    ])
  },
  {
    id: 'balanced-scorecard', category: 'strategy', name: 'Cuadro de mando integral',
    description: 'Objetivos, indicadores, metas e iniciativas en las cuatro perspectivas.',
    root: T('Cuadro de mando: [organización]', [
      T('Financiera', { icon: ['symbol_money'] }, scorecardRows()),
      T('Clientes', { icon: ['people_client'] }, scorecardRows()),
      T('Procesos internos', scorecardRows()),
      T('Aprendizaje y crecimiento', scorecardRows())
    ])
  },
  {
    id: 'cost-benefit', category: 'strategy', name: 'Análisis coste-beneficio',
    description: 'Compara costes y beneficios de una propuesta y deja una recomendación.',
    root: T('Coste-beneficio: [propuesta]', [
      T('Propuesta'),
      T('Costes', { icon: ['arrow_falling'] }, [T('Inversión inicial'), T('Costes recurrentes'), T('Costes ocultos')]),
      T('Beneficios', { icon: ['arrow_rising'] }, [T('Tangibles'), T('Intangibles')]),
      T('Riesgos', { icon: ['symbol_warning'] }),
      T('Resultado', [T('Periodo de retorno'), T('Rentabilidad (ROI)')]),
      T('Recomendación', { icon: ['symbol_check'] })
    ])
  },
  {
    id: 'five-whys', category: 'strategy', name: 'Análisis de causa raíz (5 porqués)',
    description: 'Pregunta «¿por qué?» hasta llegar a la causa raíz y decide cómo corregirla.',
    layout: 'logicalStructure',
    root: T('Problema: [qué ocurre]', [
      T('Descripción', { note: 'Qué, dónde, cuándo y cuánto.' }),
      T('Cadena de causas', { callout: 'Responde cada «¿Por qué?» con un hecho, no con una opinión.' }, whyChain(5)),
      T('Causa raíz', { icon: ['symbol_target'] }),
      T('Acción correctiva', [T('Acción', { task: { due: 14, resources: ['Responsable'] } })]),
      T('Cómo comprobaremos que funciona')
    ])
  },
  {
    id: 'compare', category: 'strategy', name: 'Comparar opciones',
    description: 'Pros y contras de dos o tres alternativas y la conclusión.',
    root: T('Comparar: [qué]', [
      T('Opción A', [T('A favor', { icon: ['symbol_check'] }), T('En contra', { icon: ['symbol_cross'] }), T('Coste')]),
      T('Opción B', [T('A favor', { icon: ['symbol_check'] }), T('En contra', { icon: ['symbol_cross'] }), T('Coste')]),
      T('Opción C', [T('A favor', { icon: ['symbol_check'] }), T('En contra', { icon: ['symbol_cross'] }), T('Coste')]),
      T('Criterios', [T('Imprescindibles'), T('Deseables')]),
      T('Conclusión', { icon: ['symbol_star'] })
    ])
  },
  {
    id: 'process-map', category: 'strategy', name: 'Mapa de proceso (SIPOC)',
    description: 'Proveedores, entradas, pasos del proceso, salidas y clientes.',
    layout: 'logicalStructure',
    root: T('Proceso: [nombre]', [
      T('Proveedores'),
      T('Entradas'),
      T('Proceso', [T('1. Paso'), T('2. Paso'), T('3. Paso'), T('4. Paso')]),
      T('Salidas'),
      T('Clientes', { icon: ['people_client'] }),
      T('Mejoras', { icon: ['symbol_idea'] }, [T('Mejora 1', { icon: ['priority_1'] })])
    ])
  },
  {
    id: 'use-cases', category: 'strategy', name: 'Casos de uso',
    description: 'Actores y casos de uso de un sistema, con su flujo principal y alternativo.',
    root: T('Sistema: [nombre]', [
      T('Actores', { icon: ['people_team'] }, [T('Usuario'), T('Administrador'), T('Sistema externo')]),
      T('Caso de uso 1', [
        T('Actor principal'),
        T('Precondiciones'),
        T('Flujo principal', [T('1.'), T('2.'), T('3.')]),
        T('Flujos alternativos'),
        T('Postcondiciones')
      ]),
      T('Caso de uso 2'),
      T('Requisitos no funcionales', [T('Rendimiento'), T('Seguridad', { icon: ['symbol_lock'] }), T('Accesibilidad')])
    ])
  },
  {
    id: 'marketing-plan', category: 'strategy', name: 'Plan de marketing',
    description: 'Situación, público, objetivos, las 4 P, presupuesto y medición.',
    root: T('Plan de marketing: [producto]', [
      T('Situación actual'),
      T('Público objetivo', { icon: ['people_client'] }),
      T('Objetivos', { icon: ['symbol_target'] }),
      T('Marketing mix', [T('Producto'), T('Precio'), T('Distribución'), T('Promoción')]),
      T('Presupuesto', { icon: ['symbol_money'] }),
      T('Calendario', [T('Campaña 1', { task: { start: 14, due: 45 } }), T('Campaña 2', { task: { start: 60, due: 90 } })]),
      T('Medición', [T('Indicadores'), T('Revisión', { task: { due: 90, milestone: true } })])
    ])
  },

  // ---------- Personal ----------
  {
    id: 'personal-tasks', category: 'personal', name: 'Mis tareas',
    description: 'Tareas personales por horizonte: hoy, esta semana, más adelante y en espera.',
    layout: 'logicalStructure',
    root: T('Mis tareas', [
      T('Hoy', { icon: ['symbol_star'] }, [T('Tarea', { icon: ['priority_1'], task: { due: 0 } })]),
      T('Esta semana', [T('Tarea', { icon: ['priority_2'], task: { due: 5 } })]),
      T('Más adelante', [T('Tarea')]),
      T('Esperando a otros', { icon: ['symbol_pause'] }),
      T('Hecho', { icon: ['symbol_check'], collapsed: true })
    ])
  },
  {
    id: 'weekly-planner', category: 'personal', name: 'Planificador semanal',
    description: 'Objetivos de la semana, un tema por día y una revisión final.',
    layout: 'logicalStructure',
    root: T('Mi semana', [
      T('Objetivos de la semana', { icon: ['symbol_target'] }, [T('Objetivo 1'), T('Objetivo 2'), T('Objetivo 3')]),
      T('Lunes'), T('Martes'), T('Miércoles'), T('Jueves'), T('Viernes'),
      T('Fin de semana'),
      T('Revisión', [T('¿Qué salió bien?'), T('¿Qué cambio la próxima semana?')])
    ])
  },
  {
    id: 'life-planner', category: 'personal', name: 'Planificador vital',
    description: 'Visión y objetivos para cada área de la vida.',
    root: T('Mi vida', [
      T('Visión a 5 años', { icon: ['symbol_star'] }),
      T('Salud', { icon: ['symbol_heart'] }, [T('Objetivo')]),
      T('Familia y amigos', { icon: ['people_team'] }, [T('Objetivo')]),
      T('Trabajo y carrera', [T('Objetivo')]),
      T('Finanzas', { icon: ['symbol_money'] }, [T('Objetivo')]),
      T('Aprendizaje', { icon: ['symbol_idea'] }, [T('Objetivo')]),
      T('Ocio', [T('Objetivo')]),
      T('Hogar', { icon: ['symbol_home'] }, [T('Objetivo')])
    ])
  },
  {
    id: 'smart-goal', category: 'personal', name: 'Objetivo SMART',
    description: 'Convierte una meta en un objetivo específico, medible, alcanzable, relevante y con fecha.',
    root: T('Objetivo: [meta]', { icon: ['symbol_target'] }, [
      T('Específico', { note: '¿Qué quiero conseguir exactamente?' }),
      T('Medible', { note: '¿Cómo sabré que lo he logrado?' }),
      T('Alcanzable', { note: '¿Qué necesito para conseguirlo?' }),
      T('Relevante', { note: '¿Por qué me importa?' }),
      T('Con fecha', { task: { due: 90, milestone: true } }),
      T('Primeros pasos', [T('Paso 1', { task: { due: 7 } }), T('Paso 2', { task: { due: 14 } })]),
      T('Obstáculos y cómo superarlos', { icon: ['symbol_warning'] })
    ])
  },
  {
    id: 'job-search', category: 'personal', name: 'Búsqueda de empleo',
    description: 'Objetivo profesional, empresas, candidaturas con su estado, contactos y entrevistas.',
    markers: [CANDIDATURA],
    root: T('Búsqueda de empleo', [
      T('Objetivo profesional', { icon: ['symbol_target'] }),
      T('Mis puntos fuertes', { icon: ['symbol_star'] }),
      T('Materiales', [T('Currículum', { icon: ['symbol_document'] }), T('Carta de presentación'), T('Perfil profesional en línea')]),
      T('Empresas objetivo', [T('Empresa 1'), T('Empresa 2')]),
      T('Candidaturas', { callout: 'Marca el estado de cada candidatura con el marcador «Candidatura».' }, [
        T('Puesto en empresa 1', { tags: ['Enviada'], task: { start: 0, due: 14 } }),
        T('Puesto en empresa 2', { tags: ['Entrevista'], task: { due: 7 } })
      ]),
      T('Red de contactos', { icon: ['people_team'] }),
      T('Preparar entrevistas', [T('Preguntas frecuentes'), T('Preguntas para la empresa'), T('Logros con cifras')]),
      T('Seguimiento', { task: { due: 7 } })
    ])
  },
  {
    id: 'resume', category: 'personal', name: 'Currículum',
    description: 'Esquema de un currículum para ordenar experiencia, formación y habilidades.',
    root: T('Currículum: [nombre]', [
      T('Contacto', [T('Correo', { icon: ['symbol_mail'] }), T('Teléfono', { icon: ['symbol_phone'] }), T('Ciudad', { icon: ['symbol_pin'] })]),
      T('Perfil', { note: 'Tres o cuatro líneas: quién eres y qué aportas.' }),
      T('Experiencia', [
        T('Puesto 1', [T('Empresa'), T('Fechas'), T('Logros')]),
        T('Puesto 2', [T('Empresa'), T('Fechas'), T('Logros')])
      ]),
      T('Formación'),
      T('Habilidades'),
      T('Idiomas'),
      T('Otros', [T('Voluntariado'), T('Publicaciones'), T('Intereses')])
    ])
  },
  {
    id: 'self-assessment', category: 'personal', name: 'Autoevaluación',
    description: 'Logros, fortalezas, áreas de mejora y objetivos para el próximo periodo.',
    root: T('Autoevaluación: [periodo]', [
      T('Logros', { icon: ['symbol_check'] }),
      T('Fortalezas', { icon: ['arrow_rising'] }),
      T('Áreas de mejora', { icon: ['arrow_up'] }),
      T('Lo que he aprendido', { icon: ['symbol_idea'] }),
      T('Objetivos para el próximo periodo', { icon: ['symbol_target'] }, [T('Objetivo 1', { task: { due: 90 } })]),
      T('Apoyo que necesito')
    ])
  },
  {
    id: 'trip', category: 'personal', name: 'Planificar un viaje',
    description: 'Destino, fechas, presupuesto, reservas, documentación, equipaje e itinerario.',
    markers: [VIAJE],
    root: T('Viaje a [destino]', [
      T('Fechas', { task: { start: 30, due: 37 } }),
      T('Presupuesto', { icon: ['symbol_money'] }, [T('Transporte'), T('Alojamiento'), T('Comidas'), T('Actividades')]),
      T('Transporte', [T('Ida', { tags: ['Pendiente'] }), T('Vuelta', { tags: ['Pendiente'] })]),
      T('Alojamiento', { tags: ['Pendiente'], icon: ['symbol_home'] }),
      T('Documentación', { icon: ['symbol_document'] }, [
        T('Documento de identidad o pasaporte', { tags: ['Pendiente'] }),
        T('Seguro de viaje', { tags: ['Pendiente'] }),
        T('Reservas impresas', { tags: ['Pendiente'] })
      ]),
      T('Equipaje', { collapsed: true }, [T('Ropa'), T('Aseo'), T('Cargadores'), T('Medicinas')]),
      T('Itinerario', [T('Día 1', { task: { start: 30 } }), T('Día 2', { task: { start: 31 } }), T('Día 3', { task: { start: 32 } })]),
      T('Contactos de emergencia', { icon: ['symbol_phone'] })
    ])
  },
  {
    id: 'writing', category: 'personal', name: 'Escribir un texto',
    description: 'Idea central, público, estructura, fuentes y calendario de un artículo, ensayo o informe.',
    root: T('Texto: [título provisional]', [
      T('Idea central', { icon: ['symbol_idea'], note: 'Resúmela en una frase.' }),
      T('Público y tono', { icon: ['people_client'] }),
      T('Estructura', [
        T('Introducción'),
        T('Desarrollo', [T('Argumento 1'), T('Argumento 2'), T('Argumento 3')]),
        T('Conclusión')
      ]),
      T('Fuentes', { icon: ['symbol_search'] }),
      T('Calendario', [
        T('Borrador', { task: { due: 7 } }),
        T('Revisión', { task: { start: 8, due: 14 } }),
        T('Entrega', { task: { due: 21, milestone: true } })
      ])
    ])
  },
  {
    id: 'study-plan', category: 'personal', name: 'Plan de estudio',
    description: 'Temas, materiales, sesiones de estudio, exámenes y dudas de una asignatura.',
    root: T('Estudiar: [asignatura]', [
      T('Temas', [T('Tema 1', { icon: ['progress_1'] }), T('Tema 2', { icon: ['progress_1'] }), T('Tema 3', { icon: ['progress_1'] })]),
      T('Materiales', { icon: ['symbol_document'] }, [T('Apuntes'), T('Libro'), T('Ejercicios')]),
      T('Sesiones de estudio', [T('Sesión 1', { task: { due: 2 } }), T('Sesión 2', { task: { due: 4 } }), T('Repaso', { task: { due: 12 } })]),
      T('Exámenes', [T('Examen', { task: { due: 14, milestone: true } })]),
      T('Dudas', { icon: ['symbol_question'] })
    ])
  },

  // ---------- Organigramas, cronologías y causa-efecto ----------
  {
    id: 'org-chart', category: 'layouts', name: 'Organigrama',
    description: 'Estructura de una organización en diseño de organigrama (ramas hacia abajo).',
    layout: 'organizationStructure',
    root: T('Dirección general', { icon: ['people_owner'] }, [
      T('Finanzas', [T('Contabilidad'), T('Tesorería')]),
      T('Operaciones', [T('Producción'), T('Logística')]),
      T('Comercial', [T('Ventas'), T('Marketing')]),
      T('Personas', [T('Selección'), T('Formación')])
    ])
  },
  {
    id: 'wbs', category: 'layouts', name: 'Estructura de desglose del trabajo',
    description: 'EDT del proyecto en forma de organigrama: entregables y paquetes de trabajo.',
    layout: 'organizationStructure',
    root: T('Proyecto: [nombre]', [
      T('1. Gestión', [T('1.1 Planificación'), T('1.2 Seguimiento')]),
      T('2. Análisis', [T('2.1 Requisitos'), T('2.2 Especificación')]),
      T('3. Diseño', [T('3.1 Arquitectura'), T('3.2 Prototipo')]),
      T('4. Construcción', [T('4.1 Desarrollo'), T('4.2 Pruebas')]),
      T('5. Implantación', [T('5.1 Formación'), T('5.2 Puesta en marcha')])
    ])
  },
  {
    id: 'project-timeline', category: 'layouts', name: 'Línea de tiempo de proyecto',
    description: 'Fases del proyecto en orden sobre una línea de tiempo, con fechas desde hoy.',
    layout: 'timeline',
    root: T('Proyecto: [nombre]', [
      T('Arranque', { task: { start: 0, due: 14 } }, [T('Reunión inicial', { task: { due: 3, milestone: true } })]),
      T('Análisis', { task: { start: 14, due: 35 } }, [T('Requisitos cerrados', { task: { due: 35, milestone: true } })]),
      T('Desarrollo', { task: { start: 35, due: 80 } }, [T('Versión de prueba', { task: { due: 70, milestone: true } })]),
      T('Pruebas', { task: { start: 80, due: 95 } }),
      T('Lanzamiento', { task: { due: 100, milestone: true } })
    ])
  },
  {
    id: 'history-timeline', category: 'layouts', name: 'Cronología',
    description: 'Hechos en orden cronológico: una época o fecha por tema principal.',
    layout: 'timeline',
    root: T('Cronología: [tema]', [
      T('[Fecha 1]', [T('Hecho clave')]),
      T('[Fecha 2]', [T('Hecho clave')]),
      T('[Fecha 3]', [T('Hecho clave')]),
      T('[Fecha 4]', [T('Hecho clave')]),
      T('[Fecha 5]', [T('Hecho clave')])
    ])
  },
  {
    id: 'fishbone-6m', category: 'layouts', name: 'Espina de pez (6M)',
    description: 'Diagrama de Ishikawa: causas de un problema agrupadas en las 6M.',
    layout: 'fishbone',
    root: T('Efecto: [problema]', [
      T('Método', [T('Causa')]),
      T('Mano de obra', [T('Causa')]),
      T('Máquinas', [T('Causa')]),
      T('Materiales', [T('Causa')]),
      T('Medición', [T('Causa')]),
      T('Medio ambiente', [T('Causa')])
    ])
  },
  {
    id: 'fishbone-service', category: 'layouts', name: 'Espina de pez (servicios)',
    description: 'Ishikawa para servicios: entorno, proveedores, sistemas y personas.',
    layout: 'fishbone',
    root: T('Efecto: [problema del servicio]', [
      T('Entorno', [T('Causa')]),
      T('Proveedores', [T('Causa')]),
      T('Sistemas', [T('Causa')]),
      T('Personas', [T('Causa')])
    ])
  },

  // ---------- Diagramas ----------
  // Los temas se colocan en zonas; las reglas dan icono, color o tamaño según la zona
  {
    id: 'swot-matrix', category: 'diagrams', name: 'Matriz DAFO',
    description: 'DAFO en matriz 2×2: cada tema toma el icono y el color del cuadrante donde lo dejas.',
    diagram: {
      ...matrix2x2({}, [
        ['f', 'Fortalezas', '#2f9e44'], ['d', 'Debilidades', '#e03131'],
        ['o', 'Oportunidades', '#1c7ed6'], ['a', 'Amenazas', '#f08c00']
      ]),
      rules: { f: { icon: 'flag_green' }, d: { icon: 'flag_red' }, o: { icon: 'arrow_rising' }, a: { icon: 'symbol_warning' } }
    },
    root: T('DAFO: [empresa o proyecto]', { callout: 'Arrastra un tema a otro cuadrante: cambia su icono.' }, [
      T('Fortaleza', { zone: 'f' }), T('Debilidad', { zone: 'd' }),
      T('Oportunidad', { zone: 'o' }), T('Amenaza', { zone: 'a' })
    ])
  },
  {
    id: 'urgency-importance', category: 'diagrams', name: 'Matriz urgencia/importancia',
    description: 'Matriz de Eisenhower: hacer, planificar, delegar o eliminar, con la prioridad automática.',
    diagram: {
      ...matrix2x2({ xLabel: 'Urgencia', xLow: 'Baja', xHigh: 'Alta', yLabel: 'Importancia', yLow: 'Baja', yHigh: 'Alta' }, [
        ['plan', 'Planificar', '#1c7ed6'], ['now', 'Hacer ahora', '#e03131'],
        ['drop', 'Eliminar', '#868e96'], ['delegate', 'Delegar', '#f08c00']
      ]),
      rules: { now: { icon: 'priority_1' }, plan: { icon: 'priority_2' }, delegate: { icon: 'priority_3' }, drop: { icon: 'symbol_cross' } }
    },
    root: T('Prioridades: [periodo]', [
      T('Tarea importante', { zone: 'plan' }), T('Tarea urgente e importante', { zone: 'now' }),
      T('Distracción', { zone: 'drop' }), T('Interrupción', { zone: 'delegate' })
    ])
  },
  {
    id: 'value-effort', category: 'diagrams', name: 'Matriz valor/esfuerzo',
    description: 'Decide qué hacer primero: victorias rápidas, grandes proyectos, relleno o evitar.',
    diagram: {
      ...matrix2x2({ xLabel: 'Esfuerzo', xLow: 'Bajo', xHigh: 'Alto', yLabel: 'Valor', yLow: 'Bajo', yHigh: 'Alto' }, [
        ['quick', 'Victorias rápidas', '#2f9e44'], ['big', 'Grandes proyectos', '#1c7ed6'],
        ['fill', 'Tareas de relleno', '#f08c00'], ['avoid', 'Evitar', '#e03131']
      ]),
      rules: { quick: { icon: 'symbol_star', fill: '#d3f9d8' }, big: { fill: '#d0ebff' }, fill: { fill: '#fff3bf' }, avoid: { icon: 'symbol_cross', fill: '#ffe3e3' } }
    },
    root: T('Valor/esfuerzo: [iniciativas]', [
      T('Iniciativa A', { zone: 'quick' }), T('Iniciativa B', { zone: 'big' }),
      T('Iniciativa C', { zone: 'fill' }), T('Iniciativa D', { zone: 'avoid' })
    ])
  },
  {
    id: 'risk-reward', category: 'diagrams', name: 'Matriz riesgo/beneficio',
    description: 'Clasifica opciones por riesgo y beneficio; el semáforo se pone solo.',
    diagram: {
      ...matrix2x2({ xLabel: 'Riesgo', xLow: 'Bajo', xHigh: 'Alto', yLabel: 'Beneficio', yLow: 'Bajo', yHigh: 'Alto' }, [
        ['go', 'Adelante', '#2f9e44'], ['bet', 'Apuestas estratégicas', '#f08c00'],
        ['minor', 'Mejoras menores', '#1c7ed6'], ['avoid', 'Evitar', '#e03131']
      ]),
      rules: { go: { icon: 'traffic_green' }, bet: { icon: 'traffic_amber' }, minor: { icon: 'traffic_amber' }, avoid: { icon: 'traffic_red' } }
    },
    root: T('Riesgo/beneficio: [decisión]', [
      T('Opción 1', { zone: 'go' }), T('Opción 2', { zone: 'bet' }), T('Opción 3', { zone: 'minor' }), T('Opción 4', { zone: 'avoid' })
    ])
  },
  {
    id: 'matrix-3x3', category: 'diagrams', name: 'Matriz 3×3',
    description: 'Matriz de nueve casillas con dos ejes para clasificar cualquier cosa.',
    diagram: {
      type: 'matrix', rows: 3, cols: 3, width: 690, height: 480,
      xLabel: 'Eje horizontal', xLow: 'Bajo', xHigh: 'Alto', yLabel: 'Eje vertical', yLow: 'Bajo', yHigh: 'Alto',
      items: ['Alto · Bajo', 'Alto · Medio', 'Alto · Alto', 'Medio · Bajo', 'Medio · Medio', 'Medio · Alto', 'Bajo · Bajo', 'Bajo · Medio', 'Bajo · Alto']
        .map((label, i) => ({ id: `c${i + 1}`, label, color: ['#2f9e44', '#1c7ed6', '#8e6fd8'][i % 3] }))
    },
    root: T('Matriz: [tema]', [T('Elemento 1', { zone: 'c5' }), T('Elemento 2', { zone: 'c3' })])
  },
  {
    id: 'venn-2', category: 'diagrams', name: 'Diagrama de Venn (2 círculos)',
    description: 'Lo propio de cada grupo y lo que comparten; el color del tema sigue a su zona.',
    diagram: {
      type: 'venn',
      items: [{ id: 'a', label: 'Grupo A', color: '#1c7ed6' }, { id: 'b', label: 'Grupo B', color: '#2f9e44' }],
      rules: { a: { fill: '#d0ebff' }, b: { fill: '#d3f9d8' }, 'a+b': { fill: '#fff3bf', icon: 'symbol_star' } }
    },
    root: T('Comparar: [A] y [B]', [
      T('Solo de A', { zone: 'a' }), T('Solo de B', { zone: 'b' }), T('En común', { zone: 'a+b' })
    ])
  },
  {
    id: 'venn-3', category: 'diagrams', name: 'Diagrama de Venn (3 círculos)',
    description: 'Tres conjuntos y sus intersecciones.',
    diagram: {
      type: 'venn',
      items: [{ id: 'a', label: 'Conjunto A', color: '#1c7ed6' }, { id: 'b', label: 'Conjunto B', color: '#e03131' }, { id: 'c', label: 'Conjunto C', color: '#2f9e44' }]
    },
    root: T('Diagrama de Venn: [tema]', [
      T('A', { zone: 'a' }), T('B', { zone: 'b' }), T('C', { zone: 'c' }), T('Común a los tres', { zone: 'a+b+c' })
    ])
  },
  {
    id: 'venn-3-rules', category: 'diagrams', name: 'Venn de 3 círculos con reglas',
    description: 'Venn de tres conjuntos en el que cada zona da su color al tema que se coloca en ella.',
    diagram: {
      type: 'venn',
      items: [{ id: 'a', label: 'Deseable', color: '#e03131' }, { id: 'b', label: 'Viable', color: '#1c7ed6' }, { id: 'c', label: 'Factible', color: '#2f9e44' }],
      rules: {
        a: { fill: '#ffe3e3' }, b: { fill: '#d0ebff' }, c: { fill: '#d3f9d8' },
        'a+b': { fill: '#e5dbff' }, 'a+c': { fill: '#fff3bf' }, 'b+c': { fill: '#c3fae8' },
        'a+b+c': { fill: '#ffd8a8', icon: 'symbol_star' }
      }
    },
    root: T('Ideas: [producto]', { note: 'En el centro, las ideas deseables, viables y factibles a la vez.' }, [
      T('Idea 1', { zone: 'a' }), T('Idea 2', { zone: 'b' }), T('Idea 3', { zone: 'c' }), T('Idea ganadora', { zone: 'a+b+c' })
    ])
  },
  {
    id: 'funnel', category: 'diagrams', name: 'Embudo de colores',
    description: 'Embudo de cinco etapas para cualquier proceso que se va estrechando.',
    diagram: {
      type: 'funnel',
      items: ['Etapa 1', 'Etapa 2', 'Etapa 3', 'Etapa 4', 'Etapa 5'].map((label, i) => ({ id: `s${i + 1}`, label, color: ['#3d8fd8', '#2fb5a6', '#7dc142', '#f0a830', '#e0544b'][i] }))
    },
    root: T('Embudo: [proceso]', [T('Elemento', { zone: 's1' }), T('Elemento', { zone: 's3' }), T('Elemento', { zone: 's5' })])
  },
  {
    id: 'sales-funnel', category: 'diagrams', name: 'Embudo por etapas',
    description: 'Embudo de ventas: el progreso de cada oportunidad se marca solo según su etapa.',
    diagram: {
      type: 'funnel',
      items: ['Contactos', 'Oportunidades', 'Propuestas', 'Negociación', 'Clientes'].map((label, i) => ({ id: `s${i + 1}`, label, color: ['#3d8fd8', '#2fb5a6', '#7dc142', '#f0a830', '#e0544b'][i] })),
      rules: { s1: { icon: 'progress_1' }, s2: { icon: 'progress_3' }, s3: { icon: 'progress_5' }, s4: { icon: 'progress_7' }, s5: { icon: 'progress_8' } }
    },
    root: T('Embudo de ventas', { callout: 'Arrastra cada cliente a su etapa: el progreso se actualiza.' }, [
      T('Cliente A', { zone: 's1' }), T('Cliente B', { zone: 's2' }), T('Cliente C', { zone: 's3' }), T('Cliente D', { zone: 's5' })
    ])
  },
  {
    id: 'ecommerce-funnel', category: 'diagrams', name: 'Embudo de conversión',
    description: 'Visitas, producto, carrito, pago y compra para comparar la conversión de una tienda en línea.',
    diagram: {
      type: 'funnel', height: 470,
      items: ['Visitas', 'Ven un producto', 'Añaden al carrito', 'Inician el pago', 'Compran'].map((label, i) => ({ id: `s${i + 1}`, label, color: ['#1c7ed6', '#3d8fd8', '#7048e8', '#ae3ec9', '#2f9e44'][i] }))
    },
    root: T('Conversión: [tienda]', { note: 'Tasa de conversión = compras / visitas. Compara cada etapa con la anterior.' }, [
      T('10 000', { zone: 's1' }), T('4 000 (40 %)', { zone: 's2' }), T('800 (20 %)', { zone: 's3' }),
      T('400 (50 %)', { zone: 's4' }), T('250 (62 %)', { zone: 's5' })
    ])
  },
  {
    id: 'onion', category: 'diagrams', name: 'Diagrama de cebolla',
    description: 'Capas concéntricas, del núcleo al entorno; por ejemplo, los interesados de un proyecto.',
    diagram: {
      type: 'onion',
      items: [
        { id: 'core', label: 'Núcleo', color: '#1c7ed6' }, { id: 'direct', label: 'Interesados directos', color: '#2fb5a6' },
        { id: 'indirect', label: 'Interesados indirectos', color: '#7dc142' }, { id: 'env', label: 'Entorno', color: '#f0a830' }
      ]
    },
    root: T('Interesados: [proyecto]', [
      T('Equipo', { zone: 'core' }), T('Clientes', { zone: 'direct' }), T('Proveedores', { zone: 'indirect' }), T('Reguladores', { zone: 'env' })
    ])
  },
  {
    id: 'quarter-circle-plot', category: 'diagrams', name: 'Gráfico de cuarto de círculo',
    description: 'Cuanto más cerca de la esquina, más importante: el tamaño del tema cambia con su posición.',
    diagram: {
      type: 'quarter',
      items: [{ id: 'high', label: 'Muy importante', color: '#e03131' }, { id: 'mid', label: 'Importante', color: '#f08c00' }, { id: 'low', label: 'Poco importante', color: '#1c7ed6' }],
      rules: { high: { fontSize: 20 }, mid: { fontSize: 15 }, low: { fontSize: 11 } }
    },
    root: T('Importancia: [tema]', [T('Elemento clave', { zone: 'high' }), T('Elemento', { zone: 'mid' }), T('Detalle', { zone: 'low' })])
  },
  {
    id: 'quarter-onion-plot', category: 'diagrams', name: 'Cuarto de cebolla',
    description: 'Ahora, próximamente o más adelante: el color del tema cambia con su anillo.',
    diagram: {
      type: 'quarter',
      items: [{ id: 'now', label: 'Ahora', color: '#2f9e44' }, { id: 'next', label: 'Próximamente', color: '#f08c00' }, { id: 'later', label: 'Más adelante', color: '#868e96' }],
      rules: { now: { fill: '#d3f9d8' }, next: { fill: '#fff3bf' }, later: { fill: '#e9ecef' } }
    },
    root: T('Hoja de ruta: [producto]', [T('Mejora 1', { zone: 'now' }), T('Mejora 2', { zone: 'next' }), T('Idea', { zone: 'later' })])
  },
  {
    id: 'swimlanes-horizontal', category: 'diagrams', name: 'Carriles horizontales',
    description: 'Proceso entre departamentos: un carril por área y los pasos de izquierda a derecha.',
    diagram: {
      type: 'lanes', orientation: 'horizontal',
      items: ['Cliente', 'Ventas', 'Almacén', 'Facturación'].map((label, i) => ({ id: `l${i + 1}`, label, color: ['#3d8fd8', '#7dc142', '#f0a830', '#8e6fd8'][i] }))
    },
    root: T('Proceso: [pedido]', [
      T('Hace el pedido', { zone: 'l1', ref: 'p1', links: [{ to: 'p2' }] }),
      T('Confirma el pedido', { at: [290, 156], ref: 'p2', links: [{ to: 'p3' }] }),
      T('Prepara el envío', { at: [440, 276], ref: 'p3', links: [{ to: 'p4' }] }),
      T('Emite la factura', { at: [600, 396], ref: 'p4', links: [{ to: 'p5' }] }),
      T('Recibe el pedido', { at: [740, 36], ref: 'p5' })
    ])
  },
  {
    id: 'swimlanes-vertical', category: 'diagrams', name: 'Carriles verticales',
    description: 'Columnas por área o canal con sus tareas de arriba abajo.',
    diagram: {
      type: 'lanes', orientation: 'vertical', width: 720, height: 480,
      items: ['Marketing', 'Producto', 'Soporte'].map((label, i) => ({ id: `l${i + 1}`, label, color: ['#e0544b', '#3d8fd8', '#2fb5a6'][i] }))
    },
    root: T('Lanzamiento: [producto]', [
      T('Campaña', { zone: 'l1' }), T('Web', { zone: 'l1' }),
      T('Versión final', { zone: 'l2' }), T('Notas de versión', { zone: 'l2' }),
      T('Guía de ayuda', { zone: 'l3' })
    ])
  },
  {
    id: 'concept-map', category: 'diagrams', name: 'Mapa conceptual',
    description: 'Conceptos colocados libremente y unidos por relaciones con texto.',
    diagram: { type: 'concept' },
    root: T('Mapa conceptual: [tema]', { callout: 'Une conceptos con Insertar › Relación y escribe el vínculo.' }, [
      T('Plantas', { at: [300, 20], ref: 'plantas', links: [{ to: 'luz', text: 'necesitan' }, { to: 'agua', text: 'necesitan' }, { to: 'foto', text: 'realizan' }] }),
      T('Luz solar', { at: [40, 170], ref: 'luz' }),
      T('Agua', { at: [580, 170], ref: 'agua' }),
      T('Fotosíntesis', { at: [300, 250], ref: 'foto', links: [{ to: 'oxigeno', text: 'produce' }, { to: 'glucosa', text: 'produce' }] }),
      T('Oxígeno', { at: [120, 400], ref: 'oxigeno' }),
      T('Glucosa', { at: [500, 400], ref: 'glucosa' })
    ])
  }
]

// ---- De plantilla a mapa ----
function addDaysIso(baseIso, days) {
  const date = new Date(dayNumber(baseIso) * 86400000 + Math.round(days) * 86400000)
  return date.toISOString().slice(0, 10)
}

// Posición de cada tema principal de un diagrama: `at` explícito o apilados en su zona (en
// carriles horizontales, de izquierda a derecha; en el resto, de arriba abajo)
function diagramTopicPositions(diagram, children) {
  const used = {}
  return children.map(child => {
    if (Array.isArray(child.at)) return { x: child.at[0], y: child.at[1] }
    const zone = child.zone || (diagram.items[0] && diagram.items[0].id)
    const n = used[zone] = (used[zone] || 0) + 1
    const a = diagramZoneAnchor(diagram, zone)
    const rowWise = diagram.type === 'lanes' && diagram.orientation !== 'vertical'
    return rowWise ? { x: a.x + (n - 1) * 150, y: a.y } : { x: a.x, y: a.y + (n - 1) * 44 }
  })
}

// Convierte una plantilla de serie en datos de mapa, con las fechas a partir de `today`
function instantiateTemplate(template, today = todayIso()) {
  const defs = normalizeMarkerDefs(template.markers || [])
  const diagram = template.diagram ? normalizeDiagram(template.diagram) : null
  const positions = diagram ? diagramTopicPositions(diagram, template.root.children || []) : []
  // Relaciones (mapa conceptual, carriles): `ref` nombra un tema y `links` apunta a otros
  const uids = {}
  const collectRefs = node => {
    if (node.ref) uids[node.ref] = createUid()
    ;(node.children || []).forEach(collectRefs)
  }
  collectRefs(template.root)
  const build = (node, isRoot, index) => {
    const data = { text: node.text, expand: !node.collapsed }
    if (isRoot && defs.length) data[TEXT_MARKERS_KEY] = defs
    if (isRoot && diagram) data[DIAGRAM_KEY] = diagram
    if (node.ref) data.uid = uids[node.ref]
    if (diagram && positions[index] && !isRoot && node.__level === 1) {
      data.customLeft = nonZero(positions[index].x)
      data.customTop = nonZero(positions[index].y)
    }
    const links = (node.links || []).filter(l => uids[l.to])
    if (links.length) {
      data.associativeLineTargets = links.map(l => uids[l.to])
      const texts = links.filter(l => l.text)
      if (texts.length) data.associativeLineText = Object.fromEntries(texts.map(l => [uids[l.to], l.text]))
    }
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
    // Regla de la zona en la que cae el tema (después de sus propios iconos y estilos)
    if (diagram && data.customLeft !== undefined) {
      const zone = diagramZoneAt(diagram, data.customLeft + TOPIC_GUESS.w / 2, data.customTop + TOPIC_GUESS.h / 2)
      applyDiagramRule(data, ruleForZone(diagram, zone))
    }
    return { data, children: (node.children || []).map((child, i) => build({ ...child, __level: isRoot ? 1 : 2 }, false, i)) }
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    layout: diagram ? DIAGRAM_LAYOUT : (template.layout || 'mindMap'),
    root: build(template.root, true, 0),
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
// Tema central y una píldora por tema principal (no se dibuja el texto), colocados según el diseño
const PREVIEW = { W: 168, H: 96, line: '#b9b9b9', topic: '#7dc142', root: '#3d8fd8' }
const previewPill = (x, y, w = 32, h = 10, fill = PREVIEW.topic) =>
  `<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="3" fill="${fill}"/>`
const previewLine = (x1, y1, x2, y2) => `<path d="M${x1} ${y1}L${x2} ${y2}" fill="none" stroke="${PREVIEW.line}" stroke-width="1.5"/>`
const previewSvg = parts => `<svg viewBox="0 0 ${PREVIEW.W} ${PREVIEW.H}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${parts.join('')}</svg>`

// Organigrama: el tema central arriba y los principales en fila, con conectores en ángulo
function orgPreview(children) {
  const { W } = PREVIEW
  const n = Math.max(children.length, 1)
  const step = (W - 16) / n
  const w = Math.min(32, step - 4)
  const parts = [previewLine(W / 2, 22, W / 2, 36)]
  if (children.length > 1) parts.push(previewLine(8 + step / 2, 36, 8 + step * (n - 0.5), 36))
  children.forEach((c, i) => {
    const x = 8 + step * (i + 0.5)
    parts.push(previewLine(x, 36, x, 46), previewPill(x, 51, w))
    if ((c.children || []).length) parts.push(previewLine(x, 56, x, 66), previewPill(x, 71, w - 6, 8, '#bfe29a'))
  })
  parts.push(previewPill(W / 2, 16, 44, 16, PREVIEW.root))
  return previewSvg(parts)
}

// Línea de tiempo: los temas principales en orden sobre una línea horizontal
function timelinePreview(children) {
  const { W, H } = PREVIEW
  const y = H / 2
  const n = Math.max(children.length, 1)
  const start = 54
  const step = (W - start - 6) / n
  const w = Math.min(28, step - 3)
  const parts = [previewLine(28, y, W - 4, y)]
  children.forEach((c, i) => {
    const x = start + step * (i + 0.5)
    parts.push(previewPill(x, y, w))
    if ((c.children || []).length) parts.push(previewLine(x, y + 5, x, y + 18), previewPill(x, y + 22, w - 4, 7, '#bfe29a'))
  })
  parts.push(previewPill(26, y, 44, 16, PREVIEW.root))
  return previewSvg(parts)
}

// Espina de pez: como la dibuja la librería, la cabeza (tema central) a la izquierda y las
// espinas en diagonal arriba y abajo, inclinadas hacia la cabeza
function fishbonePreview(children) {
  const { W, H } = PREVIEW
  const y = H / 2
  const pairs = Math.max(Math.ceil(children.length / 2), 1)
  const start = 50
  const step = (W - start - 6) / pairs
  const parts = [previewLine(30, y, W - 6, y)]
  children.forEach((c, i) => {
    const x = start + step * Math.floor(i / 2) + step / 2
    const ty = i % 2 === 0 ? 12 : H - 12
    parts.push(previewLine(x, ty, x - 14, y), previewPill(x + 4, ty, Math.min(30, step - 4), 9))
  })
  parts.push(previewPill(26, y, 40, 18, PREVIEW.root))
  return previewSvg(parts)
}

function templatePreviewSvg(tree, layout = 'mindMap', diagram = null) {
  const all = tree.children || []
  const d = diagram && normalizeDiagram(diagram)
  if (d) return diagramPreviewSvg(d, all.length)
  if (layout === 'organizationStructure') return orgPreview(all.slice(0, 6))
  if (layout === 'timeline') return timelinePreview(all.slice(0, 6))
  if (layout === 'fishbone') return fishbonePreview(all.slice(0, 8))
  const W = 168
  const H = 96
  const children = all.slice(0, 8)
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
