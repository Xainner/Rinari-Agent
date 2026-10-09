import { ArrowDown } from 'lucide-react'
import { useI18n } from '../../i18n'

export default function ScrollToBottom({
  visible,
  onClick,
}: {
  visible: boolean
  onClick: () => void
}) {
  const { t } = useI18n()
  if (!visible) return null
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t('scroll.bottom')}
      title={t('scroll.bottom')}
      className="absolute bottom-2 left-1/2 z-10 flex size-9 -translate-x-1/2 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-muted)] shadow-lg transition-colors hover:text-[var(--text)]"
    >
      <ArrowDown size={16} />
    </button>
  )
}
