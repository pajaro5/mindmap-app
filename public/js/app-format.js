// Métodos de la app para la pestaña Formato: temas propios, imagen de fondo y equilibrar (map-format.js).
// Se mezclan en el objeto de la app (app.js, mindMapApp): solo métodos, nunca getters (un
// getter se evaluaría una vez al mezclarlo y dejaría de ser reactivo).

function formatMethods() {
  return {
    // ---- Temas propios (API /api/themes): un formato del mapa guardado con nombre ----
    async loadUserThemes() {
      try {
        const res = await fetch('/api/themes')
        this.userThemes = res.ok ? await res.json() : []
      } catch {
        this.userThemes = []
      }
    },

    applyUserTheme(id) {
      const theme = this.userThemes.find(t => t.id === id)
      if (theme) this.setMapFormat(themeFormatOf(theme.format), { reset: true })
    },

    openSaveThemeDialog() {
      if (!this.mindMap) return
      this.showDialog({ kind: 'saveTheme', name: '', error: '' }, 'themeName')
    },

    async saveUserTheme() {
      const name = this.dialog.name.trim()
      if (!name) { this.dialog.error = 'Escribe un nombre para el tema.'; return }
      const format = themeFormatOf(currentMapFormat(Alpine.raw(this.mindMap)))
      const res = await fetch('/api/themes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: name, format })
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        this.dialog.error = body.error || `No se pudo guardar el tema (HTTP ${res.status}).`
        return
      }
      await this.loadUserThemes()
      this.closeDialog()
    },

    async deleteUserTheme(id) {
      await fetch(`/api/themes/${id}`, { method: 'DELETE' })
      await this.loadUserThemes()
    },

    // Valor de la galería de temas: el tema propio si el formato coincide con uno (y cambia
    // algo del de serie); si no, el tema de serie
    currentThemeOption(format) {
      const mine = JSON.stringify(themeFormatOf(format))
      if (Object.keys(themeFormatOf(format)).length > 1) {
        const match = this.userThemes.find(t => JSON.stringify(themeFormatOf(t.format)) === mine)
        if (match) return `user:${match.id}`
      }
      return format.theme
    },

    // ---- Imagen de fondo: un archivo del mapa (API de adjuntos) ----
    async chooseBackgroundImage() {
      if (!this.mindMap || !this.mindMapId) return
      const file = await pickFile(ALLOWED_IMAGE_TYPES.join(','))
      if (!file) return
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        this.errorMsg = 'La imagen de fondo tiene que ser una imagen PNG, JPEG, GIF o WebP.'
        return
      }
      try {
        const uploaded = await uploadAttachment(this.mindMapId, file)
        this.setMapFormat({ backgroundImage: uploaded.url, backgroundFit: null })
      } catch (err) {
        this.errorMsg = `No se pudo usar la imagen de fondo: ${err.message || err}`
      }
    },

    balanceMap() {
      if (this.mindMap && this.currentLayout === 'mindMap') Alpine.raw(this.mindMap).execCommand('BALANCE_MAP')
    }
  }
}
