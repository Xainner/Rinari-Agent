import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'

import { UpdateNotReady, UpdateService, UpdatesUnavailable, type UpdaterLike } from './UpdateService'

class FakeUpdater extends EventEmitter implements UpdaterLike {
  autoDownload = true
  autoInstallOnAppQuit = true
  autoRunAppAfterInstall = false
  disableDifferentialDownload = false
  disableWebInstaller = false
  allowDowngrade = true
  result: {
    isUpdateAvailable: boolean
    updateInfo: { version: string; releaseNotes?: string }
  } | null = null
  checkForUpdates = vi.fn(async () => this.result)
  downloadUpdate = vi.fn(async () => ['setup.exe'])
  quitAndInstall = vi.fn()
}

function service(updater = new FakeUpdater(), enabled = true) {
  const states: string[] = []
  const requestApply = vi.fn(async () => true)
  return {
    updater,
    states,
    requestApply,
    service: new UpdateService({
      updater,
      currentVersion: '0.2.0',
      enabled,
      requestApply,
      onState: (state) => states.push(state.phase),
    }),
  }
}

describe('UpdateService', () => {
  it('sus propios errores salen en el idioma de la app', async () => {
    const updates = new UpdateService({
      updater: new FakeUpdater(),
      currentVersion: '0.2.0',
      enabled: true,
      requestApply: async () => true,
      text: () => ({
        updateNothingToDownload: 'No hay ninguna actualización para descargar.',
        updateDownloadFirst: 'Descarga primero.',
        updateNoLongerReady: 'Ya no está lista.',
        updateUnavailable: 'No disponible.',
      }),
    })
    await expect(updates.download()).rejects.toThrow('No hay ninguna actualización para descargar.')
    expect(() => updates.commitInstall()).toThrow('Ya no está lista.')
  })

  it('configures manual, full, forward-only updates', () => {
    const { updater } = service()
    expect(updater).toMatchObject({
      autoDownload: false,
      autoInstallOnAppQuit: false,
      autoRunAppAfterInstall: true,
      disableDifferentialDownload: true,
      disableWebInstaller: true,
      allowDowngrade: false,
    })
  })

  it('checks, downloads, and applies only through the lifecycle delegate', async () => {
    const fixture = service()
    fixture.updater.result = {
      isUpdateAvailable: true,
      updateInfo: { version: '0.2.1', releaseNotes: 'Fixes' },
    }
    await expect(fixture.service.check()).resolves.toEqual({ version: '0.2.1', body: 'Fixes', unsigned: true })
    fixture.updater.emit('download-progress', { percent: 42, bytesPerSecond: 4, transferred: 2, total: 5 })
    expect(fixture.service.snapshot().progress).toEqual({
      percent: 42,
      bytes_per_second: 4,
      transferred: 2,
      total: 5,
    })
    await fixture.service.download()
    await fixture.service.apply()
    expect(fixture.states).toEqual(['checking', 'available', 'downloading', 'downloading', 'downloaded', 'applying'])
    expect(fixture.service.snapshot().progress).toBeNull()
    expect(fixture.requestApply).toHaveBeenCalledOnce()
    expect(fixture.updater.quitAndInstall).not.toHaveBeenCalled()
    expect(fixture.service.commitInstall()).toBe('delegated')
    expect(fixture.updater.quitAndInstall).toHaveBeenCalledWith(true, true)
  })

  it('launches the downloaded installer itself instead of trusting quitAndInstall', async () => {
    // «Reiniciar y actualizar» no hacía nada: quitAndInstall, sin el instalador
    // en su estado, solo emitía un error y la app quedaba abierta.
    const updater = new FakeUpdater()
    updater.result = { isUpdateAvailable: true, updateInfo: { version: '0.2.1' } }
    updater.downloadUpdate.mockResolvedValueOnce(['C:/cache/pending/Rinari-Agent-Setup-0.2.1-x64.exe'])
    const launchInstaller = vi.fn()
    const requestApply = vi.fn(async () => true)
    const states: Array<{ phase: string; prompt?: boolean }> = []
    const updates = new UpdateService({
      updater,
      currentVersion: '0.2.0',
      enabled: true,
      requestApply,
      launchInstaller,
      onState: (state) => states.push({ phase: state.phase, prompt: state.prompt }),
    })
    await updates.check()
    await updates.download()

    // `rinari update`: el renderer pregunta; el aviso es de un solo uso.
    updates.prompt()
    expect(states.filter((state) => state.prompt)).toEqual([{ phase: 'downloaded', prompt: true }])
    expect(updates.snapshot().prompt).toBe(false)

    await updates.apply(true)
    expect(requestApply).toHaveBeenCalledWith(true)
    expect(updates.commitInstall()).toBe('launched')
    expect(launchInstaller).toHaveBeenCalledWith('C:/cache/pending/Rinari-Agent-Setup-0.2.1-x64.exe', [
      '--updated',
      '--force-run',
    ])
    expect(updater.quitAndInstall).not.toHaveBeenCalled()
  })

  it('does not apply before the SHA-512 validated download completes', async () => {
    const fixture = service()
    await expect(fixture.service.apply()).rejects.toBeInstanceOf(UpdateNotReady)
    expect(fixture.requestApply).not.toHaveBeenCalled()
  })

  it('returns to downloaded when the coordinated restart is cancelled', async () => {
    const fixture = service()
    fixture.updater.result = { isUpdateAvailable: true, updateInfo: { version: '0.2.1' } }
    fixture.requestApply.mockResolvedValue(false)
    await fixture.service.check()
    await fixture.service.download()
    await fixture.service.apply()
    expect(fixture.service.snapshot().phase).toBe('downloaded')
  })

  it('keeps a verified download ready when the user checks again', async () => {
    const fixture = service()
    fixture.updater.result = { isUpdateAvailable: true, updateInfo: { version: '0.2.1' } }
    await fixture.service.check()
    await fixture.service.download()
    await expect(fixture.service.check()).resolves.toMatchObject({ version: '0.2.1' })
    expect(fixture.service.snapshot().phase).toBe('downloaded')
    expect(fixture.updater.checkForUpdates).toHaveBeenCalledOnce()
  })

  it('fails closed outside an installed or explicit test channel', async () => {
    const fixture = service(new FakeUpdater(), false)
    await expect(fixture.service.check()).rejects.toBeInstanceOf(UpdatesUnavailable)
  })

  it('returns to idle when the provider reports the current version', async () => {
    const fixture = service()
    fixture.updater.result = { isUpdateAvailable: false, updateInfo: { version: '0.2.0' } }
    await expect(fixture.service.check()).resolves.toBeNull()
    expect(fixture.service.snapshot()).toMatchObject({
      phase: 'idle',
      available_version: null,
      progress: null,
    })
    await expect(fixture.service.download()).rejects.toBeInstanceOf(UpdateNotReady)
    expect(fixture.updater.downloadUpdate).not.toHaveBeenCalled()
  })

  // electron-updater emite `error` y después rechaza `checkForUpdates()`.
  function rejectCheck(fixture: ReturnType<typeof service>, message: string, code?: string) {
    const error = Object.assign(new Error(message), code ? { code } : {})
    fixture.updater.checkForUpdates.mockImplementationOnce(async () => {
      fixture.updater.emit('error', error)
      throw error
    })
  }

  it.each([
    ['an empty releases feed', 'ERR_XML_MISSED_ELEMENT'],
    ['releases without a tag', 'ERR_UPDATER_NO_PUBLISHED_VERSIONS'],
  ])('treats %s as up to date, not as a failure', async (_case, code) => {
    const fixture = service()
    rejectCheck(fixture, 'No published versions on GitHub', code)
    await expect(fixture.service.check()).resolves.toBeNull()
    expect(fixture.states).toEqual(['checking', 'idle'])
    expect(fixture.service.snapshot()).toMatchObject({ phase: 'idle', message: null, available_version: null })
  })

  it('still reports a check that could not reach the provider', async () => {
    const fixture = service()
    rejectCheck(fixture, 'net::ERR_INTERNET_DISCONNECTED')
    await expect(fixture.service.check()).rejects.toThrow('net::ERR_INTERNET_DISCONNECTED')
    expect(fixture.service.snapshot()).toMatchObject({ phase: 'error', message: 'net::ERR_INTERNET_DISCONNECTED' })
  })

  it('surfaces a corrupt download and never marks it ready', async () => {
    const fixture = service()
    fixture.updater.result = { isUpdateAvailable: true, updateInfo: { version: '0.2.1' } }
    fixture.updater.downloadUpdate.mockRejectedValueOnce(new Error('sha512 checksum mismatch'))
    await fixture.service.check()
    await expect(fixture.service.download()).rejects.toThrow('sha512 checksum mismatch')
    expect(fixture.service.snapshot()).toMatchObject({ phase: 'error', unsigned: true })
    expect(() => fixture.service.commitInstall()).toThrow(UpdateNotReady)
  })
})
