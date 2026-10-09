import { useCallback, useEffect, useState } from 'react'
import CharacterIntensity from './CharacterIntensity'
import { toast } from 'sonner'
import {
  commandMessage,
  engineApi,
  type SoulDetail,
  type SoulSummary,
} from '../../services/engine'
import { useI18n } from '../../i18n'
import { Section } from '../../components/settings/parts'
import {
  Dialog,
  DialogContent,
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
import { inputClass, labelClass } from '../../components/settings/parts'

/**
 * Ajustes > Soul: lista (bundled + customs), activar, crear, editar
 * identidad en crudo, eliminar customs. La Soul es solo voz: no toca
 * permisos, aprobaciones ni verificación (lo impone el engine).
 */
export default function SoulsView({ onChanged }: { onChanged: () => void }) {
  const { t } = useI18n()
  const [souls, setSouls] = useState<SoulSummary[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [detail, setDetail] = useState<SoulDetail | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [editing, setEditing] = useState<null | { id: string } | { id: null }>(null)
  const [form, setForm] = useState({ id: '', name: '', identity: '', description: '' })
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

  async function openSoul(id: string) {
    if (openId === id) {
      setOpenId(null)
      setDetail(null)
      return
    }
    try {
      const result = await engineApi.soulGet(id)
      setDetail(result.soul)
      setOpenId(id)
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }

  async function activate(id: string) {
    try {
      await engineApi.soulActivate(id)
      await reload()
      onChanged()
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }

  function openCreate() {
    setForm({ id: '', name: '', identity: '', description: '' })
    setEditing({ id: null })
  }

  function openEdit(soul: SoulDetail) {
    setForm({ id: soul.id, name: soul.name, identity: soul.identity, description: soul.description })
    setEditing({ id: soul.id })
  }

  async function save() {
    if (form.id.trim() === '' || form.name.trim() === '' || form.identity.trim() === '') {
      return
    }
    setSaving(true)
    try {
      if (editing?.id === null) {
        await engineApi.soulCreate({
          id: form.id.trim(),
          name: form.name.trim(),
          identity: form.identity,
          description: form.description.trim() === '' ? undefined : form.description.trim(),
        })
      } else if (editing) {
        await engineApi.soulUpdate({
          id: editing.id,
          name: form.name.trim(),
          identity: form.identity,
          description: form.description,
        })
        const result = await engineApi.soulGet(editing.id)
        setDetail(result.soul)
      }
      setEditing(null)
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
      if (openId === deleting.id) {
        setOpenId(null)
        setDetail(null)
      }
      setDeleting(null)
      await reload()
      onChanged()
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-[var(--text)]">
          {t('soul.title')}
        </h2>
        <button
          type="button"
          onClick={openCreate}
          className="btn btn-primary"
        >
          {t('soul.create')}
        </button>
      </div>
      <p className="text-sm text-[var(--text-subtle)]">{t('soul.voiceOnly')}</p>
      <CharacterIntensity />

      {souls.map((soul) => {
        const active = soul.id === activeId
        const isOpen = openId === soul.id
        return (
          <Section key={soul.id} title={`${soul.name}${active ? ` · ${t('soul.active')}` : ''}`}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-subtle)]">
              <span className="font-mono">{soul.id}</span>
              <span>v{soul.version}</span>
              <span>{soul.source}</span>
            </div>
            {soul.description !== '' && (
              <p className="text-sm text-[var(--text-muted)]">{soul.description}</p>
            )}
            <div className="flex flex-wrap gap-2">
              {!active && (
                <button
                  type="button"
                  onClick={() => void activate(soul.id)}
                  className="btn btn-primary btn-sm"
                >
                  {t('soul.activate')}
                </button>
              )}
              <button
                type="button"
                onClick={() => void openSoul(soul.id)}
                className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-[var(--bg-hover)]"
              >
                {t('soul.view')}
              </button>
              {soul.source === 'custom' && detail?.id === soul.id && (
                <button
                  type="button"
                  onClick={() => openEdit(detail)}
                  className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs transition-colors hover:bg-[var(--bg-hover)]"
                >
                  {t('soul.edit')}
                </button>
              )}
              {soul.source === 'custom' && (
                <button
                  type="button"
                  onClick={() => setDeleting(soul)}
                  className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs text-red-400 transition-colors hover:bg-[var(--bg-hover)]"
                >
                  {t('soul.delete')}
                </button>
              )}
            </div>
            {isOpen && detail && (
              <pre className="max-h-80 overflow-auto rounded-xl bg-[var(--bg-app)] px-3 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap text-[var(--text-muted)]">
                {detail.identity}
              </pre>
            )}
          </Section>
        )
      })}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing?.id === null ? t('soul.create') : t('soul.edit')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {editing?.id === null && (
              <div>
                <label className={labelClass} htmlFor="soul-id">
                  {t('soul.idLabel')}
                </label>
                <input
                  id="soul-id"
                  value={form.id}
                  onChange={(e) => setForm({ ...form, id: e.target.value })}
                  placeholder={t('soul.idPlaceholder')}
                  className={inputClass}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            )}
            <div>
              <label className={labelClass} htmlFor="soul-name">
                {t('soul.nameLabel')}
              </label>
              <input
                id="soul-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputClass}
                autoComplete="off"
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="soul-description">
                {t('soul.descriptionLabel')}
              </label>
              <input
                id="soul-description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className={inputClass}
                autoComplete="off"
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="soul-identity">
                {t('soul.identityLabel')}
              </label>
              <textarea
                id="soul-identity"
                value={form.identity}
                onChange={(e) => setForm({ ...form, identity: e.target.value })}
                rows={14}
                spellCheck={false}
                className={`${inputClass} font-mono text-[13px] leading-relaxed`}
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-sm transition-colors hover:bg-[var(--bg-hover)]"
            >
              {t('providers.cancel')}
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="btn btn-primary btn-sm"
            >
              {t('providers.save')}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('soul.delete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && t('soul.confirmDelete', { name: deleting.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('providers.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void removeSoul()}>
              {t('soul.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
