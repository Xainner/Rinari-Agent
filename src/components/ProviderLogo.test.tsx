// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import ProviderLogo from './ProviderLogo'

afterEach(cleanup)

it('emite las dos variantes por tema en marcas monocromas', () => {
  const { container } = render(
    <ProviderLogo alias="opencode-go" endpoint="https://opencode.ai/zen/go/v1" />,
  )
  const images = [...container.querySelectorAll('img')]
  expect(images.map((img) => img.getAttribute('src'))).toEqual([
    '/logos/opencode.png',
    '/logos/opencode-light.png',
  ])
  expect(images[0].className).toContain('provider-logo-dark')
  expect(images[1].className).toContain('provider-logo-light')
})

it('emite una sola variante en marcas de color y ninguna sin marca', () => {
  const color = render(<ProviderLogo endpoint="https://api.anthropic.com/v1" />)
  const images = [...color.container.querySelectorAll('img')]
  expect(images).toHaveLength(1)
  expect(images[0].getAttribute('src')).toBe('/logos/claude.png')
  expect(images[0].className).not.toContain('provider-logo-')

  const unknown = render(<ProviderLogo alias="xAInner" endpoint="https://api.xainner.com/v1" />)
  expect(unknown.container.querySelector('img')).toBeNull()
})
