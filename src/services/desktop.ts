import type { SessionSummary } from './engine'

import type {
  QuestionRequest,
  FilePreview,
  WebPreview,
} from '../types/protocol.generated'
import { platform } from '../platform'

export type { WebPreview } from '../types/protocol.generated'
export type { QuestionRequest, FilePreview } from '../types/protocol.generated'

export const desktopApi = {
  startPreview: (
    session_id: string,
    path: string,
    turn_id?: string,
    run_dev = false,
    dev_url?: string,
  ) =>
    platform().command<WebPreview>('workspace_preview_start', {
      session_id,
      path,
      turn_id,
      run_dev,
      dev_url,
    }),
  previewStatus: (session_id: string, preview_id: string) =>
    platform().command<WebPreview>('workspace_preview_status', { session_id, preview_id }),
  stopPreview: (session_id: string, preview_id: string) =>
    platform().command<{ stopped: boolean }>('workspace_preview_stop', {
      session_id,
      preview_id,
    }),
  openFile: (session_id: string, path: string, turn_id?: string) =>
    platform().command<void>('workspace_file_open', { session_id, path, turn_id }),
  moveSession: (session_id: string, project_id: string | null) =>
    platform().command<{ session: SessionSummary }>('session_move', {
      session_id,
      project_id,
    }),
  readFile: (session_id: string, path: string, turn_id?: string) =>
    platform().command<FilePreview>('workspace_file_read', { session_id, path, turn_id }),
  questions: (session_id: string) =>
    platform().command<{ questions: QuestionRequest[] }>('question_list', { session_id }),
  answer: (
    request: QuestionRequest,
    answers: Record<string, string>,
    skip = false,
  ) =>
    platform().command<QuestionRequest>('question_resolve', {
      session_id: request.session_id,
      request_id: request.request_id,
      answers,
      status: skip ? 'skipped' : 'answered',
    }),
}
