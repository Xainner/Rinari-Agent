// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, expect, it } from 'vitest'
import { I18nProvider } from '../../i18n'
import { setPlatformForTests } from '../../platform'
import { createTestBridge } from '../../platform/testBridge'
import { useFolderPicker } from './useFolderPicker'

afterEach(cleanup)

function Picker() {
  const { pickFolders, dialog } = useFolderPicker()
  const [picked, setPicked] = useState<string>('—')
  return (
    <>
      <button type="button" onClick={() => void pickFolders().then((paths) => setPicked(paths ? paths.join('|') : 'cancelled'))}>
        pick
      </button>
      <output>{picked}</output>
      {dialog}
    </>
  )
}

const view = () => render(<I18nProvider lang="es"><Picker /></I18nProvider>)

it('uses the native dialog with Rinari on this computer', async () => {
  const bridge = createTestBridge()
  bridge.nextFileSelection = ['C:\\proyectos\\web']
  setPlatformForTests(bridge)
  view()
  fireEvent.click(screen.getByRole('button', { name: 'pick' }))
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('C:\\proyectos\\web'))
  expect(screen.queryByRole('alertdialog')).toBeNull()
})

it('asks for a server path with Rinari on a server', async () => {
  const bridge = createTestBridge()
  bridge.nextFileSelection = ['C:\\no\\debe\\usarse']
  bridge.engineStatus = { ...bridge.engineStatus, remote: { id: 'srv', name: 'Saturno', server: 'https://rinari.example.test' } }
  setPlatformForTests(bridge)
  view()
  fireEvent.click(screen.getByRole('button', { name: 'pick' }))
  const input = await screen.findByLabelText('Ruta en el servidor')
  const confirm = screen.getByRole('button', { name: 'Usar esta carpeta' }) as HTMLButtonElement
  expect(confirm.disabled).toBe(true)
  fireEvent.change(input, { target: { value: '  /home/rinari/proyectos/web  ' } })
  fireEvent.click(confirm)
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('/home/rinari/proyectos/web'))

  fireEvent.click(screen.getByRole('button', { name: 'pick' }))
  await screen.findByLabelText('Ruta en el servidor')
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('cancelled'))
})
