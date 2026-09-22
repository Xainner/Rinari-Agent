// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { translateCommand } from '../../electron/main/engine/translateCommand'
import { installMockPlatform } from '../test/mockPlatform'
import { engineApi } from './engine'

const { invoke } = installMockPlatform()

describe('session bridge argument contract', () => {
  it('preserves project identity and permission across the Electron boundary', async () => {
    await engineApi.createSession({ project_id: 'project-123', permission_profile: 'workspace' })
    expect(invoke).toHaveBeenCalledWith('session_create', expect.objectContaining({
      project_id: 'project-123', permission_profile: 'workspace', chat: false,
    }))
    expect(translateCommand('session_create', {
      project_id: 'project-123', permission_profile: 'workspace', chat: false,
    })).toEqual({
      method: 'session.create',
      params: {
        project_id: 'project-123',
        permission_profile: 'workspace',
        title: null,
        mode: null,
      },
    })
  })

  it('maps session.get to its protocol method and renames reference to ref', async () => {
    await engineApi.sessionGet('ses_old')
    expect(invoke).toHaveBeenCalledWith('session_get', { reference: 'ses_old' })
    expect(translateCommand('session_get', { reference: 'ses_old' })).toEqual({
      method: 'session.get',
      params: { ref: 'ses_old' },
    })
  })
})
