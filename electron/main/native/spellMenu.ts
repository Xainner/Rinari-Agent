/**
 * Menú contextual de un campo editable, con el corrector (#72).
 *
 * Las sugerencias de ortografía solo llegan a main (`context-menu` de
 * `webContents`, con `misspelledWord` y `dictionarySuggestions`), y ese evento
 * no se dispara si el renderer cancela el `contextmenu` del DOM. Por eso, en
 * un campo editable el renderer deja pasar el clic derecho y el menú entero se
 * arma aquí: arriba hasta 5 sugerencias y «Agregar al diccionario», y debajo
 * lo de siempre (deshacer, rehacer, cortar, copiar, pegar, seleccionar todo).
 */

import type { BrowserWindow, ContextMenuParams, MenuItemConstructorOptions, Session } from 'electron'

import type { HostText } from './hostText'

/** Español e inglés; solo los que el corrector del sistema tenga. */
export const SPELL_LANGUAGES = ['es', 'es-ES', 'es-419', 'en-US'] as const

export const MAX_SUGGESTIONS = 5

type SpellParams = Pick<ContextMenuParams, 'isEditable' | 'misspelledWord' | 'dictionarySuggestions' | 'editFlags'>

export interface SpellActions {
  replace(word: string): void
  addToDictionary(word: string): void
}

export function editableMenuTemplate(params: SpellParams, text: HostText, actions: SpellActions): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = []
  const word = params.misspelledWord?.trim()
  if (word) {
    const suggestions = params.dictionarySuggestions.slice(0, MAX_SUGGESTIONS)
    for (const suggestion of suggestions) items.push({ label: suggestion, click: () => actions.replace(suggestion) })
    if (!suggestions.length) items.push({ label: text.spellNoSuggestions, enabled: false })
    items.push({ label: text.spellAddToDictionary, click: () => actions.addToDictionary(word) }, { type: 'separator' })
  }
  const flags = params.editFlags
  items.push(
    { role: 'undo', label: text.menuUndo, enabled: flags.canUndo },
    { role: 'redo', label: text.menuRedo, enabled: flags.canRedo },
    { type: 'separator' },
    { role: 'cut', label: text.menuCut, enabled: flags.canCut },
    { role: 'copy', label: text.menuCopy, enabled: flags.canCopy },
    { role: 'paste', label: text.menuPaste, enabled: flags.canPaste },
    { role: 'selectAll', label: text.menuSelectAll, enabled: flags.canSelectAll },
  )
  return items
}

/** Fija los idiomas del corrector a los que hablan la app y el dueño. */
export function setSpellLanguages(session: Session): void {
  try {
    const available = new Set(session.availableSpellCheckerLanguages)
    // En Windows el corrector es el del sistema y la lista puede venir vacía:
    // entonces se queda con el idioma de Windows, como antes.
    const wanted = SPELL_LANGUAGES.filter((language) => available.has(language))
    const spanish = wanted.find((language) => language.startsWith('es'))
    const languages = [spanish, wanted.includes('en-US') ? 'en-US' : undefined].filter((value): value is string => Boolean(value))
    if (languages.length) session.setSpellCheckerLanguages(languages)
  } catch {
    // Un corrector sin esos idiomas no impide abrir la ventana.
  }
}

/** Atiende el clic derecho de los campos editables de la ventana principal. */
export function installSpellMenu(window: BrowserWindow, text: () => HostText, popup: (template: MenuItemConstructorOptions[]) => void): void {
  const contents = window.webContents
  setSpellLanguages(contents.session)
  contents.on('context-menu', (_event, params) => {
    if (!params.isEditable) return
    popup(editableMenuTemplate(params, text(), {
      replace: (word) => contents.replaceMisspelling(word),
      addToDictionary: (word) => contents.session.addWordToSpellCheckerDictionary(word),
    }))
  })
}
