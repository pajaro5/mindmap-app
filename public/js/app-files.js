// Métodos de la app para documentos y archivos: exportar a Word/Markdown con opciones
// (export-doc.js) y abrir/guardar como archivo (map-file.js, import-formats.js).
// Se mezclan en el objeto de la app (app.js, mindMapApp): solo métodos, nunca getters (un
// getter se evaluaría una vez al mezclarlo y dejaría de ser reactivo).

function fileMethods() {
  return {
    // Word o Markdown: el mapa entero como documento (ver export-doc.js), con las opciones
    // elegidas la última vez en "Opciones de exportación"
    async exportDocument(format) {
      if (!this.mindMap) return
      const labels = this.iconById
      try {
        await exportDocument(Alpine.raw(this.mindMap), format, {
          title: this.currentTitle,
          iconLabel: id => (labels[id] && labels[id].label) || id,
          options: this.exportOptions
        })
      } catch (err) {
        console.error(err)
        this.errorMsg = `No se pudo exportar: ${err.message || err}`
      }
    },

    // Diálogo de opciones; el formato es el del botón desde cuyo menú se abrió
    openExportOptions(format) {
      if (!this.mindMap) return
      this.showDialog({ kind: 'exportOptions', format, options: { ...this.exportOptions } })
    },

    async confirmExportOptions() {
      const { format, options } = this.dialog
      this.exportOptions = normalizeDocOptions(options)
      try { localStorage.setItem(EXPORT_OPTIONS_STORAGE_KEY, JSON.stringify(this.exportOptions)) } catch { /* sin almacenamiento: solo esta sesión */ }
      this.closeDialog()
      await this.exportDocument(format)
    },

    // ---- Abrir y guardar como archivo (map-file.js) ----
    async openMapFile() {
      const file = await pickFile('.json,.zip,.mmap,.mm,application/json,application/zip')
      if (file) await this.importMapFile(file)
    },

    // Crea un mapa nuevo con el contenido del archivo, sube sus adjuntos y lo abre
    async importMapFile(file) {
      if (this.fileBusy) return
      this.fileBusy = 'Abriendo archivo…'
      this.errorMsg = ''
      let createdId = null
      try {
        const map = await readMapFile(file)
        const res = await fetch('/api/maps', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: map.title, data: map.data })
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new MapFileError(`El servidor no aceptó el mapa: ${body.error || `HTTP ${res.status}`}`)
        createdId = body.id
        const warnings = [...map.warnings]
        if (map.attachments.length) {
          for (const a of map.attachments) {
            try {
              const type = a.type || IMAGE_FILE_TYPES[((a.name.match(/\.(\w+)$/) || [])[1] || '').toLowerCase()] || 'application/octet-stream'
              const uploaded = await uploadAttachment(body.id, new File([a.bytes], a.name, { type }))
              // La imagen de fondo dice dónde va su dirección (apply); un adjunto, en su tema
              if (a.apply) a.apply(uploaded)
              else {
                a.data.attachmentUrl = uploaded.url
                a.data.attachmentName = escapeXml(uploaded.name)
              }
            } catch (err) {
              warnings.push(`No se pudo subir el adjunto "${a.name}": ${err.message}`)
            }
          }
          const put = await fetch(`/api/maps/${body.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: map.data })
          })
          if (!put.ok) warnings.push(`No se pudieron enlazar los adjuntos (HTTP ${put.status}).`)
        }
        await this.loadMapList()
        await this.openMap(body.id, { fit: true })
        if (warnings.length) this.showDialog({ kind: 'fileReport', title: map.title, warnings })
      } catch (err) {
        if (!(err instanceof MapFileError)) console.error(err)
        this.errorMsg = `No se pudo abrir "${file.name}": ${err.message || err}`
        if (createdId) await this.loadMapList()
      } finally {
        this.fileBusy = ''
      }
    },

    async saveMapFile() {
      if (!this.mindMap || this.fileBusy) return
      this.fileBusy = 'Preparando archivo…'
      try {
        await this.flushPendingSave()
        const file = await buildMapFile(this.currentMapData(), this.currentTitle, async url => {
          const res = await fetch(url)
          if (!res.ok) throw new Error(`no se pudo leer el adjunto (HTTP ${res.status})`)
          return new Uint8Array(await res.arrayBuffer())
        })
        const url = URL.createObjectURL(file.blob)
        const a = document.createElement('a')
        a.href = url
        a.download = file.name
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 10000)
      } catch (err) {
        console.error(err)
        this.errorMsg = `No se pudo guardar el archivo: ${err.message || err}`
      } finally {
        this.fileBusy = ''
      }
    },

    // Arrastrar un .json o .zip sobre la app lo abre
    onFileDragOver(e) {
      if (!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      this.fileDragOver = true
    },

    onFileDrop(e) {
      if (!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return
      e.preventDefault()
      this.fileDragOver = false
      const file = [...e.dataTransfer.files].find(f => isMapFileName(f.name)) || e.dataTransfer.files[0]
      if (file) this.importMapFile(file)
    }
  }
}
