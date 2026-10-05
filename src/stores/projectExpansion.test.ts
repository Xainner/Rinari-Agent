// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { isProjectExpanded, readProjectExpansion, useProjectExpansionStore } from './projectExpansion'

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); useProjectExpansionStore.setState({ choices: {}, query: '' }) })

it('reads the existing format, retaining manual false and ignoring invalid entries', () => {
  localStorage.setItem('rinari.projectsExpanded', JSON.stringify({ p: false, q: true, invalid: 'true' }))
  expect(readProjectExpansion()).toEqual({ p: false, q: true })
  expect(isProjectExpanded(readProjectExpansion(), 'p', 'p')).toBe(false)
})

it.each(['broken', 'null', '[]', 'false'])('handles invalid persisted data: %s', (value) => {
  localStorage.setItem('rinari.projectsExpanded', value)
  expect(readProjectExpansion()).toEqual({})
})

it('reveals idempotently and still allows a later manual collapse without storage', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
  expect(readProjectExpansion()).toEqual({})
  useProjectExpansionStore.setState({ choices: { other: false }, query: 'hidden' })
  const { reveal, toggle } = useProjectExpansionStore.getState()
  reveal('p'); reveal('p')
  expect(useProjectExpansionStore.getState()).toMatchObject({ choices: { p: true, other: false }, query: '' })
  toggle('p', 'p')
  expect(useProjectExpansionStore.getState().choices.p).toBe(false)
})
