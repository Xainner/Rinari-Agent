import { beforeEach, describe, expect, it } from 'vitest'
import { useComposerStore } from '../../stores/composer'
import { resetConversationDraftsForTests, sessionForDraft, useConversationDraftStore } from '../../stores/conversationDraft'
import { useSessionUiStore } from '../../stores/sessionUi'
import { moveNormalDraft } from './draftProject'

describe('moveNormalDraft (#42)', () => {
  beforeEach(() => {
    resetConversationDraftsForTests()
    useComposerStore.setState({ draftsBySession: {}, sessionKey: 'draft', text: '', attachments: [] })
  })

  it('carries text, attachments, mode, permissions and reasoning to the new project', () => {
    const drafts = useConversationDraftStore.getState()
    drafts.openNormal(null)
    drafts.updateNormal({ mode: 'plan', permissionProfile: 'read-only' })
    useComposerStore.getState().switchSession('draft')
    useComposerStore.getState().setTextFor('draft', 'hola mundo')
    useComposerStore.getState().addAttachmentFor('draft', { id: 'a1', name: 'nota.txt', path: '/tmp/nota.txt', kind: 'file' } as never)
    useSessionUiStore.getState().setReasoningFor('draft', 'high')

    expect(moveNormalDraft('prj_a')).toBe(true)

    const normal = useConversationDraftStore.getState().normal!
    expect(normal).toMatchObject({ key: 'draft:project:prj_a', projectId: 'prj_a', mode: 'plan', permissionProfile: 'read-only' })
    expect(useConversationDraftStore.getState().byKey.draft).toBeUndefined()
    const composer = useComposerStore.getState()
    expect(composer.getDraft('draft:project:prj_a').text).toBe('hola mundo')
    expect(composer.getDraft('draft:project:prj_a').attachments.map((item) => item.id)).toEqual(['a1'])
    expect(composer.getDraft('draft').text).toBe('')
    expect(composer.sessionKey).toBe('draft:project:prj_a')
    expect(useSessionUiStore.getState().reasoningFor('draft:project:prj_a')).toBe('high')
  })

  it('what was already waiting in the other project is kept, with the new text after it', () => {
    useComposerStore.getState().setTextFor('draft:project:prj_a', 'antes')
    useConversationDraftStore.getState().openNormal(null)
    useComposerStore.getState().switchSession('draft')
    useComposerStore.getState().setTextFor('draft', 'después')
    moveNormalDraft('prj_a')
    expect(useComposerStore.getState().getDraft('draft:project:prj_a').text).toBe('antes\n\ndespués')
  })

  it('back to «Sin proyecto» works too', () => {
    useConversationDraftStore.getState().openNormal('prj_a')
    expect(moveNormalDraft(null)).toBe(true)
    expect(useConversationDraftStore.getState().normal).toMatchObject({ key: 'draft', projectId: null })
  })

  it('refuses once the session exists or is being created', async () => {
    useConversationDraftStore.getState().openNormal(null)
    useConversationDraftStore.getState().updateNormal({ sessionId: 'ses_1' })
    expect(moveNormalDraft('prj_a')).toBe(false)

    resetConversationDraftsForTests()
    const draft = useConversationDraftStore.getState().openNormal(null)
    let release: (id: string) => void = () => {}
    const creating = sessionForDraft(draft, () => new Promise((resolve) => { release = resolve }))
    expect(moveNormalDraft('prj_a')).toBe(false)
    release('ses_2')
    await creating
  })
})
