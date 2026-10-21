// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, expect, it } from 'vitest'
import { I18nProvider } from '../../i18n'
import { SearchField } from './SearchField'

afterEach(cleanup)

function Field({ onEscape }: { onEscape?: () => void }) {
  const [query, setQuery] = useState('')
  return (
    <div onKeyDown={(event) => { if (event.key === 'Escape') onEscape?.() }}>
      <SearchField label="Buscar" value={query} onChange={(event) => setQuery(event.target.value)} onClear={() => setQuery('')} />
    </div>
  )
}

it('shows the «X» only with text, and it empties the field and keeps the focus there', async () => {
  render(<I18nProvider lang="es"><Field /></I18nProvider>)
  const input = screen.getByRole('searchbox', { name: 'Buscar' }) as HTMLInputElement
  expect(screen.queryByRole('button', { name: 'Limpiar búsqueda' })).toBeNull()
  await userEvent.type(input, 'notas')
  await userEvent.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }))
  expect(input.value).toBe('')
  expect(document.activeElement).toBe(input)
  expect(screen.queryByRole('button', { name: 'Limpiar búsqueda' })).toBeNull()
})

it('Esc empties it first, and only an empty field lets Esc go on', async () => {
  let escapes = 0
  render(<I18nProvider lang="es"><Field onEscape={() => { escapes += 1 }} /></I18nProvider>)
  const input = screen.getByRole('searchbox', { name: 'Buscar' }) as HTMLInputElement
  await userEvent.type(input, 'notas')
  fireEvent.keyDown(input, { key: 'Escape' })
  expect(input.value).toBe('')
  expect(escapes).toBe(0)
  fireEvent.keyDown(input, { key: 'Escape' })
  expect(escapes).toBe(1)
})
