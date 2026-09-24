import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { commandMessage, engineApi, type SkillEntry } from '../../services/engine'
import { useI18n } from '../../i18n'
import { Switch } from '../../components/ui/switch'
import { cn } from '../../lib/utils'
import { SKILL_FILTERS, attentionReason, countByOrigin, filterSkills, type SkillFilter } from './skillsModel'
import SkillDetailDialog from './SkillDetailDialog'
import InstallSkillDialog from './InstallSkillDialog'
import { SKILLS_CHANGED_EVENT } from '../../components/composer/useSlashCommands'

/**
 * Ajustes > Skills: la biblioteca. Rinari (vienen con la app), Instaladas
 * (carpeta, zip, GitHub, URL o importadas de Claude/Codex), Aprendidas y de
 * Proyecto. El Engine es la fuente: aquí solo se lee, filtra y pide.
 */
export default function SkillsView() {
  const { t } = useI18n()
  const [skills, setSkills] = useState<SkillEntry[]>([])
  const [loaded, setLoaded] = useState(false)
  const [filter, setFilter] = useState<SkillFilter>('all')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [installing, setInstalling] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const result = await engineApi.skillList()
      setSkills(result.skills)
      // Las skills también son comandos `/`: el compositor vuelve a pedir el catálogo.
      window.dispatchEvent(new Event(SKILLS_CHANGED_EVENT))
    } catch (err) {
      toast.error(commandMessage(err))
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const counts = useMemo(() => countByOrigin(skills), [skills])
  const visible = useMemo(() => filterSkills(skills, filter, query), [skills, filter, query])

  async function toggle(entry: SkillEntry) {
    setToggling(entry.name)
    try {
      await engineApi.skillSetEnabled(entry.name, !entry.enabled)
      await reload()
    } catch (err) {
      toast.error(commandMessage(err))
    } finally {
      setToggling(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold text-[var(--text)]">{t('skills.title')}</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{t('skills.desc')}</p>
        </div>
        <button
          type="button"
          onClick={() => setInstalling(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-white transition-all hover:brightness-110"
        >
          <Plus size={14} aria-hidden="true" /> {t('skills.install')}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label={t('skills.filter')} className="flex flex-wrap gap-1">
          {SKILL_FILTERS.map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={filter === option}
              onClick={() => setFilter(option)}
              className={cn(
                'rounded-lg border px-2.5 py-1 text-xs transition-colors',
                filter === option
                  ? 'border-[var(--accent)] bg-[var(--bg-active)] font-semibold text-[var(--text)]'
                  : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]',
              )}
            >
              {t(`skills.filter.${option}`)} · {counts[option]}
            </button>
          ))}
        </div>
        <label className="ml-auto flex min-w-[12rem] items-center gap-2 rounded-xl border border-[var(--border)] px-2.5 py-1.5">
          <Search size={13} aria-hidden="true" className="text-[var(--text-subtle)]" />
          <input
            aria-label={t('skills.search')}
            placeholder={t('skills.search')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-0 flex-1 border-0 bg-transparent text-xs text-[var(--text)] outline-none"
          />
        </label>
      </div>

      <ul className="divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)]">
        {visible.map((entry) => {
          const reason = attentionReason(entry)
          return (
            <li key={entry.name} className="flex items-center gap-3 px-4 py-3">
              <button
                type="button"
                onClick={() => setSelected(entry.name)}
                className="min-w-0 flex-1 text-left"
                aria-label={t('skills.open', { name: entry.name })}
              >
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className={cn('text-sm font-medium', entry.enabled ? 'text-[var(--text)]' : 'text-[var(--text-subtle)]')}>
                    {entry.name}
                  </span>
                  <span className="rounded-md border border-[var(--border)] px-1.5 text-[10px] text-[var(--text-subtle)]">
                    {t(`skills.origin.${entry.origin}`)}
                  </span>
                  {entry.format === 'standard' && (
                    <span className="rounded-md border border-[var(--border)] px-1.5 text-[10px] text-[var(--text-subtle)]">
                      {t('skills.format.standard')}
                    </span>
                  )}
                  {entry.status === 'pending' && (
                    <span className="rounded-md border border-amber-500/40 px-1.5 text-[10px] text-amber-400">
                      {t('skills.pending')}
                    </span>
                  )}
                  {reason && (
                    <span role="img" aria-label={t(`skills.attention.${reason}`)} title={t(`skills.attention.${reason}`)}>
                      <AlertTriangle size={12} aria-hidden="true" className="text-amber-400" />
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block truncate text-xs text-[var(--text-subtle)]">
                  {entry.valid ? entry.description : entry.error?.message}
                </span>
              </button>
              <Switch
                checked={entry.enabled}
                disabled={toggling === entry.name || entry.status === 'pending'}
                onCheckedChange={() => void toggle(entry)}
                aria-label={t(entry.enabled ? 'skills.disable' : 'skills.enable', { name: entry.name })}
              />
            </li>
          )
        })}
        {loaded && visible.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-[var(--text-subtle)]">
            {skills.length === 0 ? t('skills.empty') : t('skills.noMatch')}
          </li>
        )}
      </ul>

      <SkillDetailDialog name={selected} onClose={() => setSelected(null)} onChanged={() => void reload()} />
      <InstallSkillDialog
        open={installing}
        onClose={() => setInstalling(false)}
        onInstalled={() => void reload()}
      />
    </div>
  )
}
