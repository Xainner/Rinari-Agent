import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { LoaderCircle } from 'lucide-react'
import { commandMessage, engineApi, type McpProjectOffers } from '../../services/engine'
import { useI18n } from '../../i18n'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog'
import { CandidateBody } from './ImportDialog'
import { SegChoice } from './SegChoice'
import { useProjectOffersCheck } from './connectorStore'

type Answer = 'accept' | 'reject'

/**
 * Los servidores que trae un proyecto en `.mcp.json` (y `.rinari/`,
 * `.vscode/`, `.cursor/`), como Claude Code: al abrir una carpeta de
 * confianza, Rinari pregunta una vez por cada servidor sin decidir. La
 * respuesta la guarda el Engine, así que no se vuelve a preguntar; «Más
 * tarde» no responde nada. Una carpeta sin confianza no ofrece nada.
 */
export function ProjectOffersPrompt({ root, enabled }: { root: string | null; enabled: boolean }) {
  const { t } = useI18n()
  const [offers, setOffers] = useState<McpProjectOffers | null>(null)
  const [answers, setAnswers] = useState<Record<string, Answer>>({})
  const [busy, setBusy] = useState(false)
  // Lo aplazado con «Más tarde» no se vuelve a preguntar en esta ventana.
  const deferred = useRef(new Set<string>())
  const requestRoot = useProjectOffersCheck((state) => state.root)
  const nonce = useProjectOffersCheck((state) => state.nonce)
  const [target, setTarget] = useState<string | null>(root)

  useEffect(() => { setTarget(root) }, [root])
  useEffect(() => {
    if (nonce === 0 || !requestRoot) return
    deferred.current.delete(requestRoot)
    setTarget(requestRoot)
  }, [nonce])

  useEffect(() => {
    if (!enabled || !target || deferred.current.has(target)) return
    let alive = true
    engineApi.mcpProjectOffersList(target).then((found) => {
      if (!alive || !found.trusted || found.offers.length === 0) return
      setOffers(found)
      setAnswers({})
    }).catch(() => undefined)
    return () => { alive = false }
  }, [enabled, target, nonce])

  function later() {
    if (offers) deferred.current.add(offers.project)
    setOffers(null)
  }

  async function save() {
    if (!offers) return
    const decisions = offers.offers.filter((offer) => answers[offer.key]).map((offer) => ({ key: offer.key, accept: answers[offer.key] === 'accept' }))
    if (decisions.length === 0) return
    setBusy(true)
    try {
      const result = await engineApi.mcpProjectOffersDecide(offers.project, decisions)
      if (result.created.length > 0) toast.success(t('connectors.offers.created', { n: result.created.length }))
      for (const failure of result.failed) toast.error(failure.message || failure.code)
      // Lo que quedó sin responder se pregunta la próxima vez que se abra.
      if (decisions.length < offers.offers.length) deferred.current.add(offers.project)
      setOffers(null)
    } catch (err) {
      toast.error(commandMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const answered = offers ? offers.offers.filter((offer) => answers[offer.key]).length : 0
  return (
    <Dialog open={offers !== null} onOpenChange={(open) => { if (!open) later() }}>
      <DialogContent className="max-w-xl" data-testid="project-offers">
        {offers && (
          <>
            <DialogHeader>
              <DialogTitle>{offers.offers.length === 1 ? t('connectors.offers.titleOne') : t('connectors.offers.title', { n: offers.offers.length })}</DialogTitle>
              <DialogDescription>{t('connectors.offers.intro')}</DialogDescription>
            </DialogHeader>
            <p className="font-mono text-[12px] text-[var(--text-subtle)] break-all">{offers.project}</p>
            <ul className="import-list" aria-label={t('connectors.offers.list')}>
              {offers.offers.map((offer) => (
                <li key={offer.key} className="import-item flex-col" data-key={offer.key}>
                  <div className="flex w-full flex-wrap items-center gap-2">
                    <b className="text-[13px] text-[var(--text)]" id={`offer-${offer.key}`}>{offer.name}</b>
                    <span className="mcp-chip">{t(offer.transport === 'http' ? 'connectors.chip.remote' : 'connectors.chip.local')}</span>
                    {offer.path && <span className="font-mono text-[11px] text-[var(--text-subtle)]">{offer.path.split(/[\\/]/).slice(-2).join('/')}</span>}
                    {offer.changed && <span className="r-chip" data-tone="warning">{t('connectors.offers.changed')}</span>}
                  </div>
                  <div className="w-full"><CandidateBody candidate={offer} /></div>
                  <SegChoice<Answer>
                    small
                    value={answers[offer.key] ?? null}
                    labelledBy={`offer-${offer.key}`}
                    disabled={busy}
                    options={[
                      ...(offer.importable ? [{ value: 'accept' as const, label: t('connectors.offers.accept') }] : []),
                      { value: 'reject', label: t('connectors.offers.reject') },
                    ]}
                    onChange={(value) => setAnswers((current) => ({ ...current, [offer.key]: value }))}
                  />
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className="btn btn-quiet" onClick={later}>{t('connectors.offers.later')}</button>
              <button type="button" className="btn btn-primary" disabled={answered === 0 || busy} onClick={() => void save()} data-testid="offers-save">
                {busy && <LoaderCircle size={14} className="r-spin" />} {t('connectors.offers.save', { n: answered })}
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
