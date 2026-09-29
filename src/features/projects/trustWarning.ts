import { toast } from 'sonner'
import { translate } from '../../i18n'
import { commandMessage, engineApi, type TrustState } from '../../services/engine'
import { useUIStore } from '../../stores/ui'

/**
 * Aviso de un proyecto sin confianza vigente, con la acción para confiar.
 *
 * «Nunca confiado» y «la identidad cambió desde que confiaste» son cosas
 * distintas: un remoto Git nuevo o un repositorio re-creado invalidan la
 * confianza a propósito, y decir «no confiado» a quien acaba de confiar
 * parecía un fallo. El botón es la decisión explícita del usuario.
 */
export function warnUntrusted(root: string | null | undefined, state: TrustState | null | undefined, id: string): void {
  const lang = useUIStore.getState().lang
  const changed = state === 'revalidation-required'
  toast.warning(translate(lang, changed ? 'project.trustChanged' : 'project.untrustedWarning'), {
    id,
    description: changed ? translate(lang, 'project.trustChangedDetail') : undefined,
    action: root
      ? { label: translate(lang, changed ? 'project.trustAgain' : 'project.trust'), onClick: () => void trustFromWarning(root) }
      : undefined,
  })
}

async function trustFromWarning(root: string): Promise<void> {
  try {
    await engineApi.projectTrust(root)
    toast.success(translate(useUIStore.getState().lang, 'project.trusted'))
  } catch (err) {
    toast.error(commandMessage(err))
  }
}
