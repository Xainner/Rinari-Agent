// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import ProcessQueryDialog from './ProcessQueryDialog'
import { useComposerStore } from '../../stores/composer'
import { I18nProvider } from '../../i18n'
import type { ManagedProcess } from '../../types/protocol.generated'

afterEach(() => {
  cleanup()
  useComposerStore.setState({ sessionKey: 'draft', text: '' })
})

const stoppedPreview: ManagedProcess = {
  id: 'preview:p1',
  kind: 'preview',
  command: 'Vista previa HTML',
  cwd: 'C:/site',
  running: false,
  can_stop: false,
  exit_code: null,
  url: 'http://127.0.0.1:8080/',
}

function setup(resource: ManagedProcess, opts: { online?: boolean; stopConfirmed?: boolean; sessionId?: string; output?: { stdout: string; stderr: string } | null } = {}) {
  useComposerStore.setState({ sessionKey: opts.sessionId ?? 's9', text: '' })
  const output =
    opts.output == null
      ? null
      : {
          process: resource,
          stdout: opts.output.stdout,
          stderr: opts.output.stderr,
          truncated: false,
        }
  return render(
    <I18nProvider lang="es">
      <ProcessQueryDialog
        sessionId={opts.sessionId ?? 's9'}
        resource={resource}
        output={output}
        online={opts.online ?? true}
        stopConfirmed={opts.stopConfirmed ?? false}
        open={true}
        onClose={() => {}}
      />
    </I18nProvider>,
  )
}

it('V2B-1: detención confirmada no se redacta como código 0', () => {
  const view = setup(stoppedPreview, { stopConfirmed: true })
  fireEvent.click(screen.getByRole('button', { name: /Añadir al borrador/ }))
  const text = useComposerStore.getState().text
  expect(text).toMatch(/Detención confirmada/)
  expect(text).not.toMatch(/código 0/)
  view.unmount()
})

it('V2B-1: sin conexión redacta Estado sin verificar', () => {
  setup({ ...stoppedPreview, running: true, can_stop: true }, { online: false })
  fireEvent.click(screen.getByRole('button', { name: /Añadir al borrador/ }))
  expect(useComposerStore.getState().text).toMatch(/Estado sin verificar/)
})

it('V2-2: el extracto se rellena al llegar la salida y respeta edición', () => {
  const view = setup(stoppedPreview, { output: null })
  const area = screen.getByRole('textbox') as HTMLTextAreaElement
  expect(area.value).toBe('')
  view.rerender(
    <I18nProvider lang="es">
      <ProcessQueryDialog
        sessionId="s9"
        resource={stoppedPreview}
        output={{ process: stoppedPreview, stdout: 'hola logs', stderr: '', truncated: false }}
        online={true}
        stopConfirmed={true}
        open={true}
        onClose={() => {}}
      />
    </I18nProvider>,
  )
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toMatch(/hola logs/)
  // Edición del usuario: no se sobrescribe con llegadas posteriores.
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'mi nota' } })
  view.rerender(
    <I18nProvider lang="es">
      <ProcessQueryDialog
        sessionId="s9"
        resource={stoppedPreview}
        output={{ process: stoppedPreview, stdout: 'otra salida', stderr: '', truncated: false }}
        online={true}
        stopConfirmed={true}
        open={true}
        onClose={() => {}}
      />
    </I18nProvider>,
  )
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('mi nota')
})
