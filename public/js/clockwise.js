// Sentido horario en el diseño radial, como en MindManager. Los temas principales se leen como
// las agujas del reloj: el orden de los hijos del tema central (el del esquema, la presentación
// y las exportaciones) recorre primero el lado derecho, de arriba abajo, y después el izquierdo,
// de abajo arriba.
//  - Lado de cada tema principal: su dato `dir` (lo ponen Equilibrar y la importación de
//    MindManager) o, si no lo tiene, la primera mitad (redondeando hacia arriba) a la derecha y
//    el resto a la izquierda. La librería alterna: pares a la derecha, impares a la izquierda.
//  - Los temas principales de la izquierda se dibujan de abajo arriba; los subtemas, como siempre.
//
// La librería no exporta la clase del diseño radial: se parchea su prototipo desde la primera
// instancia, en un plugin (el constructor del mapa crea el diseño, luego los plugins y después
// dibuja). Son copias de computedBaseValue, computedTopValue y updateBrothers de
// simple-mind-map 0.14.0-fix.3 (src/layouts/MindMap.js) con esos dos cambios: revisar al
// actualizar la librería.

const CW_LEFT = 'left'
const CW_RIGHT = 'right'

// Lado de cada tema principal a partir de sus `dir` guardados (puede faltar alguno)
function clockwiseSides(dirs) {
  const half = Math.ceil(dirs.length / 2)
  return dirs.map((dir, i) => dir === CW_LEFT || dir === CW_RIGHT ? dir : (i < half ? CW_RIGHT : CW_LEFT))
}

// Hijos del tema central de arriba abajo en cada lado: la derecha en orden, la izquierda al revés
function clockwiseVisualOrder(children, sideOf = c => c.dir) {
  return [
    ...children.filter(c => sideOf(c) !== CW_LEFT),
    ...children.filter(c => sideOf(c) === CW_LEFT).reverse()
  ]
}

// Igual que walk() de la librería (src/utils/index.js)
function clockwiseWalk(root, parent, before, after, isRoot, layerIndex = 0, index = 0, ancestors = []) {
  const stop = before ? before(root, parent, isRoot, layerIndex, index, ancestors) : false
  if (!stop && root.children && root.children.length > 0) {
    root.children.forEach((node, nodeIndex) => {
      clockwiseWalk(node, root, before, after, false, layerIndex + 1, nodeIndex, [...ancestors, root])
    })
  }
  if (after) after(root, parent, isRoot, layerIndex, index, ancestors)
}

const clockwiseLayoutMethods = {
  computedBaseValue() {
    let rootSides = []
    clockwiseWalk(
      this.renderer.renderTree,
      null,
      (cur, parent, isRoot, layerIndex, index, ancestors) => {
        const newNode = this.createNode(cur, parent, isRoot, layerIndex, index, ancestors)
        if (isRoot) {
          this.setNodeCenter(newNode)
          rootSides = clockwiseSides((cur.children || []).map(c => c.data && c.data.dir))
        } else {
          newNode.dir = parent._node.dir || rootSides[index]
          newNode.left = newNode.dir === CW_RIGHT
            ? parent._node.left + parent._node.width + this.getMarginX(layerIndex)
            : parent._node.left - this.getMarginX(layerIndex) - newNode.width
        }
        if (!cur.data.expand) return true
      },
      (cur, parent, isRoot, layerIndex) => {
        if (!cur.data.expand) {
          cur._node.leftChildrenAreaHeight = 0
          cur._node.rightChildrenAreaHeight = 0
          return
        }
        let leftLen = 0
        let rightLen = 0
        let leftChildrenAreaHeight = 0
        let rightChildrenAreaHeight = 0
        cur._node.children.forEach(item => {
          if (item.dir === CW_LEFT) {
            leftLen++
            leftChildrenAreaHeight += item.height
          } else {
            rightLen++
            rightChildrenAreaHeight += item.height
          }
        })
        cur._node.leftChildrenAreaHeight = leftChildrenAreaHeight + (leftLen + 1) * this.getMarginY(layerIndex + 1)
        cur._node.rightChildrenAreaHeight = rightChildrenAreaHeight + (rightLen + 1) * this.getMarginY(layerIndex + 1)
        const generalizationNodeHeight = cur._node.checkHasGeneralization()
          ? cur._node._generalizationNodeHeight + this.getMarginY(layerIndex + 1)
          : 0
        cur._node.leftChildrenAreaHeight2 = Math.max(cur._node.leftChildrenAreaHeight, generalizationNodeHeight)
        cur._node.rightChildrenAreaHeight2 = Math.max(cur._node.rightChildrenAreaHeight, generalizationNodeHeight)
      },
      true,
      0
    )
  },

  computedTopValue() {
    clockwiseWalk(
      this.root,
      null,
      (node, parent, isRoot, layerIndex) => {
        if (node.getData('expand') && node.children && node.children.length) {
          const marginY = this.getMarginY(layerIndex + 1)
          const baseTop = node.top + node.height / 2 + marginY
          let leftTotalTop = baseTop - node.leftChildrenAreaHeight / 2
          let rightTotalTop = baseTop - node.rightChildrenAreaHeight / 2
          const ordered = node.isRoot ? clockwiseVisualOrder(node.children) : node.children
          ordered.forEach(cur => {
            if (cur.dir === CW_LEFT) {
              cur.top = leftTotalTop
              leftTotalTop += cur.height + marginY
            } else {
              cur.top = rightTotalTop
              rightTotalTop += cur.height + marginY
            }
          })
        }
      },
      null,
      true
    )
  },

  updateBrothers(node, leftAddHeight, rightAddHeight) {
    if (!node.parent) return
    // Hermanos del mismo lado, de arriba abajo
    let childrenList = node.parent.children.filter(item => item.dir === node.dir)
    if (node.parent.isRoot && node.dir === CW_LEFT) childrenList = childrenList.reverse()
    const index = childrenList.findIndex(item => item.uid === node.uid)
    childrenList.forEach((item, _index) => {
      if (item.hasCustomPosition()) return
      let offset = 0
      const addHeight = item.dir === CW_LEFT ? leftAddHeight : rightAddHeight
      if (_index < index) offset = -addHeight
      else if (_index > index) offset = addHeight
      item.top += offset
      if (item.children && item.children.length) this.updateChildren(item.children, 'top', offset)
    })
    this.updateBrothers(node.parent, leftAddHeight, rightAddHeight)
  }
}

function patchClockwiseLayout(mindMap) {
  const layout = mindMap.renderer && mindMap.renderer.layout
  if (!layout || mindMap.opt.layout !== 'mindMap') return
  const proto = Object.getPrototypeOf(layout)
  if (proto.__mmClockwise) return
  Object.assign(proto, clockwiseLayoutMethods)
  proto.__mmClockwise = true
}

// Plugin: parchea el diseño del mapa y el de cada cambio de diseño posterior
class ClockwisePlugin {
  constructor({ mindMap }) {
    patchClockwiseLayout(mindMap)
    const renderer = mindMap.renderer
    const setLayout = renderer.setLayout
    renderer.setLayout = function (...args) {
      const result = setLayout.apply(this, args)
      patchClockwiseLayout(mindMap)
      return result
    }
  }
  beforePluginRemove() {}
  beforePluginDestroy() {}
}
ClockwisePlugin.instanceName = 'clockwiseLayout'

// Arrastrar en el lado izquierdo del tema central: los hermanos están de abajo arriba, así que
// el tema de encima de donde se suelta es el siguiente, no el anterior (opción isReverse de la
// propia librería, que ya la usa en las espinas de pez)
function patchClockwiseDrag(MindMapCtor) {
  const Drag = (MindMapCtor.pluginList || []).find(p => p.instanceName === 'drag')
  if (!Drag || Drag.prototype.__mmClockwise) return
  const handleMindMap = Drag.prototype.handleMindMap
  Drag.prototype.handleMindMap = function (node) {
    if (!(node.layerIndex === 1 && node.dir === CW_LEFT)) return handleMindMap.call(this, node)
    const checkList = node.parent.children.filter(item => item.dir === node.dir && !this.checkIsInBeingDragNodeList(item))
    this.handleVerticalCheck(node, checkList, true)
  }
  Drag.prototype.__mmClockwise = true
}

// Registra el sentido horario, una vez por constructor (desde setupMindMapLibrary, theme.js).
// Quita el plugin MindMapLayoutPro, que el build completo de la librería registra solo: escribe
// `dir` en todos los temas principales (primera mitad a la derecha) al abrir el mapa y tras cada
// inserción o borrado, así que pisaba los lados guardados (Equilibrar, temas importados). Ese
// reparto por defecto ya lo hace el diseño, sin tocar los datos.
function setupClockwise(MindMapCtor) {
  const list = MindMapCtor.pluginList || []
  const pro = list.findIndex(p => p.instanceName === 'mindMapLayoutPro')
  if (pro !== -1) list.splice(pro, 1)
  if (typeof MindMapCtor.usePlugin === 'function') MindMapCtor.usePlugin(ClockwisePlugin)
  patchClockwiseDrag(MindMapCtor)
}
