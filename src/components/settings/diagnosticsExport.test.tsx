// @vitest-environment jsdom
// «Exportar diagnóstico» (Ajustes → Avanzado): lo que lleva el paquete se ve antes de guardarlo.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { I18nProvider } from '../../i18n'
import { setPlatformForTests } from '../../platform'
import { createTestBridge } from '../../platform/testBridge'
import { useDiagnosticsExport } from './diagnosticsExport'

afterEach(cleanup)

function Probe() {
  const diagnostics = useDiagnosticsExport()
  return <><button type="button" onClick={() => void diagnostics.run()}>Exportar</button>{diagnostics.dialog}</>
}

it('exports diagnostics only after showing what the bundle contains', async () => {
  const bridge = createTestBridge()
  setPlatformForTests(bridge)
  render(<I18nProvider lang="es"><Probe /></I18nProvider>)
  fireEvent.click(screen.getByRole('button', { name: /^Exportar$/ }))
  await waitFor(() => expect(screen.getByText('logs/app.log')).toBeTruthy())
  expect(screen.getByText('2.0 KB')).toBeTruthy()
  expect(bridge.diagnosticsState.exports).toBe(0)

  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  await waitFor(() => expect(screen.queryByText('logs/app.log')).toBeNull())
  expect(bridge.diagnosticsState.exports).toBe(0)

  fireEvent.click(screen.getByRole('button', { name: /^Exportar$/ }))
  fireEvent.click(await screen.findByRole('button', { name: 'Guardar…' }))
  await waitFor(() => expect(bridge.diagnosticsState.exports).toBe(1))
})
