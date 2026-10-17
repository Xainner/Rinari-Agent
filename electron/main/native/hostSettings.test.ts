// Ajustes del host leídos antes de la ventana (#70, #91, #96).
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  DETAILED_LOGS_MS,
  activeEnvironment,
  applyHostSettingsPatch,
  assertHostSettingsPatch,
  detailedLogsActive,
  handshakeLimitMs,
  loadHostSettings,
  saveHostSettings,
} from './hostSettings'

describe('límite del saludo del Engine (#70)', () => {
  it('«Automático»: 45 s la primera vez; después el doble de lo que tardó, entre 30 y 60 s', () => {
    expect(handshakeLimitMs({ startupLimit: 'auto', lastStartupMs: null })).toBe(45_000)
    expect(handshakeLimitMs({ startupLimit: 'auto', lastStartupMs: 4_800 })).toBe(30_000)
    expect(handshakeLimitMs({ startupLimit: 'auto', lastStartupMs: 19_000 })).toBe(38_000)
    expect(handshakeLimitMs({ startupLimit: 'auto', lastStartupMs: 50_000 })).toBe(60_000)
    expect(handshakeLimitMs({ startupLimit: 60, lastStartupMs: 4_800 })).toBe(60_000)
  })
})

describe('el archivo', () => {
  it('ausente o roto da los valores por defecto; lo guardado vuelve igual', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rinari-host-'))
    try {
      const path = join(dir, 'host-settings.json')
      expect(loadHostSettings(path)).toEqual({ startupLimit: 'auto', lastStartupMs: null, hardwareAcceleration: true, detailedLogsUntil: null })
      writeFileSync(path, '{roto', 'utf8')
      expect(loadHostSettings(path).startupLimit).toBe('auto')
      saveHostSettings(path, { startupLimit: 30, lastStartupMs: 3000, hardwareAcceleration: false, detailedLogsUntil: null })
      expect(loadHostSettings(path)).toMatchObject({ startupLimit: 30, lastStartupMs: 3000, hardwareAcceleration: false })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('cambios desde el renderer', () => {
  it('solo lo conocido; los registros detallados duran 24 h', () => {
    expect(() => assertHostSettingsPatch({ startupLimit: 45 })).toThrow()
    expect(() => assertHostSettingsPatch({ other: true })).toThrow()
    const patch = assertHostSettingsPatch({ detailedLogs: true, startupLimit: 60 })
    const base = { startupLimit: 'auto' as const, lastStartupMs: null, hardwareAcceleration: true, detailedLogsUntil: null }
    const next = applyHostSettingsPatch(base, patch, 1_000)
    expect(next.detailedLogsUntil).toBe(1_000 + DETAILED_LOGS_MS)
    expect(detailedLogsActive(next, 2_000)).toBe(true)
    expect(detailedLogsActive(next, 1_000 + DETAILED_LOGS_MS + 1)).toBe(false)
    expect(applyHostSettingsPatch(next, { detailedLogs: false }).detailedLogsUntil).toBeNull()
  })
})

describe('variables de entorno (solo lectura)', () => {
  it('las de Rinari, el proxy y los certificados, sin secretos ni credenciales en la URL', () => {
    const env = activeEnvironment({
      RINARI_WHISPER_BIN: 'C:/tools/whisper-cli.exe',
      RINARI_API_KEY: 'sk-real',
      HTTPS_PROXY: 'http://user:pass@proxy:8080',
      PATH: 'C:/Windows',
      RINARI_EMPTY: '  ',
    })
    expect(env).toEqual([
      { name: 'HTTPS_PROXY', value: 'http://••••@proxy:8080' },
      { name: 'RINARI_API_KEY', value: '••••' },
      { name: 'RINARI_WHISPER_BIN', value: 'C:/tools/whisper-cli.exe' },
    ])
  })
})
