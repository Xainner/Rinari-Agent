import { create } from 'zustand'

export interface NativeRect {
  x: number
  y: number
  width: number
  height: number
}

type ToastPlacement =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'

interface NativeSurfaceState {
  surfaces: Record<string, NativeRect>
  toastPlacement: ToastPlacement
  toastOcclusions: NativeRect[]
  setSurface(id: string, rect: NativeRect | null): void
  setToastLayout(placement: ToastPlacement, occlusions: NativeRect[]): void
}

const sameRect = (a: NativeRect | undefined, b: NativeRect) =>
  Boolean(a && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height)

export const useNativeSurfaces = create<NativeSurfaceState>((set) => ({
  surfaces: {},
  toastPlacement: 'bottom-right',
  toastOcclusions: [],
  setSurface: (id, rect) =>
    set((state) => {
      if (rect && sameRect(state.surfaces[id], rect)) return state
      if (!rect && !(id in state.surfaces)) return state
      const surfaces = { ...state.surfaces }
      if (rect) surfaces[id] = rect
      else delete surfaces[id]
      return { surfaces }
    }),
  setToastLayout: (placement, occlusions) =>
    set((state) => {
      const current = JSON.stringify(state.toastOcclusions)
      const next = JSON.stringify(occlusions)
      return state.toastPlacement === placement && current === next
        ? state
        : { toastPlacement: placement, toastOcclusions: occlusions }
    }),
}))
