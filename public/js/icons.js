// Iconos SVG de la interfaz. Se referencian por nombre desde el registro de comandos,
// así cada icono vive en un único sitio aunque el comando aparezca en varios lugares.

// Logo de la app: cerebro estilizado (dos hemisferios con circunvoluciones)
const BRAIN_PATHS = `
  <path d="M15.2 6.2c-2.6-1.9-6.3-1-7.3 1.9-2.6.1-4.3 2.7-3.3 5.1-1.8 1.4-1.8 4.5 0 5.9-.8 2.7 1 5.4 3.7 5.5 1 2.6 4.3 3.5 6.9 1.8z"/>
  <path d="M16.8 6.2c2.6-1.9 6.3-1 7.3 1.9 2.6.1 4.3 2.7 3.3 5.1 1.8 1.4 1.8 4.5 0 5.9.8 2.7-1 5.4-3.7 5.5-1 2.6-4.3 3.5-6.9 1.8z"/>
  <path d="M7.9 8.1c.3 1.6 1.7 2.5 3.2 2.2M4.6 13.2c1.4 1 3.6.8 4.6-.6M4.6 19.1c1.7-.5 3.4.3 3.9 1.9M9.3 15.6c.9.8 2.2 1 3.3.5"/>
  <path d="M24.1 8.1c-.3 1.6-1.7 2.5-3.2 2.2M27.4 13.2c-1.4 1-3.6.8-4.6-.6M27.4 19.1c-1.7-.5-3.4.3-3.9 1.9M22.7 15.6c-.9.8-2.2 1-3.3.5"/>`

const BRAIN_LOGO = `<svg viewBox="0 0 32 32" aria-hidden="true">
  <defs><linearGradient id="brainBg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ff8f6b"/><stop offset="1" stop-color="#e2456b"/>
  </linearGradient></defs>
  <circle cx="16" cy="16" r="15.5" fill="url(#brainBg)"/>
  <g transform="translate(16 16.4) scale(.82) translate(-16 -16)" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${BRAIN_PATHS}</g>
</svg>`

const ICONS = {
  paste: `<svg viewBox="0 0 32 32"><rect x="5" y="5" width="18" height="23" rx="2" fill="#c98b3c" stroke="#8a5a1c" stroke-width="1.2"/><rect x="10" y="3" width="8" height="5" rx="1.5" fill="#d9dee6" stroke="#6b7685"/><path d="M13 12h13l3 3v14H13z" fill="#fff" stroke="#3b6ea5" stroke-width="1.4"/><path d="M16 18h10M16 21h10M16 24h7" stroke="#8aa6c8" stroke-width="1.4"/></svg>`,
  cut: `<svg viewBox="0 0 32 32"><circle cx="9" cy="24" r="4.5" fill="none" stroke="#1d4f8a" stroke-width="2.5"/><circle cx="23" cy="24" r="4.5" fill="none" stroke="#1d4f8a" stroke-width="2.5"/><path d="M12 20 23 4M20 20 9 4" stroke="#6b7685" stroke-width="2.5" stroke-linecap="round"/></svg>`,
  copy: `<svg viewBox="0 0 32 32"><path d="M5 4h12l4 4v15H5z" fill="#fff" stroke="#3b6ea5" stroke-width="1.6"/><path d="M11 10h12l4 4v15H11z" fill="#eaf2fb" stroke="#3b6ea5" stroke-width="1.6"/><path d="M14 18h10M14 22h10" stroke="#8aa6c8" stroke-width="1.6"/></svg>`,
  formatPainter: `<svg viewBox="0 0 32 32"><rect x="4" y="3" width="20" height="9" rx="2" fill="#f5c84c" stroke="#b8901f" stroke-width="1.4"/><path d="M24 7h3v8H15v4" fill="none" stroke="#6b7685" stroke-width="2"/><rect x="12.5" y="19" width="5" height="10" rx="1.5" fill="#1d4f8a"/></svg>`,
  topicBefore: `<svg viewBox="0 0 32 32"><rect x="6" y="5" width="20" height="9" rx="2" fill="#fff" stroke="#7dc142" stroke-width="1.5" stroke-dasharray="3 2"/><path d="M16 7v5M13.5 9.5h5" stroke="#5bb33a" stroke-width="2"/><rect x="6" y="18" width="20" height="9" rx="2" fill="#7dc142"/></svg>`,
  topicParent: `<svg viewBox="0 0 32 32"><rect x="2" y="12" width="10" height="8" rx="2" fill="#fff" stroke="#3d8fd8" stroke-width="1.5" stroke-dasharray="3 2"/><path d="M12 16h7" stroke="#999" stroke-width="2"/><rect x="19" y="12" width="11" height="8" rx="2" fill="#7dc142"/><path d="M7 14v4M5 16h4" stroke="#3d8fd8" stroke-width="1.6"/></svg>`,
  newMap: `<svg viewBox="0 0 32 32"><path d="M7 3h13l6 6v20H7z" fill="#fff" stroke="#3b6ea5" stroke-width="1.5"/><path d="M20 3v6h6" fill="#dbe8f7" stroke="#3b6ea5" stroke-width="1.5"/><circle cx="23" cy="23" r="6" fill="#5bb33a"/><path d="M23 20v6M20 23h6" stroke="#fff" stroke-width="2"/></svg>`,
  undo: `<svg viewBox="0 0 32 32"><path d="M10 7 4 13l6 6M5 13h14a7 7 0 0 1 0 14h-5" fill="none" stroke="#1d4f8a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  redo: `<svg viewBox="0 0 32 32"><path d="m22 7 6 6-6 6M27 13H13a7 7 0 0 0 0 14h5" fill="none" stroke="#1d4f8a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  topic: `<svg viewBox="0 0 32 32"><rect x="6" y="5" width="20" height="9" rx="2" fill="#7dc142"/><rect x="6" y="18" width="20" height="9" rx="2" fill="#fff" stroke="#7dc142" stroke-width="1.5" stroke-dasharray="3 2"/><path d="M16 20v5M13.5 22.5h5" stroke="#5bb33a" stroke-width="2"/></svg>`,
  subtopic: `<svg viewBox="0 0 32 32"><rect x="2" y="12" width="12" height="8" rx="2" fill="#3d8fd8"/><path d="M14 16c5 0 5-8 10-8M14 16c5 0 5 8 10 8" fill="none" stroke="#999" stroke-width="2"/><rect x="22" y="5" width="9" height="6" rx="1.5" fill="#7dc142"/><rect x="22" y="21" width="9" height="6" rx="1.5" fill="#7dc142"/></svg>`,
  remove: `<svg viewBox="0 0 32 32"><rect x="6" y="11" width="20" height="10" rx="2" fill="#7dc142"/><circle cx="23" cy="22" r="7" fill="#d9412b"/><path d="m20 19 6 6m0-6-6 6" stroke="#fff" stroke-width="2"/></svg>`,
  iconMarkers: `<svg viewBox="0 0 32 32"><circle cx="10" cy="10" r="6" fill="#d9412b"/><text x="10" y="13.5" font-size="9" font-weight="700" text-anchor="middle" fill="#fff" font-family="Arial">1</text><path d="M18 6v20" stroke="#666" stroke-width="2"/><path d="M18 6h10l-3 4 3 4H18z" fill="#5bb33a"/><circle cx="10" cy="23" r="6" fill="#fff" stroke="#5bb33a" stroke-width="2"/><path d="M10 17a6 6 0 0 1 6 6h-6z" fill="#5bb33a"/></svg>`,
  layoutRadial: `<svg viewBox="0 0 32 32"><path d="M16 16C10 16 10 7 4 7M16 16c-6 0-6 9-12 9M16 16c6 0 6-9 12-9M16 16c6 0 6 9 12 9" fill="none" stroke="#999" stroke-width="2"/><rect x="10" y="12" width="12" height="8" rx="2" fill="#3d8fd8"/></svg>`,
  layoutTree: `<svg viewBox="0 0 32 32"><path d="M11 16c6 0 6-9 12-9M11 16h12M11 16c6 0 6 9 12 9" fill="none" stroke="#999" stroke-width="2"/><rect x="2" y="12" width="10" height="8" rx="2" fill="#3d8fd8"/><rect x="22" y="4" width="8" height="5" rx="1" fill="#7dc142"/><rect x="22" y="14" width="8" height="5" rx="1" fill="#7dc142"/><rect x="22" y="23" width="8" height="5" rx="1" fill="#7dc142"/></svg>`,
  zoomIn: `<svg viewBox="0 0 32 32"><circle cx="13" cy="13" r="9" fill="#e8f1fb" stroke="#1d4f8a" stroke-width="2.5"/><path d="m20 20 9 9" stroke="#1d4f8a" stroke-width="3.5" stroke-linecap="round"/><path d="M13 9v8M9 13h8" stroke="#1d4f8a" stroke-width="2.5"/></svg>`,
  zoomOut: `<svg viewBox="0 0 32 32"><circle cx="13" cy="13" r="9" fill="#e8f1fb" stroke="#1d4f8a" stroke-width="2.5"/><path d="m20 20 9 9" stroke="#1d4f8a" stroke-width="3.5" stroke-linecap="round"/><path d="M9 13h8" stroke="#1d4f8a" stroke-width="2.5"/></svg>`,
  fit: `<svg viewBox="0 0 32 32"><rect x="4" y="6" width="24" height="20" rx="2" fill="#fff" stroke="#1d4f8a" stroke-width="2"/><path d="M8 13v-3h3M24 13v-3h-3M8 19v3h3M24 19v3h-3" fill="none" stroke="#3d8fd8" stroke-width="2"/></svg>`,
  actualSize: `<svg viewBox="0 0 32 32"><rect x="4" y="6" width="24" height="20" rx="2" fill="#fff" stroke="#1d4f8a" stroke-width="2"/><text x="16" y="20" font-size="9" font-weight="700" text-anchor="middle" fill="#1d4f8a" font-family="Segoe UI, Arial">1:1</text></svg>`,
  paneMaps: `<svg viewBox="0 0 32 32"><path d="M3 8h10l2 3h14v16H3z" fill="#f5c84c" stroke="#b8901f" stroke-width="1.5"/></svg>`,
  exportPng: `<svg viewBox="0 0 32 32"><rect x="4" y="5" width="24" height="22" rx="2" fill="#fff" stroke="#3b6ea5" stroke-width="1.5"/><path d="m6 24 7-9 5 6 3-3 5 6z" fill="#7dc142"/><circle cx="21" cy="11" r="3" fill="#f5c84c"/></svg>`,
  exportPdf: `<svg viewBox="0 0 32 32"><path d="M7 3h13l6 6v20H7z" fill="#fff" stroke="#3b6ea5" stroke-width="1.5"/><rect x="4" y="15" width="18" height="9" rx="1.5" fill="#d9412b"/><text x="13" y="22.3" font-size="7" font-weight="700" text-anchor="middle" fill="#fff" font-family="Arial">PDF</text></svg>`
}
