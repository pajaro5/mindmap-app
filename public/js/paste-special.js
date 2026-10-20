// Pegado especial (Inicio › Pegar ▾): pegar texto como un solo tema o como un tema por línea,
// con la sangría o las viñetas marcando el nivel (lo que sale al copiar una lista de un
// documento, un correo o un esquema).

const PASTE_MAX_LINES = 500
const PASTE_MAX_LINE_LENGTH = 1000
const TAB_WIDTH = 4
// Viñetas y numeraciones que se quitan del principio de la línea
const BULLET_RE = /^(?:[-*+•◦▪‣·]|\d{1,3}[.)]|[a-z][.)])\s+/i

// Líneas no vacías del texto, sin espacios a los lados y recortadas a un tamaño razonable
function pasteLines(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter(line => line.trim())
    .slice(0, PASTE_MAX_LINES)
}

const indentOf = line => {
  let width = 0
  for (const ch of line) {
    if (ch === ' ') width++
    else if (ch === '\t') width += TAB_WIDTH
    else break
  }
  return width
}

// Árbol [{ text, children }] a partir de un texto con sangría: cada línea cuelga de la
// anterior con menos sangría. Las viñetas se quitan.
function parseOutlineText(text) {
  const roots = []
  const stack = [] // { indent, item }
  for (const raw of pasteLines(text)) {
    const indent = indentOf(raw)
    const content = raw.trim().replace(BULLET_RE, '').trim().slice(0, PASTE_MAX_LINE_LENGTH)
    if (!content) continue
    const item = { text: content, children: [] }
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop()
    if (stack.length) stack[stack.length - 1].item.children.push(item)
    else roots.push(item)
    stack.push({ indent, item })
  }
  return roots
}

// Todo el texto como un solo tema (una línea por párrafo)
function parseSingleTopicText(text) {
  const lines = pasteLines(text).map(line => line.trim().slice(0, PASTE_MAX_LINE_LENGTH))
  return lines.length ? [{ text: lines.join('\n'), children: [] }] : []
}

function countOutline(items) {
  return items.reduce((n, item) => n + 1 + countOutline(item.children), 0)
}

// Comando PASTE_OUTLINE: añade los temas como subtemas del primer tema seleccionado (un
// paso de deshacer). Con texto enriquecido el texto se escapa y cada línea es un párrafo.
function pasteOutline(mindMap, items) {
  const renderer = mindMap.renderer
  const parent = renderer.activeNodeList[0]
  if (!parent || !items || !items.length) return
  const isRichText = renderer.hasRichTextPlugin()
  const toData = item => ({
    data: isRichText
      ? { text: item.text.split('\n').map(line => `<p>${escapeXml(line)}</p>`).join(''), richText: true, resetRichText: true, uid: createUid(), expand: true }
      : { text: item.text, richText: false, uid: createUid(), expand: true },
    children: item.children.map(toData)
  })
  parent.nodeData.children = parent.nodeData.children || []
  parent.nodeData.children.push(...items.map(toData))
  parent.nodeData.data.expand = true
  mindMap.render()
}
