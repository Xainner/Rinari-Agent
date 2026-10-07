// @vitest-environment jsdom
import { installMockPlatform } from '../../test/mockPlatform'
const platform = installMockPlatform()
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { I18nProvider } from '../../i18n'
import { DocumentView } from './DocumentView'
import { documentKind } from './documentsApi'

const revision = { id: 'rev_1', session_id: 's', document_id: 'doc_1', parent_id: null, kind: 'pptx', name: 'ventas.pptx', uri: 'artifact://s/media/ventas.pptx', sha256: 'abcdef1234567890', size: 10, operation: 'import', backend: null, state: 'draft', report: null, created_at: '' }
const inspection = {
  revision,
  container: { kind: 'pptx', part_count: 20, expanded_bytes: 1, encrypted: false, risks: [{ code: 'macros', detail: 'Contains VBA macros' }] },
  inspection: { slide_count: 2 },
}
const pages = [
  { page: 1, uri: 'artifact://s/previews/rev_1-office-p0001.png', width: 1600, height: 900 },
  { page: 2, uri: 'artifact://s/previews/rev_1-office-p0002.png', width: 1600, height: 900 },
]
let preview: unknown = null
let startError: unknown = null

beforeEach(() => {
  preview = null
  startError = null
  platform.invoke.mockImplementation(async (name: string) => {
    if (name === 'engine_status') return { state: 'ready', capabilities: { document_preview_v1: true } }
    if (name === 'documents_inspect') return inspection
    if (name === 'documents_preview_get') return { revision, preview }
    if (name === 'documents_job_start') {
      if (startError) throw startError
      return { job_id: 'djob_1', session_id: 's', operation: 'render', status: 'running', phase: 'render', progress: null, result: null, error: null }
    }
    if (name === 'documents_job_get') return { job_id: 'djob_1', session_id: 's', operation: 'render', status: 'running', phase: 'render', progress: null, result: null, error: null }
    if (name === 'attachment_preview') return { data_url: 'data:image/png;base64,AA==' }
    if (name === 'documents_range_get') {
      return { slides: [{ index: 1, shapes: [{ shape_id: 2, kind: 'text', text: 'Crecimiento del norte' }, { shape_id: 3, kind: 'chart', chart: { type: 'COLUMN_CLUSTERED', series: [{ name: '2026', values: [1, 2] }] } }], notes: 'Nota 1' }], truncated: false, next_cursor: null }
    }
    return {}
  })
})
afterEach(cleanup)

const view = () => render(<I18nProvider lang="es"><DocumentView source={{ sessionId: 's', ref: revision.uri }} name="ventas.pptx" onOpenExternally={() => {}} /></I18nProvider>)

it('recognizes documents by name', () => {
  expect(documentKind('C:/x/Informe Final.DOCX')).toBe('docx')
  expect(documentKind('artifact://s/media/a.pptx')).toBe('pptx')
  expect(documentKind('notas.txt')).toBeNull()
})

it('renders when there is no preview and shows the slides when the job finishes', async () => {
  view()
  expect(await screen.findByText('Renderizando la vista previa…')).toBeTruthy()
  expect(screen.getByText('Macros (no se ejecutan)')).toBeTruthy()
  expect(screen.getByText('2 diapositivas')).toBeTruthy()
  act(() => {
    platform.bridge.emitEngineEvent({ type: 'event', event: 'document.job.updated', payload: {
      job_id: 'djob_1', session_id: 's', operation: 'render', status: 'succeeded', phase: 'publish', progress: null, error: null,
      result: { revision_id: 'rev_1', backend: 'office-com', pdf_uri: 'artifact://s/previews/rev_1-office-render.pdf', page_count: 2, pages },
    } } as never)
  })
  const thumbs = await screen.findAllByRole('button', { name: /Diapositiva \d/ })
  expect(thumbs).toHaveLength(2)
  await userEvent.click(thumbs[1])
  expect(thumbs[1].getAttribute('aria-current')).toBe('true')
  await waitFor(() => expect(screen.getByAltText('Diapositiva 2 de ventas.pptx')).toBeTruthy())
  expect(screen.getByText(/Microsoft Office/)).toBeTruthy()
})

it('uses an existing preview without rendering again', async () => {
  preview = { revision_id: 'rev_1', backend: 'office', pdf_uri: null, pages }
  view()
  expect(await screen.findAllByRole('button', { name: /Diapositiva \d/ })).toHaveLength(2)
  expect(platform.invoke.mock.calls.some(([name]) => name === 'documents_job_start')).toBe(false)
})

it('says what is missing when there is no renderer, and offers the app', async () => {
  startError = Object.assign(new Error('No renderer for pptx'), { code: 'BACKEND_UNAVAILABLE' })
  view()
  expect(await screen.findByText(/hace falta Microsoft Office o LibreOffice/)).toBeTruthy()
  expect(screen.getAllByRole('button', { name: 'Abrir externamente' }).length).toBeGreaterThan(0)
  expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull()
})

it('shows what the Engine read in the content tab', async () => {
  preview = { revision_id: 'rev_1', backend: 'office', pdf_uri: null, pages }
  view()
  await screen.findAllByRole('button', { name: /Diapositiva \d/ })
  await userEvent.click(screen.getByRole('tab', { name: 'Contenido' }))
  expect(await screen.findByText('Crecimiento del norte')).toBeTruthy()
  expect(screen.getByText('Nota 1')).toBeTruthy()
  expect(screen.getByText(/Gráfico COLUMN_CLUSTERED: 2026 \(2\)/)).toBeTruthy()
})
