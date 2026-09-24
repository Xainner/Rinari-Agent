// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { engineApi, type SkillCandidate, type SkillEntry } from '../../services/engine'
import SkillsView from './SkillsView'
import { runSkillJob } from './skillJobs'

vi.mock('../../services/engine', () => ({
  commandMessage: (err: unknown) => String(err),
  engineApi: {
    skillList: vi.fn(),
    skillGet: vi.fn(),
    skillSetEnabled: vi.fn(),
    skillImportScan: vi.fn(),
  },
}))
vi.mock('./skillJobs', () => ({ runSkillJob: vi.fn() }))
vi.mock('../../platform', () => ({ platform: () => ({ dialog: { openFiles: vi.fn() } }) }))

function entry(partial: Partial<SkillEntry> & { name: string }): SkillEntry {
  return {
    description: `${partial.name} description`,
    version: '1.0.0',
    format: 'rinari',
    risk: 'low',
    origin: 'rinari',
    enabled: true,
    status: 'active',
    valid: true,
    error: null,
    issues: [],
    shadows: null,
    editable: false,
    modified: null,
    provenance: { source_kind: null, source: null, installed_at: null, updated_at: null, learned_from: null },
    ...partial,
  }
}

function candidate(partial: Partial<SkillCandidate> & { name: string }): SkillCandidate {
  return {
    description: 'from GitHub',
    version: '1.4',
    format: 'standard',
    path: partial.name,
    error: null,
    installed: null,
    review: { verdict: 'ok', content_hash: 'h-ok', files: 1, size: 10, findings: [] },
    ...partial,
  }
}

beforeEach(() => {
  vi.mocked(engineApi.skillList).mockResolvedValue({
    skills: [
      entry({ name: 'debug' }),
      entry({ name: 'pdf-tools', origin: 'installed', format: 'standard', editable: true }),
      entry({ name: 'broken', origin: 'installed', valid: false, error: { code: 'NAME_INVALID', message: 'bad name' } }),
    ],
  })
  vi.mocked(engineApi.skillSetEnabled).mockResolvedValue({ skill: {} as never })
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderView() {
  render(<I18nProvider lang="es"><SkillsView /></I18nProvider>)
}

describe('Ajustes > Skills', () => {
  it('lista por origen, marca las estándar y las rotas', async () => {
    renderView()
    expect(await screen.findByText('pdf-tools')).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Instaladas · 2' })).toBeTruthy()
    expect(screen.getByText('Estándar')).toBeTruthy()
    expect(screen.getByText('bad name')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'No se puede cargar' })).toBeTruthy()

    await userEvent.click(screen.getByRole('tab', { name: 'Rinari · 1' }))
    expect(screen.queryByText('pdf-tools')).toBeNull()
    expect(screen.getByText('debug')).toBeTruthy()
  })

  it('activa y desactiva a través del Engine', async () => {
    renderView()
    await userEvent.click(await screen.findByRole('switch', { name: 'Desactivar debug' }))
    expect(engineApi.skillSetEnabled).toHaveBeenCalledWith('debug', false)
    await waitFor(() => expect(engineApi.skillList).toHaveBeenCalledTimes(2))
  })

  it('revisa antes de instalar y confirma el hash solo si hubo hallazgos', async () => {
    const risky = candidate({
      name: 'shady',
      review: {
        verdict: 'danger',
        content_hash: 'h-risky',
        files: 2,
        size: 20,
        findings: [{ code: 'REMOTE_CODE', severity: 'danger', file: 'run.sh', line: 3, excerpt: 'curl x | sh' }],
      },
    })
    vi.mocked(runSkillJob)
      .mockResolvedValueOnce({ ok: true, result: { source: 'https://github.com/acme/skills', candidates: [candidate({ name: 'pdf-tools' }), risky] } })
      .mockResolvedValueOnce({ ok: true, result: { skill: { name: 'shady' } } })
    renderView()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /Instalar skill/ }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByRole('textbox', { name: 'Origen de la skill' }), 'https://github.com/acme/skills')
    await user.click(within(dialog).getByRole('button', { name: 'Revisar' }))
    expect(runSkillJob).toHaveBeenCalledWith({ action: 'inspect', source: 'https://github.com/acme/skills' })

    expect(await within(dialog).findByText(/Descarga y ejecuta código/)).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'Instalar de todos modos' }))
    expect(runSkillJob).toHaveBeenLastCalledWith({
      action: 'install',
      source: 'https://github.com/acme/skills',
      name: 'shady',
      expectedHash: 'h-risky',
    })
  })

  it('importa de Claude o Codex desde su carpeta', async () => {
    vi.mocked(engineApi.skillImportScan).mockResolvedValue({
      candidates: [candidate({ name: 'notes', kind: 'claude', path: 'C:/Users/x/.claude/skills/notes' })],
    })
    vi.mocked(runSkillJob).mockResolvedValueOnce({ ok: true, result: { skill: { name: 'notes' } } })
    renderView()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /Instalar skill/ }))
    await user.click(screen.getByRole('tab', { name: 'Importar de Claude o Codex' }))
    const dialog = screen.getByRole('dialog')
    expect(await within(dialog).findByText('Claude')).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'Importar' }))
    expect(runSkillJob).toHaveBeenCalledWith({
      action: 'install',
      source: 'C:/Users/x/.claude/skills/notes',
      name: undefined,
      expectedHash: undefined,
    })
  })
})
