// @vitest-environment node
import sessionCommands from '../../src-tauri/src/commands/sessions.rs?raw'
import tauriMain from '../../src-tauri/src/main.rs?raw'
import supervisor from '../../src-tauri/src/engine/supervisor.rs?raw'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue({}) }))
import { invoke } from '@tauri-apps/api/core'
import { engineApi } from './engine'

const lf = (text: string) => text.replace(/\r\n/g, '\n')

describe('session bridge argument contract', () => {
  it('preserves project identity and permission across the Tauri boundary', async () => {
    await engineApi.createSession({ project_id: 'project-123', permission_profile: 'workspace' })
    expect(invoke).toHaveBeenCalledWith('session_create', expect.objectContaining({
      project_id: 'project-123', permission_profile: 'workspace', chat: false,
    }))
    // Tauri defaults to camelCase: optional snake_case arguments otherwise vanish silently.
    const rust = lf(sessionCommands)
    for (const command of ['session_create', 'session_list']) {
      expect(rust).toContain(`#[tauri::command(rename_all = "snake_case")]\npub(crate) async fn ${command}(`)
    }
  })

  it('exposes session.get as a registered Tauri command with a single reference argument', async () => {
    await engineApi.sessionGet('ses_old')
    expect(invoke).toHaveBeenCalledWith('session_get', { reference: 'ses_old' })
    expect(lf(sessionCommands)).toContain('#[tauri::command]\npub(crate) async fn session_get(')
    expect(lf(supervisor)).toContain('Method::SessionGet, Some(json!({"ref": reference}))')
    expect(lf(tauriMain)).toContain('commands::sessions::session_get,')
  })
})
