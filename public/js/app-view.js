// Métodos de la app para la Vista: filtros guardados, mostrar nivel y enfoque (view-extras.js).
// Se mezclan en el objeto de la app (app.js, mindMapApp): solo métodos, nunca getters (un
// getter se evaluaría una vez al mezclarlo y dejaría de ser reactivo).

function viewMethods() {
  return {
    // ---- Filtros guardados (view-extras.js): viajan con el mapa, en el tema central ----
    refreshSavedFilters() {
      const root = this.mindMap && Alpine.raw(this.mindMap).renderer.root
      const list = normalizeSavedFilters(root ? root.getData(SAVED_FILTERS_KEY) : [])
      if (JSON.stringify(list) !== JSON.stringify(this.savedFilters)) this.savedFilters = list
    },

    saveCurrentFilter(name = this.filterName) {
      if (!this.mindMap || !isFilterActive(this.filter) || !String(name || '').trim()) return
      Alpine.raw(this.mindMap).execCommand('SET_SAVED_FILTERS', withSavedFilter(this.savedFilters, name, JSON.parse(JSON.stringify(this.filter))))
      this.filterName = ''
      this.refreshSavedFilters()
    },

    applySavedFilter(name) {
      const saved = this.savedFilters.find(f => f.name === name)
      if (saved) this.filter = normalizeFilter(saved.filter)
    },

    deleteSavedFilter(name) {
      if (!this.mindMap) return
      Alpine.raw(this.mindMap).execCommand('SET_SAVED_FILTERS', this.savedFilters.filter(f => f.name !== name))
      this.refreshSavedFilters()
    },

    // ---- Mostrar nivel y enfoque (view-extras.js); un paso de deshacer cada uno ----
    // `level`: 1 = solo los temas principales; null = todos los niveles
    showLevel(level) {
      const mindMap = this.mindMap && Alpine.raw(this.mindMap)
      if (!mindMap) return
      if (level) mindMap.execCommand('UNEXPAND_TO_LEVEL', level)
      else mindMap.execCommand('EXPAND_ALL')
    },

    focusSelectedTopic() {
      const mindMap = this.mindMap && Alpine.raw(this.mindMap)
      const node = this.activeNodeList.length === 1 ? Alpine.raw(this.activeNodeList[0]) : null
      if (!mindMap || !node) return
      mindMap.execCommand('FOCUS_TOPIC', node.uid)
    },

    // Resaltado de búsqueda y atenuado del filtro sobre los temas pintados
    refreshViewMarks() {
      const mindMap = this.mindMap && Alpine.raw(this.mindMap)
      if (!mindMap) return
      applyViewMarks(mindMap, {
        searchMatches: this.find.open ? this.find.matches : [],
        searchCurrent: this.find.open ? this.find.matches[this.find.index] : null,
        filter: this.filterResult
      })
    }
  }
}
