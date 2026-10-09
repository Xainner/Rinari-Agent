import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Zap } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { useI18n, type I18nKey } from '../../i18n'
import { REASONING_LEVELS, supportsEffort, type ReasoningEffort } from '../../lib/reasoning'
import { cn } from '../../lib/utils'

/** Niveles con efecto propio en el deslizador: cuanto más alto, más brillo. */
const INTENSE: Partial<Record<ReasoningEffort, string>> = { xhigh: 'is-xhigh', max: 'is-max', ultra: 'is-ultra' }

const description = (level: ReasoningEffort): I18nKey =>
  `thinking.desc${level === 'off' ? 'Off' : level[0].toUpperCase() + level.slice(1)}` as I18nKey

/**
 * Esfuerzo de razonamiento como deslizador de «más rápido» a «más
 * inteligente». Solo muestra los niveles que el modelo declara; «Predeterminado»
 * siempre está. Arrastrar o usar las flechas cambia el nivel sin cerrar; elegir
 * un nivel por su nombre lo aplica y cierra.
 */
export default function EffortPicker({ value, capabilities, disabled, onChange }: {
  value: ReasoningEffort
  capabilities: Record<string, unknown> | null | undefined
  disabled?: boolean
  onChange: (level: ReasoningEffort) => void
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const levels = useMemo(() => REASONING_LEVELS.filter((level) => level === value || supportsEffort(capabilities, level)), [capabilities, value])
  const index = Math.max(0, levels.indexOf(value))
  const track = useRef<HTMLDivElement>(null)
  const percent = levels.length > 1 ? (index / (levels.length - 1)) * 100 : 0
  const intense = INTENSE[value] ?? ''

  function levelAt(clientX: number): ReasoningEffort {
    const box = track.current?.getBoundingClientRect()
    if (!box || levels.length < 2) return levels[0] ?? value
    const ratio = Math.min(1, Math.max(0, (clientX - box.left) / box.width))
    return levels[Math.round(ratio * (levels.length - 1))]
  }
  function drag(event: PointerEvent<HTMLDivElement>) {
    if (event.type === 'pointerdown') event.currentTarget.setPointerCapture(event.pointerId)
    else if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    const next = levelAt(event.clientX)
    if (next !== value) onChange(next)
  }
  function keys(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 0
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      onChange(levels[event.key === 'Home' ? 0 : levels.length - 1])
      return
    }
    if (!step) return
    event.preventDefault()
    const next = levels[Math.min(levels.length - 1, Math.max(0, index + step))]
    if (next !== value) onChange(next)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" disabled={disabled} title={t('composer.thinkingMenu')} className={cn('composer-chip effort-chip', intense)} data-level={value}>
          <Zap size={13} aria-hidden="true" />
          <span>{t(`thinking.${value}` as I18nKey)}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className={cn('effort-pop w-[19rem] p-4', intense)}>
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[13px] text-[var(--text-muted)]">{t('composer.thinkingMenu')} <b className="font-display text-[15px] text-[var(--text)]">{t(`thinking.${value}` as I18nKey)}</b></p>
        </div>
        <div className="mt-3 flex justify-between text-[11.5px] text-[var(--text-subtle)]">
          <span>{t('effort.faster')}</span><span>{t('effort.smarter')}</span>
        </div>
        <div
          ref={track}
          role="slider"
          tabIndex={0}
          aria-label={t('composer.thinkingMenu')}
          aria-valuemin={0}
          aria-valuemax={Math.max(0, levels.length - 1)}
          aria-valuenow={index}
          aria-valuetext={t(`thinking.${value}` as I18nKey)}
          onPointerDown={drag}
          onPointerMove={drag}
          onKeyDown={keys}
          className="effort-track"
        >
          <span className="effort-rail" />
          <span className="effort-fill" style={{ width: `${percent}%` }} />
          {levels.map((level, i) => <span key={level} className="effort-tick" data-on={i <= index || undefined} style={{ left: `${levels.length > 1 ? (i / (levels.length - 1)) * 100 : 0}%` }} />)}
          <span className="effort-thumb" style={{ left: `${percent}%` }}>
            {value === 'ultra' && <><i /><i /><i /><i /></>}
          </span>
        </div>
        <p className="min-h-[2.6em] text-[12px] leading-snug text-[var(--accent-2)]">{t(description(value))}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {levels.map((level) => (
            <button key={level} type="button" aria-pressed={level === value} onClick={() => { setOpen(false); onChange(level) }} className={cn('effort-level', level === value && 'is-on')}>
              {t(`thinking.${level}` as I18nKey)}
            </button>
          ))}
        </div>
        <p className="mt-3 text-[11px] leading-snug text-[var(--text-subtle)]">{t('thinking.compatibility')}</p>
      </PopoverContent>
    </Popover>
  )
}
