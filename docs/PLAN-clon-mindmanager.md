# Plan: clonar las funcionalidades de MindManager (Mindjet)

Referencias visuales:
- Mapa: <https://es.wikipedia.org/wiki/MindManager#/media/Archivo:Mindmanager.png>
- Cinta "Home": <https://neurobox.co.uk/wp-content/uploads/2023/03/wp-image22740769601-1.png.webp>

Ambas capturas son de **MindManager 8** (interfaz tipo Office 2007). El objetivo es replicar la
**funcionalidad y la ergonomía**, no la marca: no se usan el nombre, el logo ni los iconos de
Mindjet. El logo rojo con "M" que tenemos ahora se parece demasiado al original y conviene
sustituirlo antes de difundir la app (el repositorio es público).

Leyenda de estado: ✅ hecho · 🟡 parcial · ❌ pendiente · ⛔ fuera de alcance  
Esfuerzo: **S** (< ½ día) · **M** (1–2 días) · **L** (3+ días)  
Soporte en simple-mind-map: **Nativo** (comando/plugin existente) · **Parcial** · **Propio** (hay que construirlo)

---

## 1. Inventario general de MindManager 8

| Zona | Contenido | Estado |
|---|---|---|
| Barra de título | Logo/menú de archivo, barra de acceso rápido (nuevo, abrir, guardar, deshacer, rehacer), nombre del mapa, modo "[Solo lectura]" | 🟡 |
| Pestañas de la cinta | Home, Insert, Format, Review, View, Export, Connect, Tools (+ add-ins de terceros) | 🟡 (Inicio, Vista, Exportar) |
| Barra de documentos | Pestañas de mapas abiertos, navegación atrás/adelante | ❌ |
| Panel de tareas (tira derecha) | My Maps, Map Markers, Task Info, Map Parts, Library, Search, Learning, Diagnostics, Wizard | 🟡 (Mis mapas, Marcadores) |
| Barra de estado | Estado de conexión, filtro, vista Mapa/Esquema, zoom con slider, ajustar, mostrar panel | 🟡 (filtro, vista Mapa/Esquema, zoom, ajustar) |
| Lienzo | Temas, subtemas, temas flotantes, llamadas, relaciones, límites, imágenes, notas, botón +/− para expandir y contraer | 🟡 |

**Fuera de alcance:**
- **Connect / Workspace Manager:** la nube propietaria de Mindjet.
- **DecisionMill y ResultsManager:** add-ins de terceros que aparecen en la cinta de la captura.

---

## 2. Pestaña Inicio (Home): inventario detallado

### 2.1 Portapapeles
| Función | Qué hace en MindManager | Estado | simple-mind-map | Esfuerzo |
|---|---|---|---|---|
| Pegar (+ pegado especial) | Pega temas copiados; el desplegable pega como texto, imagen, etc. | ✅ Pegar (con respaldo si el navegador bloquea el portapapeles) · ❌ pegado especial | Nativo (`PASTE_NODE`, `paste`) | S |
| Cortar | Corta el tema con su rama | ✅ | Nativo (`CUT_NODE`) | S |
| Copiar | Copia el tema con su rama | ✅ | Nativo (`copy`) | S |
| Copiar formato | Copia el estilo de un tema y lo aplica a otros | ✅ de un solo uso; Esc cancela | Nativo (plugin `painter`) | S |

### 2.2 Insertar
| Función | Qué hace | Estado | simple-mind-map | Esfuerzo |
|---|---|---|---|---|
| Tema (+ desplegable) | Tema al mismo nivel; el desplegable inserta antes, después o como tema padre | ✅ (Tema antes = comando propio `INSERT_NODE_BEFORE`, Shift+Enter) | Nativo (`INSERT_NODE`, `INSERT_PARENT_NODE`) + propio | S |
| Subtema | Tema hijo | ✅ | Nativo | — |
| Llamada (Callout) | Nota flotante anclada a un tema, fuera de la jerarquía | ✅ insertar, editar, mover, eliminar · ❌ subtemas en la llamada | Propio (`_callouts` + capa de dibujo con conector) | L |
| Relación | Flecha curva entre dos temas cualesquiera, con texto | ✅ dibujar, unir 2 seleccionados, texto, eliminar | Nativo (plugin `associativeLine`) | M |
| Límite (+ desplegable) | Marco alrededor de una rama, con varias formas | ✅ 5 estilos, texto, eliminar · ❌ formas tipo nube | Nativo (plugin `outerFrame`) | M |

### 2.3 Marcadores del mapa
| Función | Qué hace | Estado | simple-mind-map | Esfuerzo |
|---|---|---|---|---|
| Marcadores de icono | Iconos de prioridad, progreso, banderas, emoticonos… | ✅ panel y desplegable en la cinta | Nativo (datos `icon`) | S |
| Marcadores de texto | Etiquetas de texto agrupadas por categorías, para filtrar | ✅ categorías con color, diálogo, panel y desplegable · ❌ filtrar | Parcial (datos `tag`; las categorías son propias, en `root.data._textMarkers`) | M |
| Información de tarea | Prioridad, % completado, fecha de inicio y fin, duración, recursos | ✅ panel y etiqueta en el tema | Propio (`_task` + extensión `nodeInnerPostfixList` + panel) | L |

### 2.4 Elementos del tema
| Función | Qué hace | Estado | simple-mind-map | Esfuerzo |
|---|---|---|---|---|
| Hipervínculo | URL o vínculo a otro tema o mapa | ✅ URL (Ctrl+K), solo http/https/mailto · ❌ vínculo a otro tema o mapa | Nativo (`SET_NODE_HYPERLINK`) | S |
| Adjunto | Archivo adjunto al tema | ✅ API de archivos, descarga segura | Nativo (`SET_NODE_ATTACHMENT`); falta guardar archivos en el backend | M |
| Notas | Texto enriquecido largo asociado al tema | 🟡 panel Notas con texto plano · ❌ texto enriquecido | Nativo (`SET_NODE_NOTE`); falta el editor | M |
| Imagen | Imagen dentro del tema, redimensionable | ✅ PNG/JPEG/GIF/WebP, se reducen a 1024 px | Nativo (`SET_NODE_IMAGE`, `nodeImgAdjust`, `nodeBase64ImageStorage`) | M |

### 2.5 Formato
| Función | Qué hace | Estado | simple-mind-map | Esfuerzo |
|---|---|---|---|---|
| Fuente y tamaño | Selectores de familia y tamaño | ✅ reflejan el tema seleccionado | Nativo (`SET_NODE_STYLE`) | S |
| Agrandar / reducir fuente | A▲ A▼ | ✅ recorren la lista de tamaños | Nativo | S |
| Negrita, cursiva, subrayado, tachado | Formato del texto del tema | ✅ Ctrl+B/I/U (Ctrl+I deja de ser "ajustar") | Nativo (`SET_NODE_STYLE`, `richText`) | S |
| Color de relleno / línea / fuente | Selectores de color | ✅ paleta, último color, Automático y "Más colores…" | Nativo | M (incluye un componente selector de color) |
| Alineación del texto | Izquierda, centro, derecha | ✅ | Nativo (`textAlign`) | S |

### 2.6 Estilo
| Función | Qué hace | Estado | simple-mind-map | Esfuerzo |
|---|---|---|---|---|
| Estilo del tema | Galería: forma (rectángulo, redondeado, cápsula, línea…), relleno, sombra | 🟡 galería de 9 formas · ❌ sombra y estilos predefinidos | Nativo (`SET_NODE_SHAPE`, `SET_NODE_STYLES`) | M |

### 2.7 Edición
| Función | Qué hace | Estado | simple-mind-map | Esfuerzo |
|---|---|---|---|---|
| Dividir | Convierte un tema de varias líneas en varios temas | ✅ | Propio (`SPLIT_TOPICS`) | S |
| Seleccionar (+ desplegable) | Seleccionar todo, solo hermanos, por nivel, por marcador | ✅ todo, hermanos, nivel, rama, mismos marcadores | Parcial (`SELECT_ALL`; el resto es propio) | M |
| Limpiar (+ desplegable) | Quitar formato, marcadores, notas, vínculos… | ✅ | Propio (`CLEAR_TOPICS`, usa `removeCustomStyles`) | S |

---

## 3. Arquitectura antes de crecer

La cinta va a pasar de ~15 botones a ~60. Para que no se convierta en HTML duplicado y frágil:

1. **Registro de comandos (`commands.js`).** Cada acción se define en un solo sitio: `id`, etiqueta, icono, atajo, `isEnabled(state)` y `run(app)`. Esa definición la usan la cinta, la barra de acceso rápido, el menú contextual y los atajos de teclado.
2. **Cinta declarativa (`ribbon.js`).** Pestañas → grupos → botones (grandes, pequeños, desplegables, selectores de color), descritos como datos. El HTML se genera con Alpine a partir de esa estructura.
3. **Estado de selección centralizado.** El tema activo, sus estilos y sus marcadores alimentan los estados de la cinta, como "Negrita activa", la fuente actual o el botón desactivado.
4. **Modelo de datos versionado.** Información de tarea y marcadores de texto se guardan en `node.data` con un `schemaVersion` en el mapa, y hay migraciones al abrir (igual que con los mapas `default` → `mindmanager`).
5. **Adjuntos e imágenes.** Las imágenes van en base64 en el mapa hasta cierto tamaño; los adjuntos van por una nueva API `/api/maps/:id/files` con almacenamiento en disco.
6. **Pruebas.** Migrar `tests/e2e-frontend.js` a `@playwright/test`, con un archivo por grupo de la cinta, fixtures que crean y borran mapas, y ejecución en Chromium y Firefox. Configurar GitHub Actions para correrlas en cada push.

---

## 4. Plan por fases (pestaña Inicio)

Cada fase termina con: plan de pruebas → pruebas e2e automatizadas → todas en verde → commit.

| Fase | Contenido | Esfuerzo estimado |
|---|---|---|
| **0. Cimientos** ✅ | Registro de comandos, cinta declarativa, estado de selección, migración a `@playwright/test` + CI. Reorganizar la pestaña Inicio con los grupos de MindManager. Sustituir el logo (cerebro estilizado). | M |
| **1. Portapapeles e Insertar básico** ✅ | Pegar/Cortar/Copiar, Copiar formato, desplegable de Tema (antes, después, padre). Pendiente: pegado especial. | S–M |
| **2. Formato y Estilo** ✅ | Fuente, tamaño, B/I/U/S, colores, alineación, galería de formas. Pendiente: sombra y estilos predefinidos de tema. | M |
| **3. Elementos del tema** ✅ | Hipervínculo, Notas (panel), Imagen, Adjunto con API de archivos; saneado de mapas al abrirlos. Pendiente: notas con formato y vínculos a temas. | M–L |
| **4. Relación y Límite** ✅ | Plugins `associativeLine` y `outerFrame` con sus desplegables; 2 errores de la librería corregidos. Pendiente: formato de la relación (color, grosor) y formas de límite tipo nube. | M |
| **5. Marcadores** ✅ | Desplegable de iconos en la cinta (prioridad y progreso excluyentes), marcadores de texto con categorías: diálogo, panel, desplegable; renombrar, recolorear y borrar se aplican a todo el mapa en un paso deshacible. Pendiente: filtrar por marcador (Vista) y cambiar la prioridad con clic en el icono del tema. | M |
| **6. Edición** ✅ | Dividir (un tema por línea), Seleccionar (todo, hermanos, mismo nivel, rama, mismos marcadores), Limpiar (formato, marcadores, notas, vínculos, todo). Además: biblioteca de iconos propia (banderas, semáforo, caras, flechas, símbolos, personas) con nombres en español y buscador; los iconos de la librería quedan como "clásicos". Pendiente: Buscar y reemplazar. | M |
| **7. Información de tarea** ✅ | Panel "Info. de tarea": prioridad y % completado (son los iconos de prioridad y progreso), inicio, vencimiento, duración, hito y recursos; etiqueta en el tema (roja si vence, verde si está completada) con la extensión `nodeInnerPostfixList` de la librería; datos en `_task`. Pendiente: vista de Gantt, calendario laborable y filtrar por recurso. | L |
| **11. Plantillas (Reuniones y Proyectos)** ✅ | Galería "Nuevo desde plantilla" con categorías y vista previa; 19 plantillas de serie clonadas de MindManager (10 de reuniones y 9 de proyectos; contenido propio en español) con marcadores, información de tarea con fechas relativas al día de creación y llamadas; "Guardar como plantilla" (API `/api/templates`), con opción de quitar fechas y recursos; diseños Organigrama, Línea de tiempo y Espina de pez; validación de título y forma de los datos en la API. | L |
| **12. Plantillas (Estrategia, Personal y diseños especiales)** ✅ | 31 plantillas más (50 en total): 15 de estrategia y análisis (DAFO, PEST, PESTEL, DESTEP, 5 fuerzas, plan estratégico, de negocio y de marketing, Canvas, cuadro de mando, coste-beneficio, 5 porqués, comparar, SIPOC, casos de uso), 10 personales (tareas, semana, planificador vital, objetivo SMART, búsqueda de empleo, currículum, autoevaluación, viaje, escritura, estudio) y 6 con diseño especial (organigrama, EDT, líneas de tiempo, espinas de pez 6M y de servicios). Buscador en la galería (sin tildes ni mayúsculas) y vistas previas según el diseño. Corregido un error de autoguardado: al cambiar de mapa justo después de editar se perdía la edición o el mapa anterior sobrescribía el nuevo. | M |
| **13. Diagramas** ✅ | Motor de diagramas (`diagrams.js`): la definición va en el tema central (`_diagram`), que hace de título centrado encima; sus hijos se colocan libremente con la posición propia de la librería (`customLeft/customTop`, coordenadas fijas gracias a `initRootNodePosition`, así no dependen del tamaño de la ventana). Fondo en una capa detrás de los temas generado desde una única geometría (también la vista previa de la galería). Tipos: matriz con ejes, Venn de 2 y 3 círculos (zonas por combinación), embudo, cebolla, cuarto de círculo, carriles horizontales/verticales y mapa conceptual (relaciones con texto). Reglas por zona (SmartRules): icono, relleno (sin degradado, con texto legible) y tamaño de letra, aplicadas en el mismo paso del historial que el movimiento o la inserción. Arrastre propio en diagramas (`beforeDragEnd`): hueco → posición; sobre un tema → subtema; subtema a un hueco → tema del diagrama. Doble clic en un hueco añade un tema y en un rótulo edita la zona. 17 plantillas (67 en total); también en el HTML interactivo. No se clonan las 3 que no son diagramas: balance previsional y previsión de ventas (necesitan fórmulas) y el panel de Outlook. Pendiente: editar reglas desde la interfaz, añadir/quitar zonas y redimensionar el diagrama. | L |
| **14. Vista: Esquema y Presentación** ✅ | Vista Esquema (`views.js`): el mismo mapa como lista con sangría encima del lienzo, que sigue vivo debajo; las filas son los temas de las ramas desplegadas y todo pasa por los comandos de siempre (historial, autoguardado, búsqueda y filtro iguales en las dos vistas). Clic, Ctrl+clic y Mayús+clic; teclado (↑ ↓ Inicio Fin, ← → contraer/desplegar, Enter, Mayús+Enter, Tab, F2); edición en la fila (texto escapado), iconos, marcadores de texto y columnas de Información de tarea. La librería solo atiende atajos con el foco en `body` o en sus "clases de edición": el esquema se registra con `addEditNodeClass`. Subir/Bajar de nivel (Alt+Mayús+← →, también en el mapa; varios temas a la vez, en un paso del historial). Botones Mapa/Esquema en la barra de estado. Presentación con el plugin `Demonstrate`: pantalla completa propia (la del plugin usa APIs con prefijo), barra con anterior/siguiente/salir, teclas de mando (AvPág, RePág, Espacio, Inicio, Fin); al salir se recupera la vista y el encuadre, y el autoguardado espera al final (si no, guardaba el mapa contraído). Corregido: `init()` se ejecutaba dos veces (Alpine ya lo llama solo y además había `x-init`). Pendiente: Gantt, mostrar por nivel, enfoque en tema y presentación en el HTML exportado. | L |
| **10. Exportar HTML interactivo** ✅ | Un único .html de solo lectura (como el HTML5 Interactive Map de MindManager): librería minificada incrustada y cargada como módulo desde un Blob, tema y extensiones compartidos (`theme.js`), datos como JSON escapado, CSP sin red, mapa saneado al abrirlo; desplegar/contraer ramas, expandir/contraer todo, ajustar y zoom. Sin adjuntos (están en el servidor). | M |
| **9. Vista: Buscar y Filtro** ✅ | Barra Buscar/Reemplazar (Ctrl+F, Ctrl+H) propia: sin distinguir tildes ni mayúsculas (opción "Aa"), también en notas y en ramas contraídas; reemplazo escapado y en una entrada de historial (el plugin `search` de la librería reemplazaba dentro del HTML y sin escapar). Panel Filtro: texto, iconos, marcadores de texto, recursos y estado de la tarea, con "todos/alguno"; atenúa lo que no cumple sin tocar el mapa. Pendiente: buscar en marcadores y guardar filtros con nombre. | M |
| **8. Llamadas** ✅ | Notas flotantes ancladas a un tema (`_callouts`), pintadas en una capa propia del lienzo con conector: insertar, editar (doble clic), mover arrastrando, eliminar (Supr); salen en las exportaciones. Pendiente: subtemas dentro de una llamada y temas flotantes sin ancla. | L |

### Deuda técnica detectada en la Fase 0
| Problema | Impacto | Propuesta |
|---|---|---|
| `vendor/simple-mind-map.umd.min.js` pesa 6,7 MB y **no está minificado**: es un build de desarrollo de webpack con `eval()`, y así viene publicado en npm. | Carga y parseo lentos en cada visita. | El paquete incluye `simpleMindMap.esm.min.js` (1,5 MB) con los mismos 21 plugins. Medir con rigor el tiempo de carga antes de cambiar, porque la primera medición fue ruidosa. |
| La instancia de `mindMap` vive dentro del proxy reactivo de Alpine. | Cada acceso interno de la librería pasa por el seguimiento de dependencias de Alpine; posible sobrecoste en mapas grandes. | Guardarla fuera de la reactividad (variable de cierre + `getMindMap()`) y medir antes y después. |
| ~~Alpine.js se cargaba desde un CDN~~ ✅ resuelto en la Fase 2 | La app no funcionaba sin conexión y las pruebas fallaban si el CDN tardaba. | Servido en local (public/vendor/alpine-3.14.3.min.js); una prueba impide volver a depender de dominios externos. |
| Adjuntos huérfanos: al quitar un adjunto de un tema el archivo sigue en disco hasta que se borra el mapa (no se borra al momento para que Deshacer funcione). | Espacio en disco. | Limpieza periódica: borrar archivos que ningún tema del mapa referencia desde hace N días. |
| Parches sobre simple-mind-map 0.14.0-fix.3 (en `mindmap-extensions.js`): `patchLibraryBugs` (error JS al terminar una relación), `guardTextEditBoxes` (XSS al editar textos de relación/límite), `stripTransientHistoryFlags` (con el equipo lento, Deshacer no quitaba un tema recién insertado porque el historial guardaba la marca `inserting`) y `bindEscapeToEndEditing` (Esc no terminaba la edición de un tema y los atajos dejaban de responder). | Al actualizar la librería pueden dejar de aplicar o volverse innecesarios. | Revisar los parches al actualizar; las pruebas de regresión fallan si el error vuelve. Valorar reportarlos al proyecto original. |
| simple-mind-map trata como **estilo** cualquier campo del tema que no conozca, salvo los que empiezan por `_`. | Un dato propio sin `_` lo borra "Quitar formato" y lo copia "Copiar formato". Le pasaba a las categorías de marcadores de la Fase 5. | **Regla:** todo dato propio en `node.data` empieza por `_` (p. ej. `_textMarkers`; la Información de tarea de la Fase 7 también). Los mapas con `textMarkers` se migran al abrirlos. |
| Firefox + Playwright 1.63 es inestable en paralelo en Windows. | Pruebas lentas e intermitentes. | Mitigado con `workers: 1` en el proyecto Firefox. Revisar al actualizar Playwright. |

**Siguientes pestañas (fuera de este plan, por definir):**
- **Insertar:** tema flotante, imagen desde biblioteca y otros elementos.
- **Formato:** temas visuales del mapa, diseño y estructura.
- **Revisar:** comentarios y control de cambios.
- **Vista:** ~~vista Esquema~~ ✅ y ~~presentación~~ ✅ (Fase 14), mostrar/ocultar por nivel, enfoque en tema.
- **Exportar:** ~~HTML interactivo~~ ✅ (Fase 10), Word, Markdown, XMind (nativo en simple-mind-map).
- **Herramientas:** opciones y plantillas.
- **Paneles:** Biblioteca, Búsqueda (plugin `search`), Partes del mapa.
- **Barra de documentos:** varios mapas abiertos en pestañas.
