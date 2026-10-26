// Reglas de seguridad de la ventana de escritorio (desktop/policy.js). Oráculo escrito a mano.
const test = require('node:test')
const assert = require('node:assert/strict')
const { isAppUrl, isExternalUrl, isAllowedPermission } = require('../../desktop/policy')

const ORIGIN = 'http://127.0.0.1:51234'

test('isAppUrl: solo el mismo origen (esquema, host y puerto)', () => {
  const cases = [
    ['http://127.0.0.1:51234/', true],
    ['http://127.0.0.1:51234/api/maps?x=1#a', true],
    ['http://127.0.0.1:51235/', false],
    ['http://localhost:51234/', false],
    ['https://127.0.0.1:51234/', false],
    ['https://example.com/', false],
    ['file:///C:/Windows/win.ini', false],
    ['javascript:alert(1)', false],
    ['no es una url', false],
    ['', false]
  ]
  for (const [url, expected] of cases) assert.equal(isAppUrl(url, ORIGIN), expected, url)
})

test('isExternalUrl: web y correo, nunca la propia app ni esquemas peligrosos', () => {
  const cases = [
    ['https://example.com/a', true],
    ['http://example.com', true],
    ['mailto:alguien@example.com', true],
    ['http://127.0.0.1:51234/otra', false],
    ['file:///C:/Windows/System32/calc.exe', false],
    ['javascript:alert(1)', false],
    ['data:text/html,<script>alert(1)</script>', false],
    ['ms-settings:', false],
    ['vbscript:msgbox(1)', false],
    ['\\\\servidor\\recurso', false],
    ['C:\\Windows\\notepad.exe', false],
    ['', false]
  ]
  for (const [url, expected] of cases) assert.equal(isExternalUrl(url, ORIGIN), expected, url)
})

test('isAllowedPermission: portapapeles y pantalla completa, solo para la app', () => {
  const cases = [
    ['clipboard-read', ORIGIN + '/', true],
    ['clipboard-sanitized-write', ORIGIN + '/', true],
    ['fullscreen', ORIGIN, true],
    ['clipboard-read', 'https://example.com/', false],
    ['fullscreen', 'http://127.0.0.1:1/', false],
    ['media', ORIGIN + '/', false],
    ['geolocation', ORIGIN + '/', false],
    ['notifications', ORIGIN + '/', false],
    ['openExternal', ORIGIN + '/', false],
    ['clipboard-read', undefined, false]
  ]
  for (const [permission, url, expected] of cases) {
    assert.equal(isAllowedPermission(permission, url, ORIGIN), expected, `${permission} ${url}`)
  }
})
