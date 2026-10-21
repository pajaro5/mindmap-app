# Cómo crear un mapa mental para esta app

Guía para quien (persona o IA) vaya a **generar un mapa mental como archivo** que luego se cargará
en la app. El mapa es un archivo **JSON** (UTF-8, sin comentarios, sin comas finales) y, si
lleva capturas de pantalla o adjuntos, una carpeta con esos archivos al lado (ver §2 y §7).

> Regla de oro: si dudas si un campo es válido, **no lo pongas**. La app sanea al abrir el mapa y
> descarta (en silencio) cualquier valor que no reconozca o que no sea seguro; lo mínimo
> (`text` + `children`) siempre funciona.

---

## 1. Estructura del archivo

```json
{
  "title": "Título del mapa",
  "data": {
    "layout": "mindMap",
    "root": {
      "data": { "text": "Tema central", "expand": true },
      "children": [
        {
          "data": { "text": "Tema principal 1", "expand": true },
          "children": [
            { "data": { "text": "Subtema 1.1" }, "children": [] }
          ]
        }
      ]
    }
  }
}
```

| Campo         | Obligatorio | Descripción |
|---------------|-------------|-------------|
| `title`       | sí          | Nombre del mapa. Texto, máx. 200 caracteres. |
| `data.layout` | no          | Disposición (ver §4). Por defecto `"mindMap"`. |
| `data.root`   | **sí**      | El tema central. Es un **nodo** (ver §2). |
| `data.theme`  | no          | Omítelo: la app aplica el tema por defecto. |

Cada **nodo** tiene siempre esta forma:

```json
{ "data": { "text": "…" }, "children": [ …nodos… ] }
```

- `data` es un objeto (obligatorio) con el contenido del tema.
- `children` es un array de nodos (puede ser `[]`). Profundidad máxima: 200 niveles.
- **No** pongas texto, iconos, etc. fuera de `data`.

---

## 2. Campos de `data` (contenido de un tema)

### Básicos (los que usarás casi siempre)

| Campo    | Tipo    | Ejemplo | Notas |
|----------|---------|---------|-------|
| `text`   | string  | `"Variables"` | Texto del tema. Corto (1–6 palabras), en **una sola línea**: un `\n` aquí no hace salto de línea (se muestra como espacio). Los caracteres `<`, `>`, `&` y comillas se muestran tal cual. |
| `expand` | boolean | `true`  | `false` = rama plegada al abrir. Por defecto `true`. |
| `note`   | string  | `"Una variable guarda un valor.\n\nEjemplo: x = 5"` | Nota del tema (texto plano). Aquí va la **explicación larga** del tutorial. `\n\n` separa párrafos. |

`note` es **texto plano**: no uses Markdown ni HTML dentro de `note` (se verían los símbolos).

### Nota con formato (opcional) — `_noteHtml`

Para negritas, listas o vínculos en la explicación, añade **además** de `note`:

| Campo       | Tipo   | Notas |
|-------------|--------|-------|
| `_noteHtml` | string | HTML con **solo** estas etiquetas: `p br b i u s ul ol li a`. En `<a>`, solo `href` con `https://`, `http://` o `mailto:`. Cualquier otra etiqueta o atributo se elimina (su texto se conserva). |

Reglas:
- `note` es obligatoria si hay `_noteHtml` y debe tener **el mismo texto sin formato** (se usa
  para buscar y para exportar a Word): un párrafo o elemento de lista por línea, con `- ` delante
  de cada viñeta y `1. `, `2. `… en las listas numeradas.
- Un párrafo por `<p>`; no metas listas dentro de `<p>`.
- Si la nota no necesita formato, no pongas `_noteHtml`.

```json
"note": "Pasos:\n1. Abrir el editor\n2. Escribir el código",
"_noteHtml": "<p><b>Pasos:</b></p><ol><li>Abrir el editor</li><li>Escribir el código</li></ol>"
```

Se ve con formato en el panel Notas, en el globo que aparece al pasar el ratón por el icono de
nota, en el HTML interactivo exportado y en Markdown.

### Iconos (marcadores) — `icon`

Array de identificadores `grupo_nombre`. Un tema puede tener varios, pero **solo uno por grupo**
en los grupos marcados como exclusivos (★).

| Grupo          | Identificadores |
|----------------|-----------------|
| Prioridad ★    | `priority_1` … `priority_9` |
| Progreso ★     | `progress_1` … `progress_8` (`progress_8` = completado; cada paso = 12,5 %) |
| Banderas ★     | `flag_red`, `flag_orange`, `flag_yellow`, `flag_green`, `flag_blue`, `flag_purple`, `flag_gray`, `flag_black` |
| Semáforo ★     | `traffic_red`, `traffic_amber`, `traffic_green` |
| Caras ★        | `face_happy`, `face_neutral`, `face_sad`, `face_angry`, `face_surprised`, `face_confused` |
| Flechas        | `arrow_up`, `arrow_down`, `arrow_left`, `arrow_right`, `arrow_rising`, `arrow_falling`, `arrow_repeat`, `arrow_both` |
| Símbolos       | `symbol_idea`, `symbol_question`, `symbol_warning`, `symbol_info`, `symbol_star`, `symbol_heart`, `symbol_check`, `symbol_cross`, `symbol_stop`, `symbol_pause`, `symbol_pin`, `symbol_lock`, `symbol_money`, `symbol_calendar`, `symbol_clock`, `symbol_mail`, `symbol_phone`, `symbol_document`, `symbol_home`, `symbol_search`, `symbol_target` |
| Personas       | `people_person`, `people_team`, `people_client`, `people_owner` |

```json
"icon": ["priority_1", "symbol_idea"]
```

Sugerencia para tutoriales: numera los pasos con `priority_1`, `priority_2`… y marca consejos con
`symbol_idea`, advertencias con `symbol_warning` y ejercicios con `symbol_question`.

### Etiquetas — `tag`

```json
"tag": [{ "text": "Básico", "style": { "fill": "#2f9e44" } }]
```

`fill` es un color hexadecimal de 6 dígitos (`#rrggbb`). Máx. 10 etiquetas por tema.

### Hipervínculo

| Campo            | Tipo   | Notas |
|------------------|--------|-------|
| `hyperlink`      | string | Solo `https://…`, `http://…` o `mailto:…`. Otro esquema se descarta. |
| `hyperlinkTitle` | string | Texto del tooltip (opcional). |

### Llamadas (globos de comentario) — `_callouts`

```json
"_callouts": [{ "text": "¡Ojo con esto!" }]
```

Máx. 10 por tema y 500 caracteres cada una. `id`, `dx`, `dy` son opcionales (la app los rellena).

### Resumen de una rama — `generalization`

Añade una llave con un texto de resumen que abarca el tema y toda su rama:

```json
"generalization": [{ "text": "Lo esencial" }]
```

### Relaciones entre temas (flechas que cruzan ramas)

1. Da un `uid` único (p. ej. un UUID) al tema **destino**.
2. En el tema **origen** añade `associativeLineTargets` con los `uid` destino y, opcionalmente,
   `associativeLineText` con el rótulo de cada relación.

```json
{ "data": { "text": "Bucles", "uid": "a1b2c3d4-0000-4000-8000-000000000001" }, "children": [] }
…
{ "data": {
    "text": "Listas",
    "associativeLineTargets": ["a1b2c3d4-0000-4000-8000-000000000001"],
    "associativeLineText": { "a1b2c3d4-0000-4000-8000-000000000001": "se recorren con" }
  }, "children": [] }
```

Cada `uid` debe ser único en todo el mapa. Si no hay relaciones, no pongas `uid` (la app los genera).

### Información de tarea — `_task` (solo si el mapa es un plan)

```json
"_task": { "start": "2026-11-02", "due": "2026-11-06", "milestone": false, "resources": ["Ana"] }
```

Fechas `AAAA-MM-DD`; `due` no puede ser anterior a `start`. La prioridad y el % completado **no**
van aquí: se expresan con los iconos `priority_N` y `progress_N`.

### Imágenes (capturas de pantalla) — `imageFile`

**No** incrustes la imagen en el JSON a mano. Guarda cada captura como archivo junto al JSON y
referénciala por ruta; al abrir el `.zip` (§7) la app la convierte en imagen del tema.

| Campo        | Tipo   | Notas |
|--------------|--------|-------|
| `imageFile`  | string | Ruta **relativa al JSON**, p. ej. `"capturas/02-menu.png"`. Formatos: PNG, JPEG, GIF, WebP. Máx. 10 MB por imagen. |
| `imageWidth` | number | Opcional. Ancho en px con el que se muestra en el mapa (el alto se calcula). Sin él, la app la muestra como miniatura pequeña. Para capturas: **320–480**. |
| `imageTitle` | string | Opcional. Texto alternativo / tooltip. Por defecto, el nombre del archivo. |

```json
{ "data": {
    "text": "Abrir el menú Archivo",
    "imageFile": "capturas/02-menu-archivo.png",
    "imageWidth": 400,
    "imageTitle": "Menú Archivo desplegado",
    "note": "Haz clic en Archivo, arriba a la izquierda. Se despliega el menú de la captura."
  }, "children": [] }
```

Recomendaciones para capturas:
- Una captura por tema, en el tema del paso que ilustra; la explicación, en `note`.
- Recórtalas a la zona relevante; si pasan de **1024 px** de lado, la app las reduce al abrirlas.
- PNG para pantallas con texto; JPEG si la captura es una foto o muy grande.
- **Todo el mapa, con imágenes, debe ocupar menos de 20 MB** (la app lo comprueba al abrirlo).
  Como orientación: 30–40 capturas PNG recortadas suelen caber de sobra.
- Nombra los archivos con el número de paso (`01-…`, `02-…`) y guárdalos en una carpeta `capturas/`.

### Archivos adjuntos (PDF, código, plantillas…) — `attachmentFile`

| Campo            | Tipo   | Notas |
|------------------|--------|-------|
| `attachmentFile` | string | Ruta relativa al JSON de cualquier archivo. Máx. 25 MB. Un adjunto por tema. |
| `attachmentName` | string | Opcional. Nombre que verá el usuario al descargarlo. |

Aparece un clip en el tema; al pulsarlo se descarga el archivo. Útil para “descarga el ejercicio”,
“plantilla de partida”, etc. Si el archivo es una imagen que se debe **ver** en el mapa, usa
`imageFile`, no `attachmentFile`.

### Iconos propios

No se pueden añadir iconos nuevos: usa solo los identificadores de la tabla de iconos. Si
necesitas un símbolo visual que no está, usa una etiqueta (`tag`) o una imagen (`imageFile`).

### Campos que NO debes generar

`image`, `imageSize`, `attachmentUrl` (los rellena la app a partir de `imageFile` y
`attachmentFile`), `customLeft`, `customTop`, `_diagram`, `_diagramRule`, `_mapFormat`,
`richText`, y cualquier estilo visual (colores, fuentes, formas). Dependen del servidor o de la
maquetación interna; la app los ignora o los gestiona ella misma.

---

## 3. Buenas prácticas para un tutorial en forma de mapa

1. **Tema central** = el título del tutorial (p. ej. `"Python desde cero"`).
2. **Temas principales** (nivel 1) = los módulos o capítulos, en orden. Entre 3 y 8.
   Usa `priority_1`, `priority_2`… para indicar el orden de lectura.
3. **Subtemas** (nivel 2–3) = conceptos concretos. No pases de 4 niveles de profundidad.
4. **Texto del tema corto**; la explicación va en `note`. Un tema = una idea.
5. Ejemplos, código y detalles largos → `note` (y `_noteHtml` si conviene resaltar o listar).
6. Consejos → `symbol_idea`; errores frecuentes → `symbol_warning`; ejercicios → `symbol_question`
   (y la solución en su nota); recursos externos → `hyperlink`.
7. Usa relaciones (§2) solo cuando aporten algo (p. ej. “requiere”, “se usa en”).
8. Pliega (`"expand": false`) ramas muy largas para que el mapa sea legible al abrirlo.
9. Si el tutorial tiene secciones avanzadas, márcalas con una etiqueta (`"Avanzado"`).

---

## 4. Disposiciones (`data.layout`)

| Valor                   | Aspecto |
|-------------------------|---------|
| `mindMap`               | Radial: ramas a ambos lados del centro (recomendado). |
| `logicalStructure`      | Árbol hacia la derecha. Bueno para secuencias de pasos. |
| `organizationStructure` | Organigrama (de arriba abajo). |
| `timeline`              | Línea de tiempo horizontal. |
| `fishbone`              | Espina de pescado (causa-efecto). |

---

## 5. Ejemplo completo

```json
{
  "title": "Tutorial: Git básico",
  "data": {
    "layout": "mindMap",
    "root": {
      "data": {
        "text": "Git básico",
        "note": "Mapa para aprender lo mínimo de Git en una tarde."
      },
      "children": [
        {
          "data": { "text": "1. Instalar y configurar", "icon": ["priority_1"] },
          "children": [
            {
              "data": {
                "text": "Instalar Git",
                "note": "Descárgalo de git-scm.com y comprueba la versión con: git --version",
                "imageFile": "capturas/01-descarga.png",
                "imageWidth": 400,
                "imageTitle": "Página de descargas de Git",
                "hyperlink": "https://git-scm.com/downloads",
                "hyperlinkTitle": "Descargas de Git"
              },
              "children": []
            },
            {
              "data": {
                "text": "Identidad",
                "note": "git config --global user.name \"Tu nombre\"\ngit config --global user.email \"tu@correo.com\"",
                "icon": ["symbol_warning"],
                "_callouts": [{ "text": "Hazlo antes del primer commit" }]
              },
              "children": []
            }
          ]
        },
        {
          "data": { "text": "2. Primer repositorio", "icon": ["priority_2"] },
          "children": [
            { "data": { "text": "git init", "note": "Crea un repositorio vacío en la carpeta actual." }, "children": [] },
            {
              "data": {
                "text": "Commit",
                "uid": "7f1c2e10-0000-4000-8000-000000000001",
                "note": "Dos pasos:\n1. git add .\n2. git commit -m \"Mensaje\"",
                "_noteHtml": "<p><b>Dos pasos:</b></p><ol><li>git add .</li><li>git commit -m \"Mensaje\"</li></ol>"
              },
              "children": []
            }
          ]
        },
        {
          "data": {
            "text": "3. Ramas",
            "icon": ["priority_3"],
            "tag": [{ "text": "Intermedio", "style": { "fill": "#f08c00" } }],
            "expand": false,
            "associativeLineTargets": ["7f1c2e10-0000-4000-8000-000000000001"],
            "associativeLineText": { "7f1c2e10-0000-4000-8000-000000000001": "parten de un" }
          },
          "children": [
            { "data": { "text": "git switch -c", "note": "Crea una rama y se cambia a ella." }, "children": [] },
            {
              "data": {
                "text": "Repositorio de práctica",
                "attachmentFile": "adjuntos/practica-ramas.zip",
                "attachmentName": "practica-ramas.zip"
              },
              "children": []
            },
            { "data": { "text": "git merge", "icon": ["symbol_idea"], "note": "Une otra rama en la actual." }, "children": [] },
            {
              "data": {
                "text": "Ejercicio",
                "icon": ["symbol_question"],
                "note": "Crea la rama 'prueba', haz un commit en ella y únela a main.\n\nSolución: git switch -c prueba → commit → git switch main → git merge prueba"
              },
              "children": []
            }
          ]
        }
      ]
    }
  }
}
```

---

## 6. Lista de comprobación antes de entregar

- [ ] Es JSON válido (sin comentarios, sin comas finales, comillas dobles, `\n` y `\"` escapados).
- [ ] Hay `title` y `data.root`; cada nodo tiene `data` (objeto) y `children` (array).
- [ ] Todos los iconos están en la tabla de §2 y no hay dos del mismo grupo exclusivo en un tema.
- [ ] Los colores son `#rrggbb`; las fechas, `AAAA-MM-DD`; los vínculos, `https://`/`mailto:`.
- [ ] Cada `uid` usado en `associativeLineTargets` existe en algún tema y es único.
- [ ] Ningún campo de la lista “NO debes generar”.
- [ ] Ningún `text` lleva `\n`; `note` es texto plano (sin Markdown ni HTML).
- [ ] Cada `_noteHtml` usa solo `p br b i u s ul ol li a` y su tema tiene `note` con el mismo texto.
- [ ] Cada `imageFile` / `attachmentFile` existe en la ruta indicada (relativa al JSON).
- [ ] El archivo se guarda con extensión `.json` y codificación UTF-8.

---

## 7. Qué entregar y cómo cargarlo en la app

Entrega **una carpeta** con el JSON y los archivos que referencia:

```
tutorial-git/
├── mapa.json
├── capturas/
│   ├── 01-instalador.png
│   └── 02-menu-archivo.png
└── adjuntos/
    └── ejercicio.zip
```

Para cargarlo en la app:

1. **Comprime la carpeta** en un `.zip` (en Windows: clic derecho › Enviar a › Carpeta comprimida).
   Si el mapa no tiene capturas ni adjuntos, basta con el `.json` suelto.
2. En la app: **Abrir** (barra de acceso rápido, `Ctrl+O`, pestaña Exportar › Archivo, o
   “Abrir archivo…” en Mis mapas), o **arrastra** el `.zip` sobre la ventana.

La app crea un mapa nuevo (nunca sobrescribe otro), incrusta las imágenes (reduciéndolas a
1024 px de lado), sube los adjuntos y lo abre. Si alguna ruta no existe o un archivo no se puede
usar, el mapa se abre igualmente y muestra la lista de avisos.

Notas:
- El `.json` puede llamarse `mapa.json` o tener cualquier nombre si es el único `.json` del `.zip`.
- Las rutas no distinguen mayúsculas si no hay coincidencia exacta.
- Sin `title`, el mapa toma el nombre del archivo.
- **Exportar › Guardar como archivo** produce este mismo formato (`.json`, o `.zip` con
  `adjuntos/` si el mapa tiene adjuntos), así que un mapa guardado se puede volver a abrir o
  compartir.
