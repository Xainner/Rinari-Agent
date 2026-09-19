// @vitest-environment jsdom
// Overlays bloqueantes (documento 03 §8.3).
//
// Lo que se fija aquí: que la cuenta sea de la ventana y vuelva a cero sola.
// Una cuenta que se queda alta esconde el navegador para siempre, y ese fallo
// no se ve al abrir el modal —se ve después, cuando ya nadie lo relaciona—.
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'

import { AlertDialog, AlertDialogContent } from '../components/ui/alert-dialog'
import { Dialog, DialogContent } from '../components/ui/dialog'
import {
  resetOverlaysForTests,
  selectOverlayDepth,
  useBlockingOverlay,
  useOverlayStore,
} from './overlay'

const depth = () => selectOverlayDepth(useOverlayStore.getState())

function Overlay({ active = true }: { active?: boolean }) {
  useBlockingOverlay(active)
  return null
}

beforeEach(resetOverlaysForTests)
afterEach(cleanup)

it('sin overlays la profundidad es cero', () => {
  expect(depth()).toBe(0)
})

it('cada overlay montado suma uno y al desmontarse lo devuelve', () => {
  const first = render(<Overlay />)
  expect(depth()).toBe(1)
  const second = render(<Overlay />)
  expect(depth()).toBe(2)
  second.unmount()
  expect(depth()).toBe(1)
  first.unmount()
  expect(depth()).toBe(0)
})

// Por id y no por contador: con un `++` un montaje doble —StrictMode, un
// remontaje— dejaría la cuenta en 1 para siempre y el navegador escondido.
it('el mismo overlay montado dos veces no cuenta dos veces', () => {
  const { rerender, unmount } = render(<Overlay />)
  rerender(<Overlay />)
  expect(depth()).toBe(1)
  unmount()
  expect(depth()).toBe(0)
})

it('un overlay inactivo no cuenta, y cuenta al activarse', () => {
  const { rerender } = render(<Overlay active={false} />)
  expect(depth()).toBe(0)
  rerender(<Overlay active />)
  expect(depth()).toBe(1)
  rerender(<Overlay active={false} />)
  expect(depth()).toBe(0)
})

it('soltar un overlay que no está no descuadra la cuenta', () => {
  render(<Overlay />)
  useOverlayStore.getState().drop('no-existe')
  expect(depth()).toBe(1)
})

// La primitiva es el punto donde se cablea, para que ningún diálogo nuevo
// tenga que acordarse. Si esto se cae, se cae para todos a la vez.
it('un diálogo abierto retira las vistas nativas y al cerrarse las devuelve', async () => {
  const { rerender } = render(
    <Dialog open>
      <DialogContent aria-describedby={undefined}>
        <span>contenido</span>
      </DialogContent>
    </Dialog>,
  )
  expect(depth()).toBe(1)
  rerender(
    <Dialog open={false}>
      <DialogContent aria-describedby={undefined}>
        <span>contenido</span>
      </DialogContent>
    </Dialog>,
  )
  // Se espera al desmontaje y no al `open={false}`: Radix conserva el
  // contenido mientras se va, y mientras se ve sigue tapando. Devolver el
  // navegador antes de tiempo lo haría aparecer bajo un modal a medio cerrar.
  await waitFor(() => expect(depth()).toBe(0))
})

it('un alert dialog abierto también las retira', () => {
  const { unmount } = render(
    <AlertDialog open>
      <AlertDialogContent>
        <span>seguro?</span>
      </AlertDialogContent>
    </AlertDialog>,
  )
  expect(depth()).toBe(1)
  unmount()
  expect(depth()).toBe(0)
})

// El fallo que este fichero encontró antes de llegar a nadie: la cuenta
// colgaba del montaje de `DialogContent`, y los consumidores lo renderizan
// **siempre** —`<Dialog open={x}><DialogContent/>`—, así que el navegador se
// habría quedado escondido con el diálogo cerrado y sin que nadie lo
// relacionara con el modal.
it('un diálogo cerrado pero renderizado no retira nada', () => {
  render(
    <Dialog open={false}>
      <DialogContent aria-describedby={undefined}>
        <span>contenido</span>
      </DialogContent>
    </Dialog>,
  )
  expect(depth()).toBe(0)
})
