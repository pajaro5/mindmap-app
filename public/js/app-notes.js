// Métodos de la app para el panel Notas: editor con formato, vínculos y pegado (rich-notes.js).
// Se mezclan en el objeto de la app (app.js, mindMapApp): solo métodos, nunca getters (un
// getter se evaluaría una vez al mezclarlo y dejaría de ser reactivo).

function notesMethods() {
  return {
    // ---- Notas (con formato: rich-notes.js) ----
    openNotes() {
      this.pane = 'notes'
      this.loadNoteDraft()
      this.$nextTick(() => {
        const editor = document.querySelector('.notes-editor')
        if (editor) editor.focus()
      })
    },

    // Carga en el editor la nota del tema seleccionado (al cambiar la selección)
    loadNoteDraft() {
      this.flushNote()
      const node = this.activeNodeList.length === 1 ? Alpine.raw(this.activeNodeList[0]) : null
      this.noteNodeUid = node ? node.uid : null
      this.noteDraft = this.noteLoaded = node ? noteDisplayHtml(node.getData()) : ''
      this.noteLink = null
      this.renderNoteEditor()
    },

    // El editor es contenteditable: su HTML se pone a mano (con x-html el cursor saltaría al
    // principio en cada tecla). Si el editor aún no existe, lo rellena su x-init.
    renderNoteEditor() {
      this.$nextTick(() => {
        const editor = document.querySelector('.notes-editor')
        if (editor && editor.innerHTML !== this.noteDraft) editor.innerHTML = this.noteDraft
      })
    },

    // Si la nota cambió fuera del editor (Deshacer, Limpiar…) y no hay nada pendiente de
    // guardar, el editor muestra la nota actual. Sin esto, el borrador antiguo volvía a
    // escribirse sobre el tema al cambiar de selección.
    refreshNoteDraft() {
      if (this.pane !== 'notes' || this.noteDirty || !this.mindMap || !this.noteNodeUid) return
      const node = this.mindMap.renderer.findNodeByUid(this.noteNodeUid)
      const current = node ? noteDisplayHtml(node.getData()) : ''
      if (current === this.noteLoaded) return
      this.noteDraft = this.noteLoaded = current
      this.renderNoteEditor()
    },

    // Guarda la nota con un pequeño retardo mientras se escribe (una entrada de historial
    // por pausa, no por tecla)
    onNoteInput() {
      const editor = document.querySelector('.notes-editor')
      if (editor) this.noteDraft = editor.innerHTML
      this.noteDirty = true
      clearTimeout(this.noteTimer)
      this.noteTimer = setTimeout(() => this.flushNote(), 500)
    },

    flushNote() {
      clearTimeout(this.noteTimer)
      this.noteTimer = null
      // Solo se guarda lo que el usuario escribió
      if (!this.noteDirty) return
      this.noteDirty = false
      if (!this.mindMap || !this.noteNodeUid) return
      const node = this.mindMap.renderer.findNodeByUid(this.noteNodeUid)
      if (!node) return
      // Texto plano (note) y, si tiene formato, el HTML saneado (_noteHtml), en un solo paso
      const next = noteDataFromHtml(this.noteDraft)
      if (next.note === node.getData('note') && next[NOTE_HTML_KEY] === node.getData(NOTE_HTML_KEY)) return
      this.mindMap.renderer.setNodeDataRender(node, next)
      this.noteLoaded = noteDisplayHtml(node.getData())
    },

    // Barra del editor: negrita, cursiva, subrayado, tachado, listas, quitar formato
    noteFormat(cmd) {
      const editor = document.querySelector('.notes-editor')
      if (!editor) return
      editor.focus()
      // Párrafos como <p> (no <div>) también en Firefox
      document.execCommand('defaultParagraphSeparator', false, 'p')
      const commands = { bold: 'bold', italic: 'italic', underline: 'underline', strike: 'strikeThrough', ul: 'insertUnorderedList', ol: 'insertOrderedList', clear: 'removeFormat' }
      document.execCommand(commands[cmd], false, null)
      if (cmd === 'clear') document.execCommand('unlink', false, null)
      this.onNoteInput()
    },

    // Vínculo: guarda la selección del editor y abre la fila para escribir la dirección
    openNoteLink() {
      const selection = window.getSelection()
      const editor = document.querySelector('.notes-editor')
      const range = selection.rangeCount ? selection.getRangeAt(0) : null
      this.noteLinkRange = range && editor && editor.contains(range.commonAncestorContainer) && !range.collapsed ? range.cloneRange() : null
      if (!this.noteLinkRange) {
        this.noteLink = { url: '', error: 'Selecciona en la nota el texto del vínculo.' }
        return
      }
      this.noteLink = { url: '', error: '' }
      this.$nextTick(() => {
        const input = document.querySelector('.notes-link-row [name="noteLink"]')
        if (input) input.focus()
      })
    },

    applyNoteLink() {
      if (!this.noteLink) return
      if (!this.noteLinkRange) { this.noteLink = null; return }
      const result = normalizeHyperlink(this.noteLink.url)
      if (!result.ok) { this.noteLink.error = result.error; return }
      const editor = document.querySelector('.notes-editor')
      editor.focus()
      const selection = window.getSelection()
      selection.removeAllRanges()
      selection.addRange(this.noteLinkRange)
      document.execCommand('createLink', false, result.url)
      this.noteLink = null
      this.noteLinkRange = null
      this.onNoteInput()
    },

    // Pegar en la nota: solo lo permitido (sin imágenes, estilos ni scripts de la página de origen)
    onNotePaste(e) {
      const data = e.clipboardData
      if (!data) return
      e.preventDefault()
      const html = data.getData('text/html')
      document.execCommand('insertHTML', false, html ? sanitizeNoteHtml(html) : noteTextToHtml(data.getData('text/plain')))
      this.onNoteInput()
    },

    // Botón principal de un color: vuelve a aplicar el último color elegido
    applyLastColor(cmd) {
      this.runCommand(cmd, this.lastColors[cmd])
    },

    // Elección desde la paleta: `null` = Automático (estilo del tema)
    chooseColor(cmd, color) {
      if (color) this.lastColors[cmd] = color
      this.runCommand(cmd, color)
    }
  }
}
