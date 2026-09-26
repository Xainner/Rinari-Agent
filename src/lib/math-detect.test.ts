import { expect, it } from 'vitest'
import { containsMath, escapeCurrency } from './math-detect'

const BS = String.fromCharCode(92)

it('money is not math: two amounts on a line stay text', () => {
  const text = 'El plan cuesta $15 al mes y el anual $150 (US$ 12).'
  const escaped = escapeCurrency(text)
  expect(containsMath(escaped)).toBe(false)
  expect(escaped).toBe(`El plan cuesta ${BS}$15 al mes y el anual ${BS}$150 (US${BS}$ 12).`)
})

it('real formulas and code are left alone', () => {
  expect(containsMath(escapeCurrency(`La energía es $E = mc^2$ y $${BS}alpha$.`))).toBe(true)
  const code = 'usa `echo $1` y\n```sh\nexport A=$2\n```'
  expect(escapeCurrency(code)).toBe(code)
  const escaped = `ya escapado ${BS}$20`
  expect(escapeCurrency(escaped)).toBe(escaped)
})
