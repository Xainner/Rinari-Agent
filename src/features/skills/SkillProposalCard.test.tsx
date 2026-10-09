// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { I18nProvider } from '../../i18n'
import { setPlatformForTests } from '../../platform'
import { createTestBridge, type TestBridge } from '../../platform/testBridge'
import type { SkillTimelineItem } from '../activity/types'
import { SkillProposalCard } from './SkillProposalCard'

const base: SkillTimelineItem = {
  id: 'skill:visual-lab-generate', type: 'skill', activitySeq: 2, occurredAt: 1_000,
  name: 'visual-lab-generate', status: 'pending', version: '1.0.0', update: false,
  description: 'Imágenes con ComfyUI por HTTP', similarTo: [], replaces: [],
}

let bridge: TestBridge
let restore: () => void
beforeEach(() => {
  bridge = createTestBridge()
  restore = setPlatformForTests(bridge)
})
afterEach(() => { cleanup(); restore() })

const view = (item: SkillTimelineItem) => render(<I18nProvider lang="es"><SkillProposalCard item={item} /></I18nProvider>)
const callsTo = (name: string) => bridge.calls.filter((call) => call.name === name).map((call) => call.args)

describe('skill propuesta en el chat', () => {
  it('una parecida a otra dice a cuál y por qué, y se aprueba', async () => {
    bridge.mockCommand('skill_pending_approve', () => ({ skill: { name: 'visual-lab-generate' }, turned_off: [] }))
    view({ ...base, similarTo: [{ name: 'lab-image', shared: ['int8'], reason: 'usa el ComfyUI local' }] })
    const card = screen.getByTestId('skill-proposal')
    expect(within(card).getByText('Rinari propone una skill nueva: visual-lab-generate')).toBeTruthy()
    expect(within(card).getByTestId('skill-similar').textContent).toBe('Parecida a lab-image — motivo: usa el ComfyUI local')
    await userEvent.click(within(card).getByRole('button', { name: 'Aprobar' }))
    await waitFor(() => expect(callsTo('skill_pending_approve')).toEqual([{ name: 'visual-lab-generate' }]))
    expect((await screen.findByRole('status')).textContent).toBe('Aprobada.')
    // Approved: undo and view, no more approve/discard.
    expect(within(card).queryByRole('button', { name: 'Aprobar' })).toBeNull()
    expect(within(card).getByRole('button', { name: 'Deshacer' })).toBeTruthy()
  })

  it('una fusión dice qué reemplaza y, al aprobarla, qué se apagó; deshacerla las enciende', async () => {
    bridge.mockCommand('skill_pending_approve', () => ({ skill: { name: 'image-lab' }, turned_off: ['lab-image', 'visual-lab-generate'] }))
    bridge.mockCommand('skill_revert', () => ({ name: 'image-lab', restored: null, removed: true, turned_on: ['lab-image', 'visual-lab-generate'] }))
    view({ ...base, id: 'skill:image-lab', name: 'image-lab', replaces: ['lab-image', 'visual-lab-generate'] })
    const card = screen.getByTestId('skill-proposal')
    expect(within(card).getByText('Rinari propone fusionar lab-image, visual-lab-generate en image-lab')).toBeTruthy()
    await userEvent.click(within(card).getByRole('button', { name: 'Aprobar' }))
    expect((await screen.findByRole('status')).textContent).toBe('Aprobada. Se apagaron: lab-image, visual-lab-generate.')
    await userEvent.click(within(card).getByRole('button', { name: 'Deshacer' }))
    await waitFor(() => expect(callsTo('skill_revert')).toEqual([{ name: 'image-lab' }]))
    expect((await screen.findByRole('status')).textContent).toBe('Deshecha. Se volvieron a encender: lab-image, visual-lab-generate.')
  })

  it('Descartar rechaza la propuesta', async () => {
    bridge.mockCommand('skill_pending_reject', () => ({ rejected: true }))
    view(base)
    await userEvent.click(screen.getByRole('button', { name: 'Descartar' }))
    await waitFor(() => expect(callsTo('skill_pending_reject')).toEqual([{ name: 'visual-lab-generate' }]))
    expect((await screen.findByRole('status')).textContent).toBe('Descartada.')
  })

  it('una lección guardada (la pidió el dueño) es una mejora activa con Deshacer', () => {
    view({ ...base, status: 'active', update: true, previousVersion: '1.0.0', version: '1.1.0' })
    const card = screen.getByTestId('skill-proposal')
    expect(within(card).getByText('visual-lab-generate mejorada (v1.0.0 → v1.1.0)')).toBeTruthy()
    expect(within(card).getByRole('status').textContent).toBe('Guardada: la pediste tú. Puedes deshacerla.')
    expect(within(card).getByRole('button', { name: 'Deshacer' })).toBeTruthy()
    expect(within(card).queryByRole('button', { name: 'Aprobar' })).toBeNull()
  })
})
