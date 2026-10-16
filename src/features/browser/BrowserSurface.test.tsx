// @vitest-environment jsdom
// Superficie del navegador (documento 03 §6.1, §8.1, §10) y R10-01 de la
// revisión de los PR #10.
//
// Lo que se fija aquí: que la decisión entre nativo y capturas se tome con el
// **estado efectivo** y no con la capability, y que desmontar el panel retire
// sólo la presentación.
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { I18nProvider } from '../../i18n'
import { setPlatformForTests } from '../../platform'
import { createTestBridge, type TestBridge } from '../../platform/testBridge'
import type { NativeBrowserContext } from '../../platform/contract'

import BrowserSurface from './BrowserSurface'

let bridge: TestBridge
let restore: () => void

function nativeContext(overrides: Partial<NativeBrowserContext> = {}): NativeBrowserContext {
  return {
    session_id: 'ses-1',
    supported: true,
    host_registered: true,
    context_state: 'ready',
    available: true,
    backend: 'electron-native',
    control: 'agent',
    control_state: 'agent',
    control_revision: 1,
    active_target_id: 't1',
    targets: [{ target_id: 't1', url: 'https://example.com/a', title: 'A', active: true }],
    ...overrides,
  }
}

function paint(props: Partial<React.ComponentProps<typeof BrowserSurface>> = {}) {
  return render(
    <I18nProvider lang="es">
      <BrowserSurface
        sessionId="ses-1"
        frame={null}
        error=""
        targetId=""
        onTargetChange={() => {}}
        {...props}
      />
    </I18nProvider>,
  )
}

beforeEach(() => {
  bridge = createTestBridge()
  restore = setPlatformForTests(bridge)
})

afterEach(() => {
  // Sin limpieza explícita, cada render se acumula en el documento y las
  // consultas encuentran el panel de la prueba anterior.
  cleanup()
  restore()
  bridge.reset()
})

describe('qué presentación se elige', () => {
  it('sin soporte del host se usa el visor de capturas', async () => {
    // El puente de prueba dice `supported: false` por defecto, que es lo
    // honesto: este host no tiene browser nativo.
    paint({ frame: { state: 'connected', session_id: 'ses-1', url: 'https://example.com' } as never })
    await waitFor(() =>
      expect(screen.getByTestId('browser-view-slot').getAttribute('data-mode')).toBe('fallback'),
    )
    expect(screen.getByTestId('browser-surface').getAttribute('data-backend')).toBe('screenshot')
  })

  it('con contexto nativo listo se usa el slot nativo', async () => {
    bridge.browserContext = nativeContext()
    paint()
    await waitFor(() =>
      expect(screen.getByTestId('browser-view-slot').getAttribute('data-mode')).toBe('native'),
    )
  })

  it('mande quien mande, deja el hueco para la vista en vivo (#46)', async () => {
    for (const control of ['agent', 'user'] as const) {
      bridge.browserContext = nativeContext({ control, control_state: control })
      bridge.browserPreview = {
        target_id: 't1',
        url: 'https://example.com/a',
        image: 'data:image/png;base64,AAAA',
        width: 760,
        height: 560,
      }
      paint({ busy: true })
      await waitFor(() => expect(screen.getByTestId('browser-view-slot').getAttribute('data-state')).toBe('ready'))
      const slot = screen.getByTestId('browser-view-slot')
      // Ni la captura de antes ni «Preparando…»: la página se ve en vivo.
      expect(screen.queryByTestId('browser-agent-preview')).toBeNull()
      expect(slot.textContent).toBe('')
      cleanup()
    }
  })

  it('soporte sin contexto todavía no es «nativo listo»', async () => {
    // §5.2: soporte, binding y contexto son tres cosas. El slot se enseña,
    // pero diciendo que aún no hay página y ofreciendo crearla.
    bridge.browserContext = nativeContext({
      context_state: 'absent',
      available: false,
      targets: [],
      active_target_id: null,
    })
    paint()
    // Antes de que llegue el contexto se pinta el fallback, así que se
    // espera a la rama nativa en vez de mirar el primer slot que aparezca.
    await waitFor(() =>
      expect(screen.getByTestId('browser-view-slot').getAttribute('data-state')).toBe('absent'),
    )
    // Plan 0.4.0 #46: en su lugar, la página de inicio.
    expect(screen.getByTestId('browser-home')).toBeTruthy()
  })

  it('crear el contexto es una acción explícita del usuario', async () => {
    bridge.browserContext = nativeContext({ context_state: 'absent', available: false, targets: [] })
    paint()
    const address = await screen.findByTestId('browser-home-address')
    // Montar el panel no debe haber creado nada: consultar no tiene efectos.
    expect(bridge.browserCalls.some((call) => call.kind === 'prepare')).toBe(false)
    await userEvent.type(address, 'ejemplo.com{Enter}')
    await waitFor(() =>
      expect(bridge.browserCalls.some((call) => call.kind === 'prepare')).toBe(true),
    )
  })
})

describe('el slot reserva el hueco y lo reporta', () => {
  it('se pide un slot al montar y se suelta al desmontar', async () => {
    bridge.browserContext = nativeContext()
    const view = paint()
    await waitFor(() =>
      expect(bridge.browserCalls.some((call) => call.kind === 'attachSlot')).toBe(true),
    )
    view.unmount()
    await waitFor(() =>
      expect(bridge.browserCalls.some((call) => call.kind === 'detachSlot')).toBe(true),
    )
  })

  it('desmontar no cierra el contexto ni cancela nada', () => {
    // §8.3: ocultar o desmontar retira la presentación. Que no haya ninguna
    // otra intención en la lista es justo lo que se quiere comprobar.
    const kinds = bridge.browserCalls.map((call) => call.kind)
    expect(kinds).not.toContain('close')
    expect(kinds).not.toContain('dispose')
  })

  it('la geometría que se publica lleva los dos rectángulos', async () => {
    bridge.browserContext = nativeContext()
    paint()
    await waitFor(() => expect(bridge.browserLayouts.length).toBeGreaterThan(0))
    const layout = bridge.browserLayouts[bridge.browserLayouts.length - 1]!
    // Sin los dos no se puede representar un recorte por la izquierda.
    expect(layout.logicalBounds).toBeDefined()
    expect(layout.visibleBounds).toBeDefined()
    expect(layout.layoutRevision).toBeGreaterThan(0)
    expect(layout.overlayDepth).toBe(0)
  })

  it('cincuenta avisos con geometría idéntica producen un solo IPC', async () => {
    bridge.browserContext = nativeContext()
    paint()
    await waitFor(() => expect(bridge.browserLayouts.length).toBeGreaterThan(0))
    await new Promise((resolve) => setTimeout(resolve, 40))
    const baseline = bridge.browserLayouts.length
    for (let index = 0; index < 50; index += 1) {
      window.dispatchEvent(new Event('scroll'))
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    expect(bridge.browserLayouts.length).toBe(baseline)
  })

  it('un overlay encima viaja en la geometría', async () => {
    bridge.browserContext = nativeContext()
    paint({ overlayDepth: 2 })
    await waitFor(() => expect(bridge.browserLayouts.length).toBeGreaterThan(0))
    expect(bridge.browserLayouts.at(-1)!.overlayDepth).toBe(2)
  })

  it('ocultar la superficie se reporta sin retirar el slot', async () => {
    bridge.browserContext = nativeContext()
    paint({ shown: false })
    await waitFor(() => expect(bridge.browserLayouts.length).toBeGreaterThan(0))
    expect(bridge.browserLayouts.at(-1)!.shown).toBe(false)
    expect(bridge.browserCalls.some((call) => call.kind === 'detachSlot')).toBe(false)
  })
})

// Plan 0.4.0 #46: sin «Tomar control» ni «Devolver al agente». Usar la barra
// es tomar el navegador (main lo pide al Engine y espera); cuando Rinari
// necesita la página y tú la usas, espera, y la barra lo dice.
describe('el control sin botones (#46)', () => {
  it('no hay botones de control', async () => {
    bridge.browserContext = nativeContext()
    paint({ busy: true })
    await screen.findByTestId('browser-view-slot')
    expect(screen.queryByRole('button', { name: /tomar control|take control/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /devolver al agente|return to the agent/i })).toBeNull()
    expect(await screen.findByText('Rinari está usando esta página')).toBeTruthy()
  })

  it('la dirección y las pestañas se pueden usar aunque Rinari esté al mando', async () => {
    bridge.browserContext = nativeContext({
      targets: [
        { target_id: 't1', url: 'https://example.com/a', title: 'A', active: true },
        { target_id: 't2', url: 'https://example.com/b', title: 'B', active: false },
      ],
    })
    paint({ busy: true })
    const url = await screen.findByLabelText('Dirección')
    expect((url as HTMLInputElement).disabled).toBe(false)
    expect((screen.getByLabelText('Pestaña del navegador') as HTMLSelectElement).disabled).toBe(false)
    await userEvent.clear(url)
    await userEvent.type(url, 'https://example.org{Enter}')
    await waitFor(() =>
      expect(bridge.browserCalls.find((call) => call.kind === 'navigate')).toMatchObject({
        url: 'https://example.org',
      }),
    )
  })

  it('Rinari espera a que termines, y se dice', async () => {
    bridge.browserContext = nativeContext({ control: 'user', control_state: 'user' })
    paint({ busy: true })
    await screen.findByTestId('browser-view-slot')
    bridge.emitBrowserContext(nativeContext({ control: 'user', control_state: 'user', agent_waiting: true }))
    expect(await screen.findByText('Rinari espera a que termines')).toBeTruthy()
  })

  it('si no se pudo garantizar exclusión, se dice', async () => {
    bridge.browserContext = nativeContext({ control_state: 'uncertain' })
    paint()
    expect(await screen.findByText(/no se pudo tomar el control|control could not be taken/i)).toBeTruthy()
  })

  it('un cambio de otra sesión no toca este panel', async () => {
    bridge.browserContext = nativeContext()
    paint({ busy: true })
    await screen.findByText('Rinari está usando esta página')
    bridge.emitBrowserContext(
      nativeContext({ session_id: 'otra', control: 'user', control_state: 'user', agent_waiting: true }),
    )
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(screen.queryByText('Rinari espera a que termines')).toBeNull()
  })
})

describe('página de inicio (#46)', () => {
  it('sin navegador todavía, la página de inicio abre lo que escribes', async () => {
    bridge.browserContext = nativeContext({ context_state: 'absent', available: false, targets: [], active_target_id: null })
    paint()
    const address = await screen.findByTestId('browser-home-address')
    await userEvent.type(address, 'ejemplo.com{Enter}')
    await waitFor(() => {
      const kinds = bridge.browserCalls.map((call) => call.kind)
      expect(kinds).toContain('prepare')
      expect(bridge.browserCalls.find((call) => call.kind === 'navigate')).toMatchObject({ url: 'https://ejemplo.com' })
    })
  })

  it('una pestaña en blanco enseña la página de inicio y no presenta la vista', async () => {
    bridge.browserContext = nativeContext({ targets: [{ target_id: 't1', url: 'about:blank', title: '', active: true }] })
    paint()
    expect(await screen.findByTestId('browser-home')).toBeTruthy()
    await waitFor(() => expect(bridge.browserLayouts.at(-1)?.shown).toBe(false))
  })

  it('con una página abierta no hay página de inicio', async () => {
    bridge.browserContext = nativeContext()
    paint()
    await waitFor(() => expect(screen.getByTestId('browser-view-slot').getAttribute('data-state')).toBe('ready'))
    expect(screen.queryByTestId('browser-home')).toBeNull()
  })
})

describe('tamaño de la página (#44b)', () => {
  it('un ancho fijo hace el hueco de ese ancho dentro de un contenedor que se desplaza', async () => {
    bridge.browserContext = nativeContext()
    paint()
    const size = await screen.findByTestId('browser-size')
    await userEvent.selectOptions(size, '1280')
    const slot = screen.getByTestId('browser-view-slot')
    expect(slot.getAttribute('data-page-width')).toBe('1280')
    expect(slot.style.width).toBe('1280px')
    expect(screen.getByTestId('browser-view-scroll')).toBeTruthy()
    await userEvent.selectOptions(size, 'fit')
    expect(screen.queryByTestId('browser-view-scroll')).toBeNull()
  })

  it('el selector enseña el ancho que pidió el agente', async () => {
    bridge.browserContext = nativeContext({ viewport_width: 390 })
    paint()
    await waitFor(() => expect((screen.getByTestId('browser-size') as HTMLSelectElement).value).toBe('390'))
  })
})
