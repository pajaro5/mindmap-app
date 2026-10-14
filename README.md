# Mindmap App

Aplicación web local para crear y editar mapas mentales. Los mapas se guardan automáticamente en una base de datos SQLite.

## Funcionalidades

Interfaz inspirada en MindManager: cinta de opciones tipo Office (Inicio, Vista, Exportar), panel de tareas a la derecha y barra de estado con zoom.

- Crear, renombrar y eliminar mapas desde el panel **Mis mapas**.
- Editor visual de nodos basado en [simple-mind-map](https://github.com/wanglin2/mind-map), con un tema propio (`mindmanager`): tema central azul, temas principales verdes y ramas curvas.
- Dos diseños de mapa: **Radial** (por defecto) y **Árbol**.
- Insertar subtemas y temas (después, antes con Shift+Enter, o tema padre), eliminar, deshacer y rehacer desde la cinta o con el teclado.
- Portapapeles: cortar, copiar, pegar (también texto de otras aplicaciones) y copiar formato.
- Formato de los temas: fuente, tamaño, negrita/cursiva/subrayado/tachado (Ctrl+B/I/U), colores de relleno, línea y fuente, alineación y forma del tema.
- Elementos del tema: hipervínculos (Ctrl+K), notas (panel Notas), imágenes y archivos adjuntos.
- Llamadas: notas flotantes ancladas a un tema, que se pueden mover arrastrando (doble clic para editarlas).
- Información de tarea (panel **Info. de tarea**): prioridad, % completado, inicio, vencimiento, hito y recursos. Se muestra junto al tema, en rojo si está vencida.
- Edición: dividir un tema de varias líneas, seleccionar (todo, hermanos, mismo nivel, rama, mismos marcadores) y limpiar (formato, marcadores, notas, vínculos o todo).
- Relaciones (flechas entre temas cualesquiera, con texto) y límites (marcos alrededor de temas, con 5 estilos).
- Funciona sin conexión: todas las librerías se sirven en local.
- Marcadores de icono desde la cinta o el panel **Marcadores**: prioridad, progreso, banderas, semáforo, caras, flechas, símbolos y personas, con buscador.
- Marcadores de texto agrupados en categorías con color (por ejemplo «Responsable: Ana, Juan»). Renombrar o recolorear una categoría actualiza todos los temas del mapa.
- Zoom con botones, slider y "ajustar a la ventana".
- Buscar y reemplazar (Ctrl+F, Ctrl+H), sin distinguir tildes ni mayúsculas.
- Filtro (pestaña Vista): muestra los temas que cumplen unos criterios (texto, marcadores, recursos, tareas vencidas…) y atenúa el resto.
- Autoguardado mientras editas.
- Exportación a **PNG**, **PDF** y **HTML interactivo**: un único archivo que se abre en cualquier navegador sin conexión, de solo lectura, con ramas que se despliegan y contraen.

## Requisitos

- [Node.js](https://nodejs.org/) 22 o superior (requerido por better-sqlite3).

## Instalación y uso

```bash
git clone https://github.com/pajaro5/mindmap-app.git
cd mindmap-app
npm install
npm start
```

Abre **http://localhost:3001** en el navegador.

Para usar otro puerto, define la variable `PORT`:

```bash
# macOS / Linux
PORT=4000 npm start

# Windows (PowerShell)
$env:PORT=4000; npm start
```

La base de datos se crea automáticamente en `data/mindmaps.db` la primera vez que arrancas el servidor. No se incluye en el repositorio.

## Estructura

```
server/
  index.js    Servidor Express y API REST
  db.js       Conexión y esquema SQLite (better-sqlite3)
public/
  index.html      Interfaz (Alpine.js); la cinta se genera desde ribbon.js
  js/commands.js  Registro de comandos: cada acción definida una sola vez
  js/ribbon.js    Cinta declarativa (pestañas → grupos → botones) y barra de acceso rápido
  js/icons.js     Iconos SVG y logo
  js/markers.js   Marcadores de icono y de texto (modelo y reglas)
  js/icon-library.js  Biblioteca de iconos (grupos, nombres, búsqueda)
  js/task-info.js     Información de tarea (modelo, validación y etiqueta en el tema)
  js/callouts.js      Llamadas (modelo y capa de dibujo)
  js/search-filter.js Buscar / Reemplazar y Filtro
  js/theme.js         Tema visual y preparación de la librería (compartido con el HTML exportado)
  js/export-html.js   Exportar a HTML interactivo
  js/viewer.js        Visor que va dentro del HTML exportado
  js/app.js       Estado de la app, mapa y persistencia
  css/            Estilos
  vendor/         simple-mind-map (build UMD para la app; build ESM minificado para el HTML exportado) y Alpine
tests/e2e/        Pruebas end-to-end (@playwright/test), un archivo por área
docs/             Plan de producto
data/             Base de datos SQLite (ignorada por git)
```

### Añadir una función a la cinta

1. Define el comando en `public/js/commands.js` (etiqueta, icono, atajo, `enabled`, `run`).
2. Colócalo en un grupo de `public/js/ribbon.js`.
3. Añade su prueba en `tests/e2e/`. La prueba de la cinta falla si hay un comando sin botón o un botón sin comando.

## API

| Método   | Ruta            | Descripción                                   |
|----------|-----------------|-----------------------------------------------|
| `GET`    | `/api/maps`     | Lista los mapas (solo metadatos)              |
| `POST`   | `/api/maps`     | Crea un mapa. Body opcional: `{ "title" }`    |
| `GET`    | `/api/maps/:id` | Obtiene un mapa completo                      |
| `PUT`    | `/api/maps/:id` | Actualiza `title` y/o `data`                  |
| `DELETE` | `/api/maps/:id` | Elimina un mapa y sus adjuntos                |
| `POST`   | `/api/maps/:id/files` | Sube un adjunto (cuerpo binario; nombre en la cabecera `X-File-Name`) |
| `GET`    | `/api/files/:fileId`  | Descarga un adjunto (siempre como descarga, nunca se muestra en el navegador) |

Los adjuntos se guardan en `data/files/` (configurable con `FILES_DIR`; tamaño máximo con `MAX_FILE_BYTES`, 25 MB por defecto).

## Pruebas

Las pruebas end-to-end usan `@playwright/test` en **Chromium y Firefox**. Playwright arranca su propio servidor en el puerto 3101 con una base de datos **en memoria**, así que no hace falta tener la app abierta y las pruebas nunca tocan tus mapas.

```bash
npx playwright install chromium firefox   # solo la primera vez
npm test                                  # todas las pruebas, ambos navegadores
npm run test:chromium                     # solo Chromium (más rápido)
npm run test:report                       # ver el informe HTML de la última ejecución
```

En GitHub, el workflow `.github/workflows/e2e.yml` ejecuta las pruebas en cada push a `main` y en cada pull request.

Firefox se ejecuta con un solo worker: en paralelo, Playwright 1.63 falla de forma intermitente al cerrar contextos de Firefox.

## Tecnologías

- **Backend:** Node.js, Express 5, better-sqlite3
- **Frontend:** Alpine.js, simple-mind-map
- **Pruebas:** @playwright/test (Chromium + Firefox), GitHub Actions
