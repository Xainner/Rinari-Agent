// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { afterEach, expect, it } from 'vitest'
import { version } from '../../../package.json'
import { I18nProvider } from '../../i18n'
import { setPlatformForTests } from '../../platform'
import { createTestBridge } from '../../platform/testBridge'
import ReviewExportDialog, { useReviewExport } from './ReviewExportDialog'

afterEach(cleanup)

it('el paquete dice qué versión de la app lo exportó', async () => {
  // SOIN, 23-oct: un paquete de otra máquina no decía qué Nightly tenía.
  const bridge = createTestBridge()
  bridge.mockCommand('session_review_export', () => ({
    files: { 'entorno.json': JSON.stringify({ first_event_at: '2026-10-23T19:46:02Z', last_event_at: '2026-10-23T19:47:37Z' }) },
  }))
  setPlatformForTests(bridge)
  render(<I18nProvider lang="es"><ReviewExportDialog /></I18nProvider>)
  act(() => useReviewExport.getState().open('ses_1'))
  await userEvent.click(await screen.findByTestId('review-export-save'))
  await waitFor(() => expect(bridge.reviewExports).toHaveLength(1))
  const env = JSON.parse(bridge.reviewExports[0].files['entorno.json'])
  expect(env).toMatchObject({ app_version: version, first_event_at: '2026-10-23T19:46:02Z' })
  expect(bridge.reviewExports[0].from).toBe('2026-10-23T19:46:02Z')
})
