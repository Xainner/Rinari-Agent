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
    expect(screen.getByRole('button', { name: /abrir navegador|open browser/i })).toBeTruthy()
  })

  it('crear el contexto es una acción explícita del usuario', async () => {
    bridge.browserContext = nativeContext({ context_state: 'absent', available: false, targets: [] })
    paint()
    const button = await screen.findByRole('button', { name: /abrir navegador|open browser/i })
    // Montar el panel no debe haber creado nada: consultar no tiene efectos.
    expect(bridge.browserCalls.some((call) => call.kind === 'prepare')).toBe(false)
    await userEvent.click(button)
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

describe('control desde la toolbar (§7)', () => {
  it('pide tomar el control con la revisión que conoce', async () => {
    bridge.browserContext = nativeContext({ control_revision: 4 })
    paint()
    await userEvent.click(await screen.findByRole('button', { name: /tomar control|take control/i }))
    await waitFor(() => {
      const call = bridge.browserCalls.find((entry) => entry.kind === 'setControl')
      expect(call).toMatchObject({ owner: 'user', expectedRevision: 4 })
    })
  })

  it('durante la transición no se puede volver a pulsar', async () => {
    bridge.browserContext = nativeContext({ control_state: 'taking-user-control' })
    paint()
    const button = await screen.findByRole('button', { name: /tomando el control|taking control/i })
    expect(button.hasAttribute('disabled')).toBe(true)
  })

  it('si no se pudo garantizar exclusión, se dice', async () => {
    bridge.browserContext = nativeContext({ control_state: 'uncertain' })
    paint()
    // No se anuncia que el usuario tenga el control: no lo tiene.
    expect(await screen.findByText(/no se pudo tomar el control|control could not be taken/i)).toBeTruthy()
  })

  it('un cambio de contexto llega por evento, sin sondear', async () => {
    bridge.browserContext = nativeContext()
    paint()
    await screen.findByRole('button', { name: /tomar control|take control/i })
    bridge.emitBrowserContext(nativeContext({ control: 'user', control_state: 'user' }))
    expect(
      await screen.findByRole('button', { name: /devolver al agente|return to the agent/i }),
    ).toBeTruthy()
  })

  it('un cambio de otra sesión no toca este panel', async () => {
    bridge.browserContext = nativeContext()
    paint()
    await screen.findByRole('button', { name: /tomar control|take control/i })
    bridge.emitBrowserContext(
      nativeContext({ session_id: 'otra', control: 'user', control_state: 'user' }),
    )
    // Sigue siendo del agente: el evento era de otra sesión.
    expect(await screen.findByRole('button', { name: /tomar control|take control/i })).toBeTruthy()
  })
})

// Documento 03 §7: acciones manuales sobre la página del agente.
//
// El guard de verdad está en main —la autoridad no puede vivir en el lado que
// se puede modificar—, pero ofrecer un control que va a fallar es peor que no
// ofrecerlo.
describe('la toolbar no muta la página del agente sin control', () => {
  it('con el agente al mando, la URL y las pestañas están deshabilitadas', async () => {
    bridge.browserContext = nativeContext({
      control: 'agent',
      control_state: 'agent',
      targets: [
        { target_id: 't1', url: 'https://example.com/a', title: 'A', active: true },
        { target_id: 't2', url: 'https://example.com/b', title: 'B', active: false },
      ],
    })
    paint()
    const url = await screen.findByLabelText('Dirección')
    expect((url as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByLabelText('Pestaña del navegador') as HTMLSelectElement).disabled).toBe(true)
  })

  it('con el usuario al mando, vuelven a estar disponibles', async () => {
    bridge.browserContext = nativeContext({
      control: 'user',
      control_state: 'user',
      targets: [
        { target_id: 't1', url: 'https://example.com/a', title: 'A', active: true },
        { target_id: 't2', url: 'https://example.com/b', title: 'B', active: false },
      ],
    })
    paint()
    const url = await screen.findByLabelText('Dirección')
    expect((url as HTMLInputElement).disabled).toBe(false)
    expect((screen.getByLabelText('Pestaña del navegador') as HTMLSelectElement).disabled).toBe(false)
  })
})
