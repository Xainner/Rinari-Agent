// @vitest-environment jsdom
// La lista de archivos cambiados de la tarjeta del turno se pliega con muchos archivos (#99.4).
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { I18nProvider } from '../../i18n'
import { ChangeSetRow } from './ChangeSetRow'

afterEach(cleanup)

const file = (n: number) => ({ path: `src/archivo${n}.ts`, absolute_path: `/w/src/archivo${n}.ts`, kind: 'modified' as const, additions: n, deletions: 0 })
const item = (count: number) => ({
  type: 'changeset' as const,
  id: 'c1',
  seq: 1,
  changesetId: 'c1',
  turnId: 't1',
  status: 'active' as const,
  additions: 10,
  deletions: 0,
  undoable: true,
  attributionComplete: true,
  warnings: [],
  files: Array.from({ length: count }, (_, index) => file(index + 1)),
}) as never

it('shows the first files and «Ver los N restantes», which unfolds and folds back', () => {
  render(<I18nProvider lang="es"><ChangeSetRow item={item(12)} turnActive={false} /></I18nProvider>)
  expect(document.querySelectorAll('.turn-changes-file')).toHaveLength(5)
  fireEvent.click(screen.getByRole('button', { name: /Ver los 7 restantes/ }))
  expect(document.querySelectorAll('.turn-changes-file')).toHaveLength(12)
  fireEvent.click(screen.getByRole('button', { name: /Ver menos/ }))
  expect(document.querySelectorAll('.turn-changes-file')).toHaveLength(5)
})

it('a short list shows every file, with nothing to unfold', () => {
  render(<I18nProvider lang="es"><ChangeSetRow item={item(6)} turnActive={false} /></I18nProvider>)
  expect(document.querySelectorAll('.turn-changes-file')).toHaveLength(6)
  expect(screen.queryByRole('button', { name: /restantes/ })).toBeNull()
})
