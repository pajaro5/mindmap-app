# Mindmap App

Aplicación web local para crear y editar mapas mentales. Los mapas se guardan automáticamente en una base de datos SQLite.

## Funcionalidades

Interfaz inspirada en MindManager: cinta de opciones tipo Office (Inicio, Vista, Exportar), panel de tareas a la derecha y barra de estado con zoom.

- Crear, renombrar y eliminar mapas desde el panel **Mis mapas**.
- Editor visual de nodos basado en [simple-mind-map](https://github.com/wanglin2/mind-map), con un tema propio (`mindmanager`): tema central azul, temas principales verdes y ramas curvas.
- Dos diseños de mapa: **Radial** (por defecto) y **Árbol**.
- Insertar subtemas y temas, eliminar, deshacer y rehacer desde la cinta o con el teclado (Tab, Enter, Supr).
- Panel **Marcadores** para asignar iconos de prioridad, progreso, emojis y marcas a los temas.
- Zoom con botones, slider y "ajustar a la ventana".
- Autoguardado mientras editas.
- Exportación a **PNG** y **PDF**.

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
  index.html  Interfaz (Alpine.js)
  js/app.js   Lógica del frontend
  css/        Estilos
  vendor/     simple-mind-map (build UMD)
tests/
  e2e-frontend.js  Pruebas end-to-end con Playwright
data/         Base de datos SQLite (ignorada por git)
```

## API

| Método   | Ruta            | Descripción                                   |
|----------|-----------------|-----------------------------------------------|
| `GET`    | `/api/maps`     | Lista los mapas (solo metadatos)              |
| `POST`   | `/api/maps`     | Crea un mapa. Body opcional: `{ "title" }`    |
| `GET`    | `/api/maps/:id` | Obtiene un mapa completo                      |
| `PUT`    | `/api/maps/:id` | Actualiza `title` y/o `data`                  |
| `DELETE` | `/api/maps/:id` | Elimina un mapa                               |

## Pruebas

Las pruebas end-to-end usan Playwright y necesitan el servidor en marcha:

```bash
npx playwright install chromium   # solo la primera vez
npm start                         # en otra terminal
npm run test:e2e
```

Para probar contra otra URL, define `BASE_URL` (por defecto `http://localhost:3001`).

## Tecnologías

- **Backend:** Node.js, Express 5, better-sqlite3
- **Frontend:** Alpine.js, simple-mind-map
- **Pruebas:** Playwright
