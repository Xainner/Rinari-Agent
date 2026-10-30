// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { ProgressBar } from './progress-bar'

afterEach(cleanup)

it('says its value to screen readers and fills that share', () => {
  render(<ProgressBar value={0.28} label="Descargando" />)
  const bar = screen.getByRole('progressbar', { name: 'Descargando' })
  expect(bar.getAttribute('aria-valuenow')).toBe('28')
  expect((bar.firstElementChild as HTMLElement).style.width).toBe('28%')
})

it('without a value it is indeterminate', () => {
  render(<ProgressBar label="Empezando" />)
  const bar = screen.getByRole('progressbar', { name: 'Empezando' })
  expect(bar.hasAttribute('aria-valuenow')).toBe(false)
  expect(bar.hasAttribute('data-indeterminate')).toBe(true)
})

it('no native <progress> in the app: it would paint with the system style', () => {
  const sources = import.meta.glob('/src/**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
  const offenders = Object.entries(sources)
    .filter(([path, source]) => !path.endsWith('.test.tsx') && /<progress[\s>]/.test(source))
    .map(([path]) => path)
  expect(offenders).toEqual([])
})
