/**
 * Escritor ZIP mínimo (deflate o store, sin ZIP64) para el paquete de
 * diagnóstico. Sin dependencias: `zlib` trae deflate y CRC-32.
 *
 * Acotado a lo que hace falta: pocos archivos de unos MB, nombres ASCII/UTF-8
 * y nada que supere los 4 GiB del formato clásico.
 */
import { crc32, deflateRawSync } from 'node:zlib'

export interface ZipEntry {
  name: string
  data: Buffer | string
  /** Fecha del archivo; por defecto, ahora. */
  date?: Date
}

function dosDateTime(date: Date): { time: number; day: number } {
  const year = Math.max(1980, date.getFullYear())
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    day: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  }
}

export function createZip(entries: readonly ZipEntry[]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.name.replace(/\\/g, '/'), 'utf8')
    const raw = typeof entry.data === 'string' ? Buffer.from(entry.data, 'utf8') : entry.data
    const deflated = deflateRawSync(raw)
    // Lo ya comprimido (minidumps) no gana nada: se guarda tal cual.
    const stored = deflated.length >= raw.length
    const body = stored ? raw : deflated
    const method = stored ? 0 : 8
    const crc = crc32(raw) >>> 0
    const { time, day } = dosDateTime(entry.date ?? new Date())
    if (raw.length > 0xffffffff || offset > 0xffffffff) throw new Error('diagnostic bundle too large for ZIP')

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6) // nombres en UTF-8
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(day, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    locals.push(local, name, body)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(method, 10)
    central.writeUInt16LE(time, 12)
    central.writeUInt16LE(day, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(body.length, 20)
    central.writeUInt32LE(raw.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, name)

    offset += local.length + name.length + body.length
  }
  const directory = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, directory, end])
}
