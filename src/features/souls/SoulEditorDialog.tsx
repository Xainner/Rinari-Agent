import { useEffect, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { commandMessage, engineApi, type SoulDetail } from '../../services/engine'
import { useI18n } from '../../i18n'
import Markdown from '../../components/Markdown'
import { inputClass, labelClass } from '../../components/settings/parts'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog'
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

/** Lo que se edita de un alma. */
export interface SoulDraft {
  /** Editando una propia; `null` al crear o duplicar. */
  id: string | null
  /** Copia de otra alma: el título dice «Duplicar alma», no «Crear» (#68). */
  duplicate?: boolean
  name: string
  description: string
  identity: string
}

/** El borrador para editar un alma: la propia en su sitio; una de serie, como copia. */
export function soulDraftOf(soul: SoulDetail, copyName: string): SoulDraft {
  const own = soul.source === 'custom'
  return {
    id: own ? soul.id : null,
    duplicate: !own,
    name: own ? soul.name : copyName,
    description: soul.description,
    identity: soul.identity,
  }
}

/**
 * El editor de un alma (nombre, descripción y su texto en Markdown, con vista
 * previa): el de Ajustes → Personalidad, y el que abre la Agency para el
 * Soul de un agente (D-34). Crea o guarda, y devuelve el alma guardada.
 */
export default function SoulEditorDialog({ draft, takenIds, onClose, onSaved }: {
  /** null: cerrado. */
  draft: SoulDraft | null
  /** Los ids que ya existen, para dar uno libre a un alma nueva. */
  takenIds: readonly string[]
  onClose: () => void
  onSaved: (soul: SoulDetail) => void
}) {
  const { t } = useI18n()
  const [form, setForm] = useState<SoulDraft | null>(draft)
  const [preview, setPreview] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setForm(draft)
    setPreview(false)
  }, [draft])

  async function save() {
    if (!form || form.name.trim() === '' || saving) return
    setSaving(true)
    try {
      let saved: SoulDetail
      if (form.id === null) {
        saved = (await engineApi.soulCreate({
          id: soulIdFor(form.name, new Set(takenIds)),
          name: form.name.trim(),
          identity: form.identity,
          description: form.description.trim() === '' ? undefined : form.description.trim(),
        })).soul
      } else {
        await engineApi.soulUpdate({ id: form.id, name: form.name.trim(), identity: form.identity, description: form.description })
        saved = (await engineApi.soulGet(form.id)).soul
      }
      onSaved(saved)
    } catch (err) {
      toast.error(commandMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={draft !== null} onOpenChange={(next) => !next && onClose()}>
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
          <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">{t('providers.cancel')}</button>
          <button type="button" onClick={() => void save()} disabled={saving || !form?.name.trim()} className="btn btn-primary btn-sm" data-testid="soul-save">{t('providers.save')}</button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
