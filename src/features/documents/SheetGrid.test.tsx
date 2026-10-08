// @vitest-environment jsdom
import { installMockPlatform } from '../../test/mockPlatform'
const platform = installMockPlatform()
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { I18nProvider } from '../../i18n'
import { SheetGrid } from './SheetGrid'

const sheets: Record<string, unknown> = {
  Resumen: {
    sheet: 'Resumen', sheets: ['Resumen', 'Ventas'], dimension: 'A1:B3', next_cursor: null,
    rows: [
      { row: 1, cells: [{ cell: 'A1', value: 'Ventas' }, { cell: 'B1', value: 1200.5 }] },
      { row: 2, cells: [{ cell: 'A2', value: 'Plan' }, { cell: 'B2', value: '=B1*1.1', formula: true, cached: null }] },
      { row: 3, cells: [{ cell: 'A3', value: 'Texto' }, { cell: 'B3', value: '=no fórmula' }] },
    ],
  },
  Ventas: {
    sheet: 'Ventas', sheets: ['Resumen', 'Ventas'], dimension: 'A1:A1', next_cursor: null,
    rows: [{ row: 1, cells: [{ cell: 'A1', value: 'Región' }] }],
  },
}

beforeEach(() => {
  platform.invoke.mockImplementation(async (name: string, args: { selection?: string }) => {
    if (name === 'engine_status') return { state: 'ready', capabilities: {} }
    if (name === 'documents_range_get') return args.selection?.startsWith("'Ventas'") ? sheets.Ventas : sheets.Resumen
    return {}
  })
})
afterEach(cleanup)

const view = () => render(<I18nProvider lang="es"><SheetGrid sessionId="s" revisionId="rev_1" /></I18nProvider>)

it('shows values, keeps uncalculated formulas pending and text as text', async () => {
  view()
  const grid = await screen.findByTestId('sheet-grid')
  await waitFor(() => expect(grid.querySelector('[data-cell="B1"]')?.textContent).toMatch(/1.?200[.,]5/))
  expect(grid.querySelector('[data-cell="B2"]')?.textContent).toBe('…')
  expect(grid.querySelector('[data-cell="B3"]')?.textContent).toBe('=no fórmula')
  expect(screen.getByText(/fórmulas sin resultado calculado/)).toBeTruthy()
  await userEvent.click(screen.getByRole('button', { name: 'Fórmulas' }))
  expect(grid.querySelector('[data-cell="B2"]')?.textContent).toBe('=B1*1.1')
  await userEvent.click(grid.querySelector('[data-cell="B2"]')!)
  expect(screen.getByText(/Pendiente de cálculo/)).toBeTruthy()
})

it('switches sheets', async () => {
  view()
  await userEvent.click(await screen.findByRole('tab', { name: 'Ventas' }))
  await waitFor(() => expect(screen.getByTestId('sheet-grid').querySelector('[data-cell="A1"]')?.textContent).toBe('Región'))
  expect(platform.invoke.mock.calls.some(([name, args]) => name === 'documents_range_get' && String((args as { selection?: string }).selection).startsWith("'Ventas'!A1:"))).toBe(true)
})
