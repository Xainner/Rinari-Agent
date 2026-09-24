import { useEffect, useState } from 'react'
import { useI18n } from '../../i18n'
import { Row, Section } from '../../components/settings/parts'
import { engineApi, type PtyShell } from '../../services/engine'
import { useEngineData } from '../engine/EngineContext'
import { TERMINAL_FONT_SIZES, useTerminalPrefs } from '../terminal/terminalStore'

const SELECT_CLASS = 'rounded-xl border border-white/10 bg-[var(--bg-subtle)] px-2.5 py-1.5 text-sm'

/**
 * Ajustes > Terminal: el shell con el que se abre una terminal nueva y el
 * tamaño de letra. Los shells los detecta el Engine (`pty.shells`); la
 * preferencia es de este escritorio.
 */
export default function TerminalView() {
  const { t } = useI18n()
  const data = useEngineData()
  const enabled = data.status?.capabilities.desktop_terminal_v1 === true
  const prefs = useTerminalPrefs((state) => state.prefs)
  const setPrefs = useTerminalPrefs((state) => state.setPrefs)
  const [shells, setShells] = useState<PtyShell[]>([])
  const [supported, setSupported] = useState(true)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    engineApi
      .ptyShells()
      .then((result) => {
        if (cancelled) return
        setShells(result.shells)
        setSupported(result.supported)
      })
      .catch(() => {
        if (!cancelled) setSupported(false)
      })
    return () => {
      cancelled = true
    }
  }, [enabled])

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-[var(--text)]">{t('terminal.title')}</h2>
      {!enabled || !supported ? (
        <Section title={t('terminal.status')}>
          <p className="text-sm text-[var(--text-muted)]">{enabled ? t('terminal.unsupported') : t('terminal.unavailable')}</p>
        </Section>
      ) : (
        <Section title={t('terminal.settings')} desc={t('terminal.settingsHint')}>
          <Row
            title={t('terminal.shell')}
            desc={t('terminal.shellHint')}
            control={
              <select
                aria-label={t('terminal.shell')}
                value={shells.some((shell) => shell.id === prefs.shellId) ? prefs.shellId : ''}
                onChange={(event) => setPrefs({ shellId: event.target.value })}
                className={SELECT_CLASS}
              >
                <option value="">{t('terminal.shellDefault', { name: shells[0]?.label ?? '—' })}</option>
                {shells.map((shell) => (
                  <option key={shell.id} value={shell.id}>
                    {shell.label}
                  </option>
                ))}
              </select>
            }
          />
          <Row
            title={t('terminal.fontSize')}
            control={
              <select
                aria-label={t('terminal.fontSize')}
                value={prefs.fontSize}
                onChange={(event) => setPrefs({ fontSize: Number(event.target.value) })}
                className={SELECT_CLASS}
              >
                {TERMINAL_FONT_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size} px
                  </option>
                ))}
              </select>
            }
          />
        </Section>
      )}
    </div>
  )
}
