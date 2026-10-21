// Notas con formato (negrita, cursiva, subrayado, tachado, listas y vínculos).
//
// Cada tema guarda su nota dos veces:
//   note       texto plano: lo usan la librería (icono y tooltip), Buscar, el Filtro y los
//              mapas antiguos; sigue siendo la referencia si no hay formato
//   _noteHtml  HTML con formato, solo con las etiquetas de la lista blanca (se sanea al
//              guardarlo y al abrir el mapa, que puede venir de fuera de la app)
// Si la nota no tiene formato, solo se guarda `note`.

const NOTE_HTML_KEY = '_noteHtml'
const NOTE_HTML_MAX = 50000
// Etiqueta permitida → etiqueta con la que se guarda
const NOTE_TAGS = { P: 'p', DIV: 'p', BR: 'br', B: 'b', STRONG: 'b', I: 'i', EM: 'i', U: 'u', S: 's', STRIKE: 's', DEL: 's', UL: 'ul', OL: 'ol', LI: 'li', A: 'a' }
const NOTE_INLINE = ['b', 'i', 'u', 's', 'a']

// HTML saneado: solo las etiquetas permitidas, sin atributos salvo un href seguro en <a>.
// Lo demás se quita conservando su texto. Se parsea con DOMParser (documento inerte: no
// carga imágenes ni ejecuta nada).
function sanitizeNoteHtml(html) {
  const doc = new DOMParser().parseFromString(`<body>${String(html || '').slice(0, NOTE_HTML_MAX * 2)}</body>`, 'text/html')
  const out = document.implementation.createHTMLDocument('')
  const copy = (from, to) => {
    for (const child of from.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        to.appendChild(out.createTextNode(child.textContent))
        continue
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue
      // Contenido que no es texto del usuario: fuera, con todo lo que tenga dentro
      if (['SCRIPT', 'STYLE', 'TEMPLATE', 'IFRAME', 'OBJECT', 'NOSCRIPT', 'SVG', 'MATH', 'HEAD', 'TITLE'].includes(child.tagName)) continue
      const tag = NOTE_TAGS[child.tagName]
      if (!tag) {
        copy(child, to)
        continue
      }
      const el = out.createElement(tag)
      if (tag === 'a') {
        const href = child.getAttribute('href') || ''
        if (!isSafeHyperlink(href) || internalLinkOf(href)) {
          copy(child, to)
          continue
        }
        el.setAttribute('href', href)
        el.setAttribute('target', '_blank')
        el.setAttribute('rel', 'noopener noreferrer')
      }
      copy(child, el)
      // Párrafos vacíos: restos de HTML no válido (Chromium mete las listas dentro de un <p>,
      // y al analizarlo quedan <p></p> sueltos). Un párrafo en blanco a propósito lleva <br>.
      if (tag === 'p' && !el.childNodes.length) continue
      to.appendChild(el)
    }
  }
  copy(doc.body, out.body)
  const html2 = out.body.innerHTML
  return html2.length > NOTE_HTML_MAX ? '' : html2
}

// Texto plano de una nota con formato: un párrafo o elemento de lista por línea
function noteHtmlToText(html) {
  const doc = new DOMParser().parseFromString(`<body>${sanitizeNoteHtml(html)}</body>`, 'text/html')
  const lines = []
  let current = ''
  const flush = () => { lines.push(current); current = '' }
  const walk = (node, list) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) { current += child.textContent; continue }
      const tag = child.tagName
      if (tag === 'BR') { flush(); continue }
      if (tag === 'UL' || tag === 'OL') {
        if (current) flush()
        walk(child, { ordered: tag === 'OL', index: 0 })
        continue
      }
      if (tag === 'LI') {
        if (current) flush()
        list.index++
        current = list.ordered ? `${list.index}. ` : '- '
        walk(child, list)
        flush()
        continue
      }
      if (tag === 'P') {
        if (current) flush()
        walk(child, list)
        flush()
        continue
      }
      walk(child, list)
    }
  }
  walk(doc.body, null)
  if (current) flush()
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

// HTML de una nota en texto plano (para abrirla en el editor)
function noteTextToHtml(text) {
  return String(text || '').split('\n').map(line => `<p>${line ? escapeXml(line) : '<br>'}</p>`).join('')
}

// ¿Tiene la nota algo que el texto plano no conserva? (si no, no se guarda el HTML)
function noteHasFormatting(html) {
  return /<(b|i|u|s|ul|ol|a)\b/i.test(sanitizeNoteHtml(html))
}

// Lo que se guarda en el tema para el HTML del editor: { note, _noteHtml }
function noteDataFromHtml(html) {
  const clean = sanitizeNoteHtml(html)
  const text = noteHtmlToText(clean)
  return {
    note: text || undefined,
    [NOTE_HTML_KEY]: text && noteHasFormatting(clean) ? clean : undefined
  }
}

// HTML que muestra una nota (con formato si lo tiene)
function noteDisplayHtml(data) {
  if (!data || !data.note) return ''
  return data[NOTE_HTML_KEY] ? sanitizeNoteHtml(data[NOTE_HTML_KEY]) : noteTextToHtml(data.note)
}

// ---- Markdown de una nota con formato (exportar a Markdown) ----
function noteHtmlToMarkdown(html, escape) {
  const doc = new DOMParser().parseFromString(`<body>${sanitizeNoteHtml(html)}</body>`, 'text/html')
  const blocks = []
  const inline = node => [...node.childNodes].map(child => {
    if (child.nodeType === Node.TEXT_NODE) return escape(child.textContent)
    const inner = inline(child)
    switch (child.tagName) {
      case 'B': return inner.trim() ? `**${inner}**` : inner
      case 'I': return inner.trim() ? `*${inner}*` : inner
      case 'S': return inner.trim() ? `~~${inner}~~` : inner
      case 'U': return inner // Markdown no tiene subrayado
      case 'A': return `[${inner}](<${child.getAttribute('href').replace(/[<>\s]/g, encodeURIComponent)}>)`
      case 'BR': return '  \n'
      default: return inner
    }
  }).join('')
  const block = node => {
    let pending = []
    const flushInline = () => {
      const text = inline({ childNodes: pending }).trim()
      if (text) blocks.push(text)
      pending = []
    }
    for (const child of node.childNodes) {
      const tag = child.tagName
      if (tag === 'P') { flushInline(); const t = inline(child).trim(); if (t) blocks.push(t) }
      else if (tag === 'UL' || tag === 'OL') {
        flushInline()
        const items = [...child.children].filter(li => li.tagName === 'LI')
          .map((li, i) => `${tag === 'OL' ? `${i + 1}.` : '-'} ${inline(li).trim()}`)
        if (items.length) blocks.push(items.join('\n'))
      } else pending.push(child)
    }
    flushInline()
  }
  block(doc.body)
  return blocks.join('\n\n')
}

// ---- Tooltip de la nota (sustituye al de la librería, que solo muestra texto plano) ----
function createNoteTooltip() {
  let el = null
  return {
    show(note, left, top, node) {
      if (!el) {
        el = document.createElement('div')
        el.className = 'note-tooltip'
        document.body.appendChild(el)
      }
      el.innerHTML = noteDisplayHtml(node ? node.getData() : { note })
      el.style.left = `${left}px`
      el.style.top = `${top}px`
      el.style.display = 'block'
    },
    hide() {
      if (el) el.style.display = 'none'
    }
  }
}
