// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import ProcessLogView, { normalizeLogText } from './ProcessLogView'
import { copyText } from '../../lib/clipboard'
import { I18nProvider } from '../../i18n'
import type { ProcessOutput } from '../../types/protocol.generated'

vi.mock('../../lib/clipboard', () => ({ copyText: vi.fn(async () => true) }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

const base: ProcessOutput = {
  process: { id: 'process:proc_001', kind: 'process', command: 'npm run dev', cwd: 'C:/site', running: true, can_stop: true },
  stdout: 'línea uno\nlínea dos\n',
  stderr: '',
  truncated: false,
}

function setup(output: ProcessOutput | null = base, paused = false) {
  const onPausedChange = vi.fn()
  render(
    <I18nProvider lang="es">
      <ProcessLogView output={output} paused={paused} onPausedChange={onPausedChange} />
    </I18nProvider>,
  )
  return { onPausedChange }
}

it('normaliza ANSI/OSC sin ejecutar nada', () => {
  expect(normalizeLogText('[32mok[0m hecho\rprogreso')).toBe('ok hecho\nprogreso')
  expect(normalizeLogText(']8;;https://x.testenlace]8;;')).toBe('enlace')
})

it('búsqueda literal cuenta y resalta sin mover el log', () => {
  setup()
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'línea' } })
  expect(screen.getByText('2 coincidencias')).toBeTruthy()
  expect(document.querySelectorAll('mark')).toHaveLength(2)
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ausente' } })
  expect(screen.getByText('Sin coincidencias')).toBeTruthy()
})

it('copiar captura el snapshot con nota de parcialidad', async () => {
  setup({ ...base, truncated: true })
  fireEvent.click(screen.getByRole('button', { name: /Copiar salida visible/ }))
  await screen.findByText('Salida copiada')
  expect(copyText).toHaveBeenCalledTimes(1)
  const copied = vi.mocked(copyText).mock.calls[0]?.[0] ?? ''
  expect(copied).toMatch(/línea uno/)
  expect(copied).toMatch(/Salida parcial/)
})

it('pausar congela el texto mostrado', () => {
  const view = render(
    <I18nProvider lang="es">
      <ProcessLogView output={base} paused={false} onPausedChange={() => {}} />
    </I18nProvider>,
  )
  view.rerender(
    <I18nProvider lang="es">
      <ProcessLogView output={base} paused={true} onPausedChange={() => {}} />
    </I18nProvider>,
  )
  view.rerender(
    <I18nProvider lang="es">
      <ProcessLogView output={{ ...base, stdout: 'nuevo contenido\n' }} paused={true} onPausedChange={() => {}} />
    </I18nProvider>,
  )
  expect(view.container.textContent).toMatch(/línea uno/)
  expect(view.container.textContent).not.toMatch(/nuevo contenido/)
  expect(view.getByText(/Vista pausada/)).toBeTruthy()
})

it('avisa de cambios con el mismo tamaño', () => {
  const view = render(
    <I18nProvider lang="es">
      <ProcessLogView output={base} paused={false} onPausedChange={() => {}} />
    </I18nProvider>,
  )
  // Buscar detiene el seguimiento; un update del mismo tamaño debe avisar.
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'uno' } })
  view.rerender(
    <I18nProvider lang="es">
      <ProcessLogView
        output={{ ...base, stdout: 'línea una\nlínea dos\n' }}
        paused={false}
        onPausedChange={() => {}}
      />
    </I18nProvider>,
  )
  expect(view.getByText(/Hay cambios/)).toBeTruthy()
})

it('copiar con clipboard denegado muestra error', async () => {
  vi.mocked(copyText).mockResolvedValueOnce(false)
  setup()
  fireEvent.click(screen.getByRole('button', { name: /Copiar salida visible/ }))
  expect(await screen.findByText(/No se pudo copiar/)).toBeTruthy()
})
