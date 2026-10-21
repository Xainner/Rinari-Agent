import { useRef, type ComponentType, type KeyboardEvent, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { useI18n } from '../../i18n'
import { cn } from '../../lib/utils'
import { ConnectorLogo } from '../connectors/ConnectorLogo'
import type { ConnectorMark } from './useConnectorDirectory'

/**
 * Las piezas de las fichas de la Agency (agente y equipo), con la cara del
 * resto de la app: tarjetas de ajustes con su icono, opciones como tarjetas
 * elegibles, conectores con su logo y un pie fijo con las acciones.
 */

type Icon = ComponentType<{ size?: number; 'aria-hidden'?: boolean | 'true'; className?: string }>

export function EditorPage({ testId, onSubmit, children, footer }: {
  testId: string
  onSubmit: () => void
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <div className="agency-editor-page" data-testid={testId}>
      <form
        className="agency-editor"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit()
        }}
      >
        <div className="agency-editor-body">{children}</div>
        <footer className="agency-editor-foot" data-toast-avoid="">
          <div className="agency-editor-foot-inner">{footer}</div>
        </footer>
      </form>
    </div>
  )
}

/** La cabecera: el avatar o la marca a la izquierda y el nombre grande, editable en su sitio. */
export function EditorHero({ media, kicker, children }: { media: ReactNode; kicker: string; children: ReactNode }) {
  return (
    <header className="agency-editor-hero">
      <div className="agency-editor-media">{media}</div>
      <div className="min-w-0 flex-1">
        <p className="agency-editor-kicker">{kicker}</p>
        {children}
      </div>
    </header>
  )
}

export function EditorSection({ icon: SectionIcon, title, hint, children, testId }: {
  icon: Icon
  title: string
  hint?: string
  children: ReactNode
  testId?: string
}) {
  return (
    <section className="agency-editor-section" data-testid={testId}>
      <div className="agency-editor-section-head">
        <span className="agency-editor-section-icon"><SectionIcon size={15} aria-hidden="true" /></span>
        <div className="min-w-0">
          <h2>{title}</h2>
          {hint && <p>{hint}</p>}
        </div>
      </div>
      <div className="agency-editor-section-body">{children}</div>
    </section>
  )
}

/** Una elección entre pocas opciones, cada una con su icono y lo que significa (radiogroup con flechas). */
export function OptionCards<V extends string>({ value, options, onChange, label, testId }: {
  value: V
  options: ReadonlyArray<{ value: V; icon: Icon; title: string; hint: string; tone?: 'warning' }>
  onChange: (value: V) => void
  label: string
  testId?: string
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const move = (event: KeyboardEvent, index: number) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const next = (index + step + options.length) % options.length
    refs.current[next]?.focus()
    onChange(options[next].value)
  }
  return (
    <div className="agency-option-cards" role="radiogroup" aria-label={label} data-testid={testId}>
      {options.map((option, index) => {
        const OptionIcon = option.icon
        const checked = option.value === value
        return (
          <button
            key={option.value}
            ref={(element) => { refs.current[index] = element }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            className="agency-option-card"
            data-value={option.value}
            data-tone={option.tone}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => move(event, index)}
          >
            <span className="agency-option-icon"><OptionIcon size={16} aria-hidden="true" /></span>
            <span className="agency-option-title">{option.title}</span>
            <span className="agency-option-hint">{option.hint}</span>
            {checked && <span className="agency-option-check" aria-hidden="true"><Check size={12} /></span>}
          </button>
        )
      })}
    </div>
  )
}

/** Los conectores que se pueden marcar, cada uno con su logo; lo marcado se ve. */
export function ConnectorTiles({ marks, selected, onToggle, empty }: {
  marks: ConnectorMark[]
  selected: string[]
  onToggle: (name: string) => void
  empty: string
}) {
  if (marks.length === 0) return <p className="field-hint mt-0">{empty}</p>
  return (
    <div className="agency-pick-grid">
      {marks.map((mark) => {
        const checked = selected.includes(mark.name)
        return (
          <label key={mark.name} className="agency-pick" data-checked={checked || undefined}>
            <input type="checkbox" className="r-checkbox" checked={checked} onChange={() => onToggle(mark.name)} />
            <ConnectorLogo name={mark.label} logo={mark.logo} tone={mark.tone} size={26} />
            <span className="min-w-0 flex-1 truncate">{mark.label}</span>
          </label>
        )
      })}
    </div>
  )
}

/** El presupuesto del día: dólares y tokens, con lo que pasa al pasarse. */
export function BudgetFields({ usd, tokens, onUsd, onTokens }: {
  usd: string
  tokens: string
  onUsd: (value: string) => void
  onTokens: (value: string) => void
}) {
  const { t } = useI18n()
  return (
    <div className="agency-budget">
      <label className="agency-budget-field">
        <span className="agency-budget-label">{t('agency.form.budgetUsd')}</span>
        <span className="agency-budget-input">
          <span aria-hidden="true">US$</span>
          <input className={cn('field-input')} inputMode="decimal" value={usd} placeholder="—" onChange={(event) => onUsd(event.target.value)} />
        </span>
      </label>
      <label className="agency-budget-field">
        <span className="agency-budget-label">{t('agency.form.budgetTokens')}</span>
        <span className="agency-budget-input">
          <input className="field-input" inputMode="numeric" value={tokens} placeholder="—" onChange={(event) => onTokens(event.target.value)} />
          <span aria-hidden="true">tokens</span>
        </span>
      </label>
    </div>
  )
}
