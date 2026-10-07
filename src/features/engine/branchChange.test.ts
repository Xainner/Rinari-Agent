import { expect, it } from 'vitest'
import { branchChangeText } from './useSessionList'

it('measures a branch change from the last work in the checkout, in the app language', () => {
  const es = branchChangeText({ from: 'feature/a', to: 'main', since: '2026-10-02T14:43:43Z', reference: 'last_work' }, 'es')
  expect(es).toMatch(/^Cambió la rama desde el último trabajo aquí \(.+\): feature\/a → main\.$/)
  expect(branchChangeText({ from: 'b', to: 'c', reference: 'first_seen' }, 'en')).toBe('The branch changed since Rinari first saw this checkout (—): b → c.')
})
