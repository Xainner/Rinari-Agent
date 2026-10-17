import { afterEach, describe, expect, it } from 'vitest'
import { resetConversationDraftsForTests, setProjectPermissionDefaults, useConversationDraftStore } from './conversationDraft'

describe('a new conversation starts in its project permissions (permisos v4 P-5)', () => {
  afterEach(() => {
    resetConversationDraftsForTests()
    setProjectPermissionDefaults([])
  })

  it('takes the project default, and Proyecto without one', () => {
    setProjectPermissionDefaults([{ id: 'prj_a', permission_profile: 'read-only' }, { id: 'prj_b', permission_profile: null }])
    const drafts = useConversationDraftStore.getState()
    expect(drafts.openNormal('prj_a').permissionProfile).toBe('read-only')
    expect(drafts.openNormal('prj_b').permissionProfile).toBe('workspace')
    expect(drafts.openNormal(null).permissionProfile).toBe('workspace')
  })

  it('a kept draft follows a changed default until the owner picks one', () => {
    const drafts = useConversationDraftStore.getState()
    drafts.openNormal('prj_a')
    setProjectPermissionDefaults([{ id: 'prj_a', permission_profile: 'full-access' }])
    expect(useConversationDraftStore.getState().openNormal('prj_a').permissionProfile).toBe('full-access')
    useConversationDraftStore.getState().updateNormal({ permissionProfile: 'read-only' })
    setProjectPermissionDefaults([{ id: 'prj_a', permission_profile: 'workspace' }])
    expect(useConversationDraftStore.getState().openNormal('prj_a').permissionProfile).toBe('read-only')
  })

  it('an open draft follows a default changed while it is open', () => {
    useConversationDraftStore.getState().openNormal('prj_a')
    setProjectPermissionDefaults([{ id: 'prj_a', permission_profile: 'read-only' }])
    expect(useConversationDraftStore.getState().normal?.permissionProfile).toBe('read-only')
    useConversationDraftStore.getState().updateNormal({ permissionProfile: 'workspace' })
    setProjectPermissionDefaults([{ id: 'prj_a', permission_profile: 'full-access' }])
    expect(useConversationDraftStore.getState().normal?.permissionProfile).toBe('workspace')
  })

  it('moving a draft to another project takes that project default, unless picked by hand', () => {
    setProjectPermissionDefaults([{ id: 'prj_a', permission_profile: 'read-only' }])
    const drafts = useConversationDraftStore.getState()
    drafts.openNormal(null)
    drafts.moveNormal('prj_a')
    expect(useConversationDraftStore.getState().normal?.permissionProfile).toBe('read-only')
    useConversationDraftStore.getState().updateNormal({ permissionProfile: 'full-access' })
    useConversationDraftStore.getState().moveNormal(null)
    expect(useConversationDraftStore.getState().normal?.permissionProfile).toBe('full-access')
  })
})
