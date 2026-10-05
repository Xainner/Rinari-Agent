import { useCallback, useEffect, useLayoutEffect, useRef, useState, type DragEvent } from 'react'

export function hasFiles(data: DataTransfer) {
  return Array.from(data.types).includes('Files') || Array.from(data.items ?? []).some(item => item.kind === 'file')
}

/** The cue belongs to this drop target, independently of keyboard/pane focus. */
export function useFileDrag(draftKey: string, enabled = true) {
  const ref = useRef<HTMLDivElement>(null)
  const target = useRef<EventTarget | null>(null)
  const [active, setActive] = useState(false)
  const reset = useCallback(() => {
    target.current = null
    setActive(false)
  }, [])

  useLayoutEffect(reset, [draftKey, enabled, reset])
  useEffect(() => {
    if (!enabled) return
    const outside = (event: globalThis.DragEvent) => {
      if (!(event.target instanceof Node) || !ref.current?.contains(event.target)) reset()
    }
    const leaveWindow = (event: globalThis.DragEvent) => {
      if (event.target === document || event.target === document.documentElement) reset()
    }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') reset() }
    const hidden = () => { if (document.hidden) reset() }
    window.addEventListener('dragover', outside)
    window.addEventListener('dragleave', leaveWindow)
    window.addEventListener('drop', reset)
    window.addEventListener('dragend', reset)
    window.addEventListener('blur', reset)
    window.addEventListener('keydown', escape)
    document.addEventListener('visibilitychange', hidden)
    return () => {
      window.removeEventListener('dragover', outside)
      window.removeEventListener('dragleave', leaveWindow)
      window.removeEventListener('drop', reset)
      window.removeEventListener('dragend', reset)
      window.removeEventListener('blur', reset)
      window.removeEventListener('keydown', escape)
      document.removeEventListener('visibilitychange', hidden)
    }
  }, [enabled, reset])

  return {
    ref, active, reset,
    onDragEnter(event: DragEvent<HTMLDivElement>) {
      if (!hasFiles(event.dataTransfer)) return
      target.current = event.target
      setActive(true)
    },
    onDragOver(event: DragEvent<HTMLDivElement>) {
      event.preventDefault()
      if (!hasFiles(event.dataTransfer)) return
      event.dataTransfer.dropEffect = 'copy'
      target.current = event.target
      setActive(true)
    },
    onDragLeave(event: DragEvent<HTMLDivElement>) {
      if (event.relatedTarget instanceof Node) {
        if (!ref.current?.contains(event.relatedTarget)) reset()
      } else if (event.target === target.current) {
        // Chromium enters the next child before leaving the previous one.
        // Only leaving the current target ends the drag. Counting bubbling
        // entries can drift when Chromium repeats an entry or cancels externally.
        reset()
      }
    },
  }
}
