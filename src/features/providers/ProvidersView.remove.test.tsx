// @vitest-environment jsdom
// Quitar el único proveedor (plan 0.4.0 #19): el diálogo dice que Rinari queda
// sin proveedor y el Engine lo borra sin pedir a cuál cambiar.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { createTestBridge } from '../../platform/testBridge'
import { setPlatformForTests } from '../../platform'
import { I18nProvider } from '../../i18n'
import ProvidersView from './ProvidersView'

let restore: (() => void) | undefined
afterEach(() => {
  cleanup()
  restore?.()
})

const provider = (alias: string, active: boolean) => ({
  id: `prv_${alias}`,
  alias,
  provider_type: 'openai',
  endpoint: 'https://api.openai.com/v1',
  auth_method: 'api-key',
  active,
  model_count: 1,
  credential: { stored: true },
}) as never

function mount(providers: never[]) {
  const bridge = createTestBridge()
  restore = setPlatformForTests(bridge)
  bridge.mockCommand('provider_catalog_get', () => ({ version: '1', presets: [] }))
  const removed: unknown[] = []
  bridge.mockCommand('provider_remove', (args: unknown) => {
    removed.push(args)
    return { removed: { id: 'x', alias: 'solo' } }
  })
  render(
    <I18nProvider lang="es">
      <ProvidersView providers={providers} onChanged={() => {}} />
    </I18nProvider>,
  )
  return removed
}

it('the only provider can be removed, and the dialog says what follows', async () => {
  const removed = mount([provider('solo', true)])
  // Las acciones viven en la tarjeta abierta (#97 B).
  fireEvent.click(screen.getByRole('button', { expanded: false }))
  fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
  const dialog = await screen.findByRole('alertdialog')
  expect(dialog.textContent).toContain('Es el único')
  expect(within(dialog).queryByLabelText('Mover sesiones activas a')).toBeNull()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Eliminar' }))
  await waitFor(() => expect(removed).toHaveLength(1))
  expect(removed[0]).toMatchObject({ reference: 'solo', switch_to: null })
})

it('with others, it still asks which one takes over', async () => {
  mount([provider('main', true), provider('backup', false)])
  fireEvent.click(screen.getAllByRole('button', { expanded: false })[0])
  fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
  const dialog = await screen.findByRole('alertdialog')
  expect(dialog.textContent).not.toContain('Es el único')
  expect(within(dialog).getByLabelText('Mover sesiones activas a')).toBeTruthy()
})
