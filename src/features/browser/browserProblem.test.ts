import { expect, it } from 'vitest'
import { translate } from '../../i18n'
import { browserProblemText } from './BrowserSurface'

const t = ((key: string, vars?: Record<string, string | number>) => translate('es', key as never, vars)) as never

it('says the host problems in the owner language, and leaves the rest as they come (#99.2)', () => {
  expect(browserProblemText('this session has no browser context', t)).toBe('El navegador de esta conversación no estaba listo. Vuelve a intentarlo.')
  expect(browserProblemText('navigating has to wait: Rinari is finishing a step on this page', t)).toBe('Rinari está terminando un paso en esta página. Espera un momento.')
  expect(browserProblemText('the desktop browser will not navigate to file:///c:/x', t)).toBe('El navegador de Rinari no abre esa dirección.')
  expect(browserProblemText('net::ERR_NAME_NOT_RESOLVED', t)).toBe('net::ERR_NAME_NOT_RESOLVED')
})
