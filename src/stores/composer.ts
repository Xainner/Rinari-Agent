import { create } from 'zustand'
import type { AttachmentRef } from '../types'

export interface Draft {
  text: string
  attachments: AttachmentRef[]
}

/**
 * Borradores del Composer.
 *
 * La fuente de verdad es `draftsBySession`, indexada por `draftKey`
 * (`sessionId` o `'draft'` antes de que exista sesión). Cada Composer montado
 * lee y escribe su propia clave con las operaciones `*For`, de modo que varios
 * Composers (paneles del board) no comparten estado.
 *
 * `sessionKey/text/attachments` es el **espejo legacy** de la vista Normal:
 * los wrappers sin sufijo siguen operando sobre él y se mantiene sincronizado
 * cuando la clave coincide. Ningún componente de Boards debe consumirlo.
 */
interface ComposerState {
  sessionKey: string
  switchSession: (sessionKey: string) => void
  moveDraft: (fromSessionKey: string, toSessionKey: string) => void
  draftsBySession: Record<string, Draft>
  text: string
  setText: (text: string) => void
  clear: () => void
  attachments: AttachmentRef[]
  addAttachment: (attachment: AttachmentRef) => void
  updateAttachment: (path: string, patch: Partial<AttachmentRef>) => void
  removeAttachment: (path: string) => void
  clearAttachments: () => void
  updateAttachmentById: (id: string, patch: Partial<AttachmentRef>) => void
  replaceAttachmentById: (id: string, attachments: AttachmentRef[]) => void
  removeAttachmentsById: (ids: string[]) => void
  restoreSubmission: (sessionKey: string, attachmentIds: string[], text: string) => void
  // -- per-key API (Boards and Normal share it) --
  getDraft: (sessionKey: string) => Draft
  setTextFor: (sessionKey: string, text: string) => void
  clearFor: (sessionKey: string) => void
  addAttachmentFor: (sessionKey: string, attachment: AttachmentRef) => void
  updateAttachmentFor: (sessionKey: string, attachmentId: string, patch: Partial<AttachmentRef>) => void
  removeAttachmentFor: (sessionKey: string, attachmentId: string) => void
  clearAttachmentsFor: (sessionKey: string) => void
}

const STORAGE_KEY = 'rinari.composer.drafts.v1'
export const MAX_ATTACHMENTS = 8
export const EMPTY_ATTACHMENTS: AttachmentRef[] = Object.freeze([]) as unknown as AttachmentRef[]
export const EMPTY_DRAFT: Draft = Object.freeze({ text: '', attachments: EMPTY_ATTACHMENTS }) as Draft

function safeDraftAttachment(attachment: AttachmentRef): AttachmentRef {
  const previewUrl = attachment.previewUrl?.startsWith('data:') ? undefined : attachment.previewUrl
  return {
    ...attachment,
    previewUrl,
    data_url: undefined,
    status: attachment.status === 'preparing' ? 'error' : attachment.status,
    error: attachment.status === 'preparing'
      ? 'La preparacion se interrumpio; vuelve a intentar o adjunta el archivo de nuevo.'
      : attachment.error,
  }
}

function loadDrafts(): Record<string, Draft> {
  if (typeof window === 'undefined') return {}
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, Partial<Draft>>
    return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [
      key,
      {
        text: typeof value?.text === 'string' ? value.text : '',
        attachments: Array.isArray(value?.attachments)
          ? value.attachments.map((item) => safeDraftAttachment(item as AttachmentRef))
          : [],
      },
    ]))
  } catch {
    return {}
  }
}

function persistDrafts(drafts: Record<string, Draft>) {
  if (typeof window === 'undefined') return
  try {
    const serializable = Object.fromEntries(
      Object.entries(drafts).map(([key, value]) => [
        key,
        {
          text: value.text,
          attachments: value.attachments.map(safeDraftAttachment),
        },
      ]),
    )
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable))
  } catch {
    // A full storage quota must not block chat.
  }
}

const initialDrafts = loadDrafts()
const initialDraft = initialDrafts.draft ?? { text: '', attachments: [] }

/** Draft of a key, reading the legacy mirror when it owns that key. */
function draftOf(state: ComposerState, sessionKey: string): Draft {
  if (sessionKey === state.sessionKey) return { text: state.text, attachments: state.attachments }
  return state.draftsBySession[sessionKey] ?? EMPTY_DRAFT
}

function attachmentSession(
  state: Pick<ComposerState, 'sessionKey' | 'attachments' | 'draftsBySession'>,
  id: string,
): string | undefined {
  if (state.attachments.some((item) => item.id === id)) return state.sessionKey
  return Object.entries(state.draftsBySession).find(([, draft]) =>
    draft.attachments.some((item) => item.id === id),
  )?.[0]
}

/** Writes one key; touches the legacy mirror only when it owns that key. */
function updateSessionDraft(
  state: ComposerState,
  sessionKey: string,
  draft: Draft,
): Partial<ComposerState> {
  return {
    ...(state.sessionKey === sessionKey ? draft : {}),
    draftsBySession: { ...state.draftsBySession, [sessionKey]: draft },
  }
}

export const useComposerStore = create<ComposerState>((set, get) => ({
  sessionKey: 'draft',
  switchSession: (sessionKey) => set((state) => {
    const saved = { text: state.text, attachments: state.attachments }
    const next = state.draftsBySession[sessionKey] ?? { text: '', attachments: [] }
    return {
      sessionKey,
      text: next.text,
      attachments: next.attachments,
      draftsBySession: { ...state.draftsBySession, [state.sessionKey]: saved },
    }
  }),
  text: initialDraft.text,
  draftsBySession: initialDrafts,
  attachments: initialDraft.attachments,

  // -- per-key API ------------------------------------------------------------
  getDraft: (sessionKey) => draftOf(get(), sessionKey),
  setTextFor: (sessionKey, text) => set((state) => {
    const draft = draftOf(state, sessionKey)
    if (draft.text === text) return state
    return updateSessionDraft(state, sessionKey, { text, attachments: draft.attachments })
  }),
  clearFor: (sessionKey) => set((state) => {
    const draft = draftOf(state, sessionKey)
    if (draft.text === '') return state
    return updateSessionDraft(state, sessionKey, { text: '', attachments: draft.attachments })
  }),
  addAttachmentFor: (sessionKey, attachment) => set((state) => {
    const draft = draftOf(state, sessionKey)
    if (draft.attachments.some((item) => item.path === attachment.path && item.name === attachment.name)) return state
    const attachments = [...draft.attachments, attachment].slice(0, MAX_ATTACHMENTS)
    return updateSessionDraft(state, sessionKey, { text: draft.text, attachments })
  }),
  updateAttachmentFor: (sessionKey, attachmentId, patch) => set((state) => {
    const draft = draftOf(state, sessionKey)
    if (!draft.attachments.some((item) => item.id === attachmentId)) return state
    const attachments = draft.attachments.map((item) => item.id === attachmentId ? { ...item, ...patch } : item)
    return updateSessionDraft(state, sessionKey, { text: draft.text, attachments })
  }),
  removeAttachmentFor: (sessionKey, attachmentId) => set((state) => {
    const draft = draftOf(state, sessionKey)
    if (!draft.attachments.some((item) => item.id === attachmentId)) return state
    const attachments = draft.attachments.filter((item) => item.id !== attachmentId)
    return updateSessionDraft(state, sessionKey, { text: draft.text, attachments })
  }),
  clearAttachmentsFor: (sessionKey) => set((state) => {
    const draft = draftOf(state, sessionKey)
    if (draft.attachments.length === 0) return state
    return updateSessionDraft(state, sessionKey, { text: draft.text, attachments: [] })
  }),

  // -- legacy mirror wrappers (Normal view) ----------------------------------
  setText: (text) => get().setTextFor(get().sessionKey, text),
  clear: () => get().clearFor(get().sessionKey),
  addAttachment: (attachment) => get().addAttachmentFor(get().sessionKey, attachment),
  updateAttachment: (path, patch) => set((state) => {
    const attachments = state.attachments.map((item) => item.path === path ? { ...item, ...patch } : item)
    return updateSessionDraft(state, state.sessionKey, { text: state.text, attachments })
  }),
  removeAttachment: (path) => set((state) => {
    const attachments = state.attachments.filter((item) => item.path !== path)
    return updateSessionDraft(state, state.sessionKey, { text: state.text, attachments })
  }),
  clearAttachments: () => get().clearAttachmentsFor(get().sessionKey),

  // -- id-addressed operations (work across keys) ---------------------------
  updateAttachmentById: (id, patch) => set((state) => {
    const sessionKey = attachmentSession(state, id)
    if (!sessionKey) return state
    const draft = draftOf(state, sessionKey)
    return updateSessionDraft(state, sessionKey, {
      ...draft,
      attachments: draft.attachments.map((item) => item.id === id ? { ...item, ...patch } : item),
    })
  }),
  moveDraft: (fromSessionKey, toSessionKey) => set((state) => {
    const source = fromSessionKey === state.sessionKey
      ? { text: state.text, attachments: state.attachments }
      : state.draftsBySession[fromSessionKey] ?? { text: '', attachments: [] }
    const draftsBySession = { ...state.draftsBySession, [toSessionKey]: source }
    delete draftsBySession[fromSessionKey]
    return {
      sessionKey: toSessionKey,
      text: source.text,
      attachments: source.attachments,
      draftsBySession,
    }
  }),
  replaceAttachmentById: (id, replacements) => set((state) => {
    const sessionKey = attachmentSession(state, id)
    // Removal while preparation was in flight wins over its late result.
    if (!sessionKey) return state
    const draft = draftOf(state, sessionKey)
    const index = draft.attachments.findIndex((item) => item.id === id)
    const attachments = [...draft.attachments]
    attachments.splice(index, 1, ...replacements)
    return updateSessionDraft(state, sessionKey, { ...draft, attachments: attachments.slice(0, MAX_ATTACHMENTS) })
  }),
  removeAttachmentsById: (ids) => set((state) => {
    const wanted = new Set(ids)
    let changed = false
    const draftsBySession: Record<string, Draft> = {}
    for (const [key, draft] of Object.entries(state.draftsBySession)) {
      if (draft.attachments.some((item) => wanted.has(item.id))) {
        changed = true
        draftsBySession[key] = { ...draft, attachments: draft.attachments.filter((item) => !wanted.has(item.id)) }
      } else {
        // Untouched drafts keep their reference: a finished upload in A must
        // not re-render every other Composer.
        draftsBySession[key] = draft
      }
    }
    const mirrorTouched = state.attachments.some((item) => wanted.has(item.id))
    if (!changed && !mirrorTouched) return state
    const attachments = mirrorTouched ? state.attachments.filter((item) => !wanted.has(item.id)) : state.attachments
    draftsBySession[state.sessionKey] = { text: state.text, attachments }
    return { attachments, draftsBySession }
  }),
  restoreSubmission: (fallbackKey, attachmentIds, text) => set((state) => {
    const sessionKey = attachmentIds.map((id) => attachmentSession(state, id)).find(Boolean) ?? fallbackKey
    const draft = draftOf(state, sessionKey)
    // Preserve anything the user typed while the request was in flight.
    if (draft.text) return state
    return updateSessionDraft(state, sessionKey, { ...draft, text })
  }),
}))

useComposerStore.subscribe((state) => persistDrafts(state.draftsBySession))

/**
 * Selector for hooks: `useComposerStore(selectDraft(draftKey))`. Every write
 * goes through `updateSessionDraft`, so `draftsBySession[key]` is always the
 * authoritative object (the legacy mirror shares the same reference).
 */
export const selectDraft = (sessionKey: string) => (state: ComposerState): Draft =>
  state.draftsBySession[sessionKey] ?? EMPTY_DRAFT
