import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import type { Language } from '../types'
import { es, type I18nKey } from './es'
import { en } from './en'

export type { I18nKey } from './es'

const dicts: Record<Language, Record<I18nKey, string>> = { es, en }

export function translate(
  lang: Language,
  key: I18nKey,
  vars?: Record<string, string | number>,
): string {
  let s = dicts[lang][key] ?? dicts.es[key] ?? key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replaceAll(`{${k}}`, String(v))
    }
  }
  return s
}

interface I18n {
  lang: Language
  t: (key: I18nKey, vars?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18n>({ lang: 'es', t: (k, vars) => translate('es', k, vars) })

export function I18nProvider({ lang, children }: { lang: Language; children: ReactNode }) {
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const value = useMemo<I18n>(
    () => ({ lang, t: (key, vars) => translate(lang, key, vars) }),
    [lang],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18n {
  return useContext(I18nContext)
}
