// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

vi.mock('../lib/highlight', () => ({
  highlightToHtml: vi.fn(async (code: string) => `<pre class="shiki"><code>${code}</code></pre>`),
}))

import { I18nProvider } from '../i18n'
import { CodeBlock } from './Markdown'

afterEach(cleanup)

it('#58: while a code block streams it keeps its last highlight instead of going back to plain <pre>', async () => {
  const view = render(<I18nProvider lang="es"><CodeBlock code="const a = 1" language="ts" /></I18nProvider>)
  await waitFor(() => expect(view.container.querySelector('.shiki-wrap')).not.toBeNull())
  for (const more of ['\nconst b', '\nconst b = 2', '\nconst b = 2\nconst c']) {
    view.rerender(<I18nProvider lang="es"><CodeBlock code={`const a = 1${more}`} language="ts" /></I18nProvider>)
    expect(view.container.querySelector('.shiki-wrap')).not.toBeNull()
  }
  await waitFor(() => expect(view.container.querySelector('.shiki-wrap')?.textContent).toContain('const c'))
})
