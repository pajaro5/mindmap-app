// Reglas de seguridad de la ventana de escritorio, sin dependencias de Electron para poder
// probarlas con node:test (tests/unit/desktop-policy.test.js).

// Esquemas que se pasan al navegador o al cliente de correo del sistema (los mismos que admite
// isSafeHyperlink en el cliente)
const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

// Permisos que la página puede pedir: leer el portapapeles (Pegar, Pegado especial) y la
// pantalla completa (Presentación). Todo lo demás (cámara, ubicación, notificaciones…) se niega.
const ALLOWED_PERMISSIONS = new Set(['clipboard-read', 'clipboard-sanitized-write', 'fullscreen'])

function parseUrl(url) {
  try { return new URL(url) } catch { return null }
}

// ¿La dirección es de la propia app (mismo origen que el servidor local)?
function isAppUrl(url, origin) {
  const u = parseUrl(url)
  return !!u && u.origin === origin
}

// ¿Se puede abrir fuera de la app? Solo web y correo, y nunca la propia app
function isExternalUrl(url, origin) {
  const u = parseUrl(url)
  return !!u && EXTERNAL_PROTOCOLS.has(u.protocol) && u.origin !== origin
}

function isAllowedPermission(permission, requestingUrl, origin) {
  return ALLOWED_PERMISSIONS.has(permission) && isAppUrl(requestingUrl, origin)
}

module.exports = { isAppUrl, isExternalUrl, isAllowedPermission }
