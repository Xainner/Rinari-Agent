// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { I18nProvider } from '../../i18n'
import { setPlatformForTests } from '../../platform'
import { createTestBridge, type TestBridge } from '../../platform/testBridge'
import { useComposerStore } from '../../stores/composer'
import { resetConversationDraftsForTests, useConversationDraftStore } from '../../stores/conversationDraft'
import SkillDuplicates from './SkillDuplicates'

const pair = { skills: ['lab-image', 'visual-lab-generate'] as [string, string], score: 0.41, shared: ['int8', 'bf16', 'webp'] }

let bridge: TestBridge
let restore: () => void
beforeEach(() => {
  bridge = createTestBridge()
  bridge.mockCommand('skill_duplicates_list', () => ({ pairs: [pair] }))
  restore = setPlatformForTests(bridge)
})
afterEach(() => { cleanup(); restore(); resetConversationDraftsForTests() })

const view = () => render(<I18nProvider lang="es"><SkillDuplicates /></I18nProvider>)

describe('posibles duplicados en Ajustes › Skills', () => {
  it('lista el par con lo que comparten, y «No son duplicados» lo descarta', async () => {
    bridge.mockCommand('skill_duplicates_dismiss', () => ({ pairs: [] }))
    view()
    const row = await screen.findByTestId('skill-duplicate-pair')
    expect(row.textContent).toContain('lab-image · visual-lab-generate')
    expect(row.textContent).toContain('comparten: int8, bf16, webp')
    await userEvent.click(within(row).getByRole('button', { name: 'No son duplicados' }))
    await waitFor(() => expect(screen.queryByTestId('skill-duplicates')).toBeNull())
    expect(bridge.calls.filter((c) => c.name === 'skill_duplicates_dismiss').map((c) => c.args)).toEqual([
      { skills: ['lab-image', 'visual-lab-generate'] },
    ])
  })

  it('«Fusionar» abre una conversación con el pedido escrito, sin enviarlo', async () => {
    const actions: string[] = []
    const listener = (event: Event) => {
      const action = (event as CustomEvent<string>).detail
      actions.push(action)
      // What App does for new-chat: a draft for the Normal view.
      if (action === 'new-chat') useConversationDraftStore.getState().openNormal(null)
    }
    window.addEventListener('rinari-action', listener)
    const stop = () => window.removeEventListener('rinari-action', listener)
    try {
      view()
      const row = await screen.findByTestId('skill-duplicate-pair')
      await userEvent.click(within(row).getByRole('button', { name: 'Fusionar' }))
      expect(actions).toEqual(['new-chat'])
      const key = useConversationDraftStore.getState().normal?.key ?? 'draft'
      expect(useComposerStore.getState().getDraft(key).text).toBe('/merge-skills lab-image visual-lab-generate')
      expect(bridge.calls.some((c) => c.name === 'turn_start')).toBe(false)
    } finally {
      stop()
    }
  })

  it('un Engine sin el gestor no muestra la sección', async () => {
    bridge.mockCommand('skill_duplicates_list', () => { throw new Error('unknown method') })
    view()
    await waitFor(() => expect(bridge.calls.some((c) => c.name === 'skill_duplicates_list')).toBe(true))
    expect(screen.queryByTestId('skill-duplicates')).toBeNull()
  })
})
