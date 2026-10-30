import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RotateCcw } from 'lucide-react'
import { translate } from '../i18n'
import { useUIStore } from '../stores/ui'
import { art } from '../features/rinari/art'

/**
 * Lo que se registra de un error de interfaz (plan 0.4.0 #58): el mensaje y
 * la pila de componentes, nunca el contenido del usuario. Va a `app.log` por
 * la consola del renderer.
 */
export function reportUiError(zone: string, error: unknown, componentStack?: string | null) {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  const stack = (componentStack ?? '').split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 12).join(' < ')
  console.error(`[rinari] ui error in ${zone}: ${message}${stack ? ` | components: ${stack}` : ''}`)
}

interface Props {
  /** chat, side-panel, board-pane, settings… */
  zone: string
  children: ReactNode
}

interface State {
  error: unknown
  attempt: number
}

/**
 * Si una zona falla, muestra «Algo falló aquí · Recargar esta vista» y el
 * resto de la app sigue en pie (#58). «Recargar» vuelve a montar la zona.
 */
export class ZoneBoundary extends Component<Props, State> {
  state: State = { error: null, attempt: 0 }

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    reportUiError(this.props.zone, error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      const lang = useUIStore.getState().lang
      return (
        <div role="alert" data-testid="zone-error" data-zone={this.props.zone} className="zone-error">
          <img src={art.chibi('oops')} alt="" aria-hidden="true" />
          <p className="zone-error-title">{translate(lang, 'app.zoneFailed')}</p>
          <p className="zone-error-hint">{translate(lang, 'app.zoneFailedHint')}</p>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => this.setState((state) => ({ error: null, attempt: state.attempt + 1 }))}
          >
            <RotateCcw size={13} aria-hidden="true" />
            {translate(lang, 'app.zoneReload')}
          </button>
        </div>
      )
    }
    return <div key={this.state.attempt} className="contents">{this.props.children}</div>
  }
}
