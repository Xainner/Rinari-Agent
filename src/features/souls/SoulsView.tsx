import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, Download, Pencil, Trash2, TriangleAlert, Upload } from 'lucide-react'
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
import { inputClass, labelClass } from '../../components/settings/parts'
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
import { SegTabPill } from '../../components/ui/SegTabPill'

/** Un id a partir del nombre, libre entre las almas que ya hay (como los perfiles, #86). */
export function soulIdFor(name: string, taken: Set<string>): string {
  const base = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '') || 'alma'
  let candidate = base
  for (let number = 2; taken.has(candidate); number += 1) candidate = `${base}-${number}`
  return candidate
}

interface FormState {
  /** Editando una propia; `null` al crear o duplicar. */
  id: string | null
  /** Copia de otra alma: el título dice «Duplicar alma», no «Crear» (#68). */
  duplicate?: boolean
  name: string
  description: string
  identity: string
}

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
  const [form, setForm] = useState<FormState | null>(null)
  const [preview, setPreview] = useState(false)
  const [saving, setSaving] = useState(false)
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
    setPreview(false)
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

  async function save() {
    if (!form || form.name.trim() === '') return
    setSaving(true)
    try {
      if (form.id === null) {
        const { soul } = await engineApi.soulCreate({
          id: soulIdFor(form.name, new Set(souls.map((item) => item.id))),
          name: form.name.trim(),
          identity: form.identity,
          description: form.description.trim() === '' ? undefined : form.description.trim(),
        })
        setDetail(soul)
      } else {
        await engineApi.soulUpdate({ id: form.id, name: form.name.trim(), identity: form.identity, description: form.description })
        setDetail((await engineApi.soulGet(form.id)).soul)
      }
      setForm(null)
      await reload()
      onChanged()
    } catch (err) {
      toast.error(commandMessage(err))
    } finally {
      setSaving(false)
    }
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
          <button type="button" onClick={() => { setForm({ id: null, name: '', description: '', identity: '' }); setPreview(false) }} className="btn btn-primary btn-sm">
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

      <Dialog open={form !== null} onOpenChange={(next) => !next && setForm(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto" data-testid="soul-form">
          <DialogHeader>
            <DialogTitle>{form?.id ? t('soul.edit') : form?.duplicate ? t('soul.duplicateTitle') : t('soul.create')}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="space-y-4">
              <div>
                <label className={labelClass} htmlFor="soul-name">{t('soul.nameLabel')}</label>
                <input id="soul-name" value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} autoComplete="off" />
              </div>
              <div>
                <label className={labelClass} htmlFor="soul-description">{t('soul.descriptionLabel')}</label>
                <input id="soul-description" value={form.description} maxLength={500} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputClass} autoComplete="off" />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label className={labelClass} htmlFor="soul-identity">{t('soul.identityLabel')}</label>
                  <div role="tablist" className="seg-tabs w-fit">
                    {[false, true].map((showing) => (
                      <button key={String(showing)} type="button" role="tab" className="seg-tab" aria-selected={preview === showing} data-active={preview === showing || undefined} onClick={() => setPreview(showing)}>
                        {preview === showing && <SegTabPill />}
                        <span className="relative">{showing ? t('soul.previewText') : t('soul.writeText')}</span>
                      </button>
                    ))}
                  </div>
                </div>
                {preview
                  ? <div className="soul-editor soul-editor-preview" data-testid="soul-form-preview">{form.identity.trim() ? <Markdown>{form.identity}</Markdown> : <p>{t('soul.emptyText')}</p>}</div>
                  : <textarea id="soul-identity" value={form.identity} onChange={(e) => setForm({ ...form, identity: e.target.value })} rows={14} spellCheck={false} className={`${inputClass} soul-editor font-mono text-[13px] leading-relaxed`} />}
                {form.identity.trim() === '' && <p className="soul-empty-warning" data-testid="soul-empty-warning"><TriangleAlert size={13} aria-hidden="true" />{t('soul.emptyWarning')}</p>}
              </div>
            </div>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setForm(null)} className="btn btn-ghost btn-sm">{t('providers.cancel')}</button>
            <button type="button" onClick={() => void save()} disabled={saving || !form?.name.trim()} className="btn btn-primary btn-sm" data-testid="soul-save">{t('providers.save')}</button>
          </div>
        </DialogContent>
      </Dialog>

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
