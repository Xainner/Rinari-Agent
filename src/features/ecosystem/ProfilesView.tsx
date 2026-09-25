import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  commandMessage,
  engineApi,
  type ProfileBundle,
} from '../../services/engine'
import { useI18n } from '../../i18n'
import { Section } from '../../components/settings/parts'
import { inputClass, labelClass } from '../../components/settings/parts'
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

/**
 * Ajustes > Perfiles: bundles soul + modo + modelos por agente.
 * Aplicar solo llama a los setters existentes y reporta lo aplicado.
 */
export default function ProfilesView({
  activeSessionId,
  onChanged,
}: {
  activeSessionId: string | null
  onChanged: () => void
}) {
  const { t } = useI18n()
  const [profiles, setProfiles] = useState<ProfileBundle[]>([])
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ id: '', name: '', mode: '', soul_id: '' })
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState<ProfileBundle | null>(null)

  const reload = useCallback(async () => {
    try {
      const result = await engineApi.bundleList()
      setProfiles(result.profiles)
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  async function apply(profile: ProfileBundle) {
    try {
      const result = await engineApi.bundleApply(profile.id, activeSessionId ?? undefined)
      const applied = result.applied as Record<string, unknown>
      toast.success(
        t('rbundles.applied', {
          soul: String(applied.soul_id ?? '—'),
          mode: String(applied.mode ?? '—'),
        }),
      )
      await reload()
      onChanged()
    } catch (err) {
      toast.error(commandMessage(err))
    }
  }

  async function save() {
    if (form.id.trim() === '' || form.name.trim() === '') return
    setSaving(true)
    try {
      await engineApi.bundleCreate({
        id: form.id.trim(),
        name: form.name.trim(),
        mode: form.mode.trim() === '' ? undefined : form.mode.trim(),
        soul_id: form.soul_id.trim() === '' ? undefined : form.soul_id.trim(),
      })
      setCreating(false)
      setForm({ id: '', name: '', mode: '', soul_id: '' })
      await reload()
      onChanged()
    } catch (err) {
      toast.error(commandMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!removing) return
    try {
      await engineApi.bundleRemove(removing.id)
      setRemoving(null)
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
          {t('rbundles.title')}
        </h2>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-xl bg-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-white transition-all hover:brightness-110"
        >
          {t('rbundles.create')}
        </button>
      </div>

      {profiles.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-elevated)] p-6 text-center">
          <p className="text-sm text-[var(--text)]">{t('rbundles.empty')}</p>
          <p className="mt-1 text-xs text-[var(--text-subtle)]">{t('rbundles.emptyHint')}</p>
        </div>
      )}

      {profiles.map((profile) => (
        <Section key={profile.id} title={profile.name}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-subtle)]">
            <span className="font-mono">{profile.id}</span>
            {profile.soul_id && <span>{profile.soul_id}</span>}
            {profile.mode && <span className="uppercase">{profile.mode}</span>}
          </div>
          {profile.description !== '' && (
            <p className="text-sm text-[var(--text-muted)]">{profile.description}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void apply(profile)}
              className="rounded-lg bg-[var(--accent)] px-2.5 py-1 text-xs font-semibold text-white transition-all hover:brightness-110"
            >
              {t('rbundles.apply')}
            </button>
            <button
              type="button"
              onClick={() => setRemoving(profile)}
              className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs text-red-400 transition-colors hover:bg-[var(--bg-hover)]"
            >
              {t('rbundles.delete')}
            </button>
          </div>
        </Section>
      ))}

      <Dialog open={creating} onOpenChange={(open) => !open && setCreating(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('rbundles.create')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className={labelClass} htmlFor="profile-id">{t('rbundles.idLabel')}</label>
              <input
                id="profile-id"
                value={form.id}
                onChange={(e) => setForm({ ...form, id: e.target.value })}
                placeholder="foco"
                className={inputClass}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="profile-name">{t('rbundles.nameLabel')}</label>
              <input
                id="profile-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputClass}
                autoComplete="off"
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="profile-soul">{t('rbundles.soulLabel')}</label>
              <input
                id="profile-soul"
                value={form.soul_id}
                onChange={(e) => setForm({ ...form, soul_id: e.target.value })}
                placeholder="rinari-default"
                className={`${inputClass} font-mono`}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="profile-mode">{t('rbundles.modeLabel')}</label>
              <input
                id="profile-mode"
                value={form.mode}
                onChange={(e) => setForm({ ...form, mode: e.target.value })}
                placeholder="plan / build / review"
                className={`${inputClass} font-mono`}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-sm transition-colors hover:bg-[var(--bg-hover)]"
            >
              {t('providers.cancel')}
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="rounded-xl bg-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-40"
            >
              {t('providers.save')}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('rbundles.delete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {removing && t('rbundles.confirmDelete', { name: removing.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('providers.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void remove()}>
              {t('rbundles.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
