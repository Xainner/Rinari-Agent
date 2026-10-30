// @vitest-environment jsdom
// #14: si fue Rinari quien marcó el modelo sin visión, el aviso lo dice y ofrece reactivarla.
import { installMockPlatform } from '../../test/mockPlatform'
installMockPlatform()
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { engineApi } from '../../services/engine'
import { VisionWithheldNotice } from './VisionWithheldNotice'

afterEach(() => { cleanup(); vi.restoreAllMocks() })
const ui = (markedBy?: string) => render(<I18nProvider lang="es"><VisionWithheldNotice modelId="mdl_1" markedBy={markedBy} /></I18nProvider>)

it('a mark Rinari made says so and turns vision back on', async () => {
  const reset = vi.spyOn(engineApi, 'visionModelReset').mockResolvedValue({} as never)
  ui('auto')
  expect(document.body.textContent).toContain('Rinari marcó este modelo como sin visión')
  fireEvent.click(screen.getByTestId('vision-reenable'))
  await waitFor(() => expect(reset).toHaveBeenCalledWith('mdl_1'))
  await waitFor(() => expect(screen.queryByTestId('vision-reenable')).toBeNull())
})

it('a refusal of this turn only leaves nothing marked, so there is nothing to turn back on', () => {
  ui('turn')
  expect(document.body.textContent).toContain('No queda marcado')
  expect(screen.queryByTestId('vision-reenable')).toBeNull()
})
