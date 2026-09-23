import { platform } from '../platform'

/** Copia texto solo después de que el host nativo confirme la escritura. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await platform().clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
