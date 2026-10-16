/**
 * Avisos repetidos iguales en el registro (plan 0.4.0 #58): el primero se
 * escribe, los siguientes de la misma ventana se cuentan y, al cerrarse la
 * ventana, queda una línea «×120 en 10 min». 7332 avisos de ResizeObserver
 * en tres días tapaban todo lo demás.
 */
export interface RepeatGrouper {
  log(message: string): void
  flush(): void
}

export function createRepeatGrouper(
  write: (line: string) => void,
  { windowMs = 10 * 60_000, now = () => Date.now() }: { windowMs?: number; now?: () => number } = {},
): RepeatGrouper {
  const seen = new Map<string, { since: number; count: number }>()

  function close(message: string, entry: { since: number; count: number }) {
    if (entry.count > 0) {
      const minutes = Math.max(1, Math.round((now() - entry.since) / 60_000))
      write(`${message} (×${entry.count} más en ${minutes} min)`)
    }
    seen.delete(message)
  }

  return {
    log(message) {
      const at = now()
      for (const [key, entry] of seen) if (at - entry.since >= windowMs) close(key, entry)
      const entry = seen.get(message)
      if (entry) {
        entry.count += 1
        return
      }
      seen.set(message, { since: at, count: 0 })
      write(message)
    },
    flush() {
      for (const [key, entry] of [...seen]) close(key, entry)
    },
  }
}
