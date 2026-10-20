// Vínculos internos (Hipervínculo › Tema de este mapa / Otro mapa). Se guardan en el mismo
// campo `hyperlink` que los vínculos web, con un esquema propio:
//   topic:<uid del tema>   salta a un tema de este mapa (despliega su rama y lo selecciona)
//   map:<id del mapa>      abre otro mapa
// La librería los pinta como cualquier vínculo y, al hacer clic, llama a customHyperlinkJump
// (con preventDefault), así que el navegador nunca sigue esas direcciones.

const TOPIC_LINK_RE = /^topic:([A-Za-z0-9_-]{1,64})$/
const MAP_LINK_RE = /^map:([0-9a-f-]{36})$/

function internalLinkOf(url) {
  const value = String(url || '')
  let m = TOPIC_LINK_RE.exec(value)
  if (m) return { kind: 'topic', uid: m[1] }
  m = MAP_LINK_RE.exec(value)
  if (m) return { kind: 'map', id: m[1] }
  return null
}

const topicLinkUrl = uid => `topic:${uid}`
const mapLinkUrl = id => `map:${id}`

// Temas del árbol (también los de ramas contraídas) para elegir el destino: [{ uid, text, depth }]
function linkableTopics(tree, excludeUid = null) {
  const result = []
  const walk = (node, depth) => {
    if (!node || !node.data) return
    if (node.data.uid && node.data.uid !== excludeUid) {
      result.push({ uid: node.data.uid, text: topicPlainText(node.data) || '(sin texto)', depth })
    }
    ;(node.children || []).forEach(child => walk(child, depth + 1))
  }
  walk(tree, 0)
  return result
}

// Busca un tema por uid en los datos (también dentro de ramas contraídas)
function findTopicData(tree, uid) {
  if (!tree || !tree.data) return null
  if (tree.data.uid === uid) return tree
  for (const child of tree.children || []) {
    const found = findTopicData(child, uid)
    if (found) return found
  }
  return null
}
