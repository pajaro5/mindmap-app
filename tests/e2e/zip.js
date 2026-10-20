// ZIP para las pruebas, con zlib de Node (independiente del código de la app):
//   makeZip([{ name, data }], { deflate })  crea un .zip (sin compresión o con deflate)
//   readZip(buffer)                         { nombre: Buffer } comprobando cada CRC
const zlib = require('zlib')

function makeZip(files, { deflate = false } = {}) {
  const locals = []
  const central = []
  let offset = 0
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8')
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(String(file.data), 'utf8')
    const body = deflate ? zlib.deflateRawSync(data) : data
    const crc = zlib.crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(deflate ? 8 : 0, 8)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(name.length, 26)
    locals.push(local, name, body)
    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(0x02014b50, 0)
    entry.writeUInt16LE(20, 4)
    entry.writeUInt16LE(20, 6)
    entry.writeUInt16LE(0x0800, 8)
    entry.writeUInt16LE(deflate ? 8 : 0, 10)
    entry.writeUInt32LE(crc, 16)
    entry.writeUInt32LE(body.length, 20)
    entry.writeUInt32LE(data.length, 24)
    entry.writeUInt16LE(name.length, 28)
    entry.writeUInt32LE(offset, 42)
    central.push(entry, name)
    offset += 30 + name.length + body.length
  }
  const centralBuf = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(centralBuf.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, centralBuf, end])
}

function readZip(buffer) {
  const files = {}
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (end < 0) throw new Error('ZIP sin directorio central')
  let at = buffer.readUInt32LE(end + 16)
  for (let n = buffer.readUInt16LE(end + 10); n > 0; n--) {
    const method = buffer.readUInt16LE(at + 10)
    const crc = buffer.readUInt32LE(at + 16)
    const size = buffer.readUInt32LE(at + 20)
    const nameLen = buffer.readUInt16LE(at + 28)
    const extra = buffer.readUInt16LE(at + 30) + buffer.readUInt16LE(at + 32)
    const offset = buffer.readUInt32LE(at + 42)
    const name = buffer.toString('utf8', at + 46, at + 46 + nameLen)
    const start = offset + 30 + buffer.readUInt16LE(offset + 26) + buffer.readUInt16LE(offset + 28)
    const raw = buffer.subarray(start, start + size)
    const data = method === 8 ? zlib.inflateRawSync(raw) : raw
    if (zlib.crc32(data) !== crc) throw new Error(`${name}: CRC incorrecto`)
    files[name] = Buffer.from(data)
    at += 46 + nameLen + extra
  }
  return files
}

module.exports = { makeZip, readZip }
