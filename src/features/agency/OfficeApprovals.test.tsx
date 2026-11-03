// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '../../i18n'
import type { AgencyAgent, AgencyTeam } from './types'

const resolveApproval = vi.hoisted(() => vi.fn(async () => undefined))
const selectSession = vi.hoisted(() => vi.fn(async () => undefined))
const approvals = vi.hoisted(() => [
  { approval_id: 'ap1', session_id: 'ses_copy', turn_id: 't1', capability: 'fs.write', target: 'site/index.html', risk: 'medium', description: 'fs.patch site/index.html' },
  { approval_id: 'ap2', session_id: 'ses_other', turn_id: 't2', capability: 'shell.exec', target: 'npm test', risk: 'medium', description: 'npm test' },
])
vi.mock('../engine/EngineContext', () => ({
  useOptionalEngineData: () => ({ approvals }),
  useOptionalEngineCommands: () => ({ resolveApproval, selectSession }),
}))

import { OfficeApprovals } from './OfficeApprovals'

const team = { id: 'team1', name: 'Café', posts: [{ agent_id: 'ag_copy', session_id: 'ses_copy' }] } as unknown as AgencyTeam
const members = [{ id: 'ag_copy', name: 'Copywriter' }] as AgencyAgent[]

afterEach(cleanup)

describe('the office shows what its posts wait for', () => {
  it('names the agent and what it asks, only for this team, and resolves it there', async () => {
    render(<I18nProvider lang="es"><OfficeApprovals team={team} members={members} /></I18nProvider>)
    expect(screen.getAllByTestId('agency-office-approval')).toHaveLength(1)
    expect(screen.getByText('Copywriter espera tu aprobación')).toBeTruthy()
    expect(screen.getByText('fs.patch site/index.html')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Permitir una vez' }))
    expect(resolveApproval).toHaveBeenCalledWith('ap1', 'allow_once')
    await userEvent.click(screen.getByRole('button', { name: /Abrir su puesto/ }))
    expect(selectSession).toHaveBeenCalledWith('ses_copy')
  })
})
