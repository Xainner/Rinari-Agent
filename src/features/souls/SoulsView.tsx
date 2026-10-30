import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, Download, Pencil, Trash2, Upload } from 'lucide-react'
import { art } from '../rinari/art'
import { toast } from 'sonner'
import CharacterIntensity from './CharacterIntensity'
import {
  commandMessage,
  engineApi,
  type SoulDetail,
  type SoulSummary,
} from '../../services/engine'
import { useI18n } from '../../i18n'
import { platform } from '../../platform'
import Markdown from '../../components/Markdown'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog'
import SoulEditorDialog, { type SoulDraft } from './SoulEditorDialog'

export { soulIdFor } from './SoulEditorDialog'

/**
 * Ajustes → Personalidad (plan 0.4.0 #87). Arriba, «Cómo habla Rinari»: el
 * nivel con su vista previa. Abajo, las almas como galería: cada tarjeta con
 * su inicial, nombre, descripción y «En uso»; al abrir una, su texto en
 * Markdown con «Usar», «Duplicar para editar», «Exportar» (su `soul.toml` y su
 * `identity.md` en una carpeta) y, si es propia, «Editar» y «Eliminar».
 * «Importar alma» toma esos archivos. La Soul es solo voz: no toca permisos,
 * aprobaciones ni verificación (lo impone el Engine).
 */
export default function SoulsView({ onChanged }: { onChanged: () => void }) {
  const { t } = useI18n()
  const [souls, setSouls] = useState<SoulSummary[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [detail, setDetail] = useState<SoulDetail | null>(null)
  const [form, setForm] = useState<SoulDraft | null>(null)
  const [deleting, setDeleting] = useState<SoulSummary | null>(null)

  const reload = useCallback(async () => {
    try {
      const result = await engineApi.soulList()
      setSouls(result.souls)
      // Un home nuevo no tiene activación explícita y aun así habla con el
      // Soul de serie: se marca el que está en uso, no sólo el activado.
      setActiveId(result.effective_id !== undefined ? result.effective_id : result.active_id)
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  async function open(id: string) {
    try {
      setDetail((await engineApi.soulGet(id)).soul)
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }

  async function use(id: string) {
    try {
      await engineApi.soulActivate(id)
      await reload()
      onChanged()
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }

  function edit(soul: SoulDetail, duplicate: boolean) {
    setForm({
      id: duplicate ? null : soul.id,
      duplicate,
      name: duplicate ? t('soul.copyName', { name: soul.name }) : soul.name,
      description: soul.description,
      identity: soul.identity,
    })
    setDetail(null)
  }

  async function exportSoul(soul: SoulSummary) {
    try {
      const folder = (await platform().dialog.openFiles({ directory: true, title: t('soul.exportTitle') }))?.[0]
      if (!folder) return
      const result = await engineApi.soulExport(soul.id, folder)
      toast.success(t('soul.exported', { path: result.path }))
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }

  async function importSoul() {
    try {
      const paths = await platform().dialog.openFiles({ multiple: true, title: t('soul.importTitle') })
      if (!paths) return
      const { soul } = await engineApi.soulImport(paths)
      toast.success(t('soul.imported', { name: soul.name }))
      await reload()
      setDetail(soul)
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }

  async function saved(soul: SoulDetail) {
    setForm(null)
    setDetail(soul)
    await reload()
    onChanged()
  }

  async function removeSoul() {
    if (!deleting) return
    try {
      await engineApi.soulRemove(deleting.id)
      setDetail(null)
      setDeleting(null)
      await reload()
      onChanged()
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }

  return (
    <div className="space-y-4" data-testid="souls-view">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-[var(--text)]">{t('soul.title')}</h2>
        <div className="flex gap-2">
          <button type="button" onClick={() => void importSoul()} className="btn btn-secondary btn-sm" data-testid="soul-import">
            <Upload size={13} aria-hidden="true" /> {t('soul.import')}
          </button>
          <button type="button" onClick={() => setForm({ id: null, name: '', description: '', identity: '' })} className="btn btn-primary btn-sm">
            {t('soul.create')}
          </button>
        </div>
      </div>
      <p className="text-sm text-[var(--text-subtle)]">{t('soul.voiceOnly')}</p>
      <CharacterIntensity />

      <h3 className="pt-2 text-sm font-semibold text-[var(--text)]">{t('soul.gallery')}</h3>
      <div className="profiles-grid soul-gallery" data-testid="soul-gallery">
        {souls.map((soul) => {
          const active = soul.id === activeId
          return (
            <button
              key={soul.id}
              type="button"
              className="profile-card settings-card soul-card text-left"
              data-testid="soul-card"
              data-active={active || undefined}
              onClick={() => void open(soul.id)}
            >
              <header className="profile-card-head">
                <span className="soul-avatar" aria-hidden="true" data-art={soul.source !== 'custom' || undefined}>
                  {soul.source !== 'custom' ? <img src={art.expression('idle')} alt="" draggable={false} /> : soul.name.trim().charAt(0).toUpperCase() || '?'}
                </span>
                <span className="profile-card-name">{soul.name}</span>
                {active && <span className="r-chip" data-tone="accent"><Check size={11} aria-hidden="true" /> {t('soul.inUse')}</span>}
              </header>
              {soul.description !== '' && <p className="profile-card-desc">{soul.description}</p>}
              <p className="soul-card-meta">{soul.source === 'custom' ? t('soul.custom') : t('soul.bundled')} · v{soul.version}</p>
            </button>
          )
        })}
      </div>

      <Dialog open={detail !== null} onOpenChange={(next) => !next && setDetail(null)}>
        <DialogContent className="soul-panel max-w-2xl" data-testid="soul-panel">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>{detail.name}</DialogTitle>
                <DialogDescription>{detail.description || (detail.source === 'custom' ? t('soul.custom') : t('soul.bundled'))}</DialogDescription>
              </DialogHeader>
              <div className="soul-panel-text" data-testid="soul-panel-text">
                {detail.identity.trim() ? <Markdown>{detail.identity}</Markdown> : <p>{t('soul.emptyText')}</p>}
              </div>
              <div className="soul-panel-actions">
                {detail.id !== activeId && (
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => { void use(detail.id); setDetail(null) }}>{t('soul.use')}</button>
                )}
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => edit(detail, true)}><Copy size={12} aria-hidden="true" /> {t('soul.duplicate')}</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void exportSoul(detail)}><Download size={12} aria-hidden="true" /> {t('soul.export')}</button>
                {detail.source === 'custom' && (
                  <>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => edit(detail, false)}><Pencil size={12} aria-hidden="true" /> {t('soul.edit')}</button>
                    <button type="button" className="btn btn-ghost btn-sm text-[var(--danger)]" onClick={() => setDeleting(detail)}><Trash2 size={12} aria-hidden="true" /> {t('soul.delete')}</button>
                  </>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <SoulEditorDialog draft={form} takenIds={souls.map((item) => item.id)} onClose={() => setForm(null)} onSaved={(soul) => void saved(soul)} />

      <AlertDialog open={deleting !== null} onOpenChange={(next) => !next && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('soul.delete')}</AlertDialogTitle>
            <AlertDialogDescription>{deleting && t('soul.confirmDelete', { name: deleting.name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('providers.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void removeSoul()}>{t('soul.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
