// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { I18nProvider } from '../../i18n'
import { setPlatformForTests } from '../../platform'
import { createTestBridge } from '../../platform/testBridge'
import AboutSettings from './AboutSettings'
import { diagnostics, issueUrl } from '../../services/support'

afterEach(cleanup)

const view = () => render(<I18nProvider lang="es"><AboutSettings version="0.2.2" /></I18nProvider>)

it('shows the version it is given and checks for updates through the bridge', async () => {
  const bridge = createTestBridge()
  let checks = 0
  const check = bridge.updates.check
  bridge.updates.check = async () => {
    checks += 1
    return check()
  }
  setPlatformForTests(bridge)
  view()
  expect(screen.getByText('v0.2.2')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /Buscar actualizaciones/ }))
  await waitFor(() => expect(checks).toBe(1))
})

it('reports a problem on GitHub with the template and the diagnostics', async () => {
  const bridge = createTestBridge()
  setPlatformForTests(bridge)
  view()
  fireEvent.click(screen.getByRole('button', { name: /^Informar$/ }))
  await waitFor(() => expect(bridge.openedUrls).toHaveLength(1))
  const url = new URL(bridge.openedUrls[0])
  expect(url.origin + url.pathname).toBe('https://github.com/Xainner/Rinari-Agent/issues/new')
  expect(url.searchParams.get('labels')).toBe('bug')
  const body = url.searchParams.get('body') ?? ''
  expect(body).toContain('**Qué pasó**')
  expect(body).toContain('Rinari Agent: 0.2.2')

  fireEvent.click(screen.getAllByRole('button', { name: /Abrir/ })[0])
  await waitFor(() => expect(bridge.openedUrls).toContain('https://github.com/Xainner/Rinari-Agent/releases/tag/v0.2.2'))
})

it('the diagnostics carry versions and system, never paths', () => {
  const text = diagnostics('0.2.2', null)
  expect(text).toMatch(/^Rinari Agent: 0\.2\.2$/m)
  expect(text).not.toMatch(/[A-Za-z]:\\|\/Users\//)
  expect(issueUrl('idea', 'x')).toContain('labels=enhancement')
})

it('exports diagnostics only after showing what the bundle contains', async () => {
  const bridge = createTestBridge()
  setPlatformForTests(bridge)
  view()
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
