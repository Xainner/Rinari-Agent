import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  commandMessage,
  engineApi,
  type SessionContext,
  type SessionUsage,
} from '../../services/engine'
import { useI18n } from '../../i18n'
import { Section } from '../../components/settings/parts'
import SessionContextStatus from '../context/SessionContextStatus'

/** Inspector de contexto y uso de la sesión: estado real del engine. */
export default function InsightPanel({ sessionId }: { sessionId: string }) {
  const { t } = useI18n()
  const [context, setContext] = useState<SessionContext | null>(null)
  const [usage, setUsage] = useState<SessionUsage | null>(null)

  const reload = useCallback(async () => {
    try {
      const [ctx, use] = await Promise.all([
        engineApi.contextGet(sessionId),
        engineApi.usageGet(sessionId),
      ])
      setContext(ctx.context)
      setUsage(use.usage)
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }, [sessionId])

  useEffect(() => {
    setContext(null)
    setUsage(null)
    void reload()
  }, [reload])

  return (
    <div className="space-y-4">
      <Section title={t('context.session')}>
        <SessionContextStatus sessionId={sessionId} />
      </Section>

      <Section title={t('insight.context')}>
        {!context && (
          <p className="text-sm text-[var(--text-subtle)]">{t('insight.loading')}</p>
        )}
        {context && (
          <div className="space-y-1 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-muted)]">{t('insight.compacted')}</span>
              <span className="font-semibold text-[var(--text)]">
                {context.compacted ? t('insight.yes') : t('insight.no')}
              </span>
            </div>
            {Object.entries(context.counts).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="font-mono text-xs text-[var(--text-muted)]">{key}</span>
                <span className="font-mono text-xs text-[var(--text)]">{value}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title={t('insight.usage')}>
        {!usage && (
          <p className="text-sm text-[var(--text-subtle)]">{t('insight.loading')}</p>
        )}
        {usage && (
          <div className="space-y-1 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-muted)]">{t('insight.modelCalls')}</span>
              <span className="font-mono text-xs text-[var(--text)]">{usage.model_calls}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-muted)]">{t('insight.tokens')}</span>
              <span className="font-mono text-xs text-[var(--text)]">
                {usage.tokens.input} / {usage.tokens.output}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-muted)]">{t('insight.toolCalls')}</span>
              <span className="font-mono text-xs text-[var(--text)]">
                {usage.tool_calls.total} ({usage.tool_calls.error} err)
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-subtle)]">{t('insight.noCost')}</p>
          </div>
        )}
      </Section>
    </div>
  )
}
