// El menú de un campo editable con el corrector (#72): arriba las sugerencias
// y «Agregar al diccionario», debajo la edición de siempre.
import { describe, expect, it, vi } from 'vitest'

import { hostText } from './hostText'
import { editableMenuTemplate, setSpellLanguages } from './spellMenu'

const flags = { canUndo: true, canRedo: false, canCut: true, canCopy: true, canPaste: true, canSelectAll: true, canDelete: true, canEditRichly: false }
const params = (word: string, suggestions: string[]) => ({ isEditable: true, misspelledWord: word, dictionarySuggestions: suggestions, editFlags: flags })

describe('menú del corrector', () => {
  it('pone hasta 5 sugerencias arriba; elegir una la reemplaza y la palabra se puede agregar', () => {
    const actions = { replace: vi.fn(), addToDictionary: vi.fn() }
    const template = editableMenuTemplate(params('aora', ['ahora', 'aorta', 'hora', 'aura', 'ora', 'ara']), hostText('es'), actions)
    expect(template.slice(0, 6).map((item) => item.label)).toEqual(['ahora', 'aorta', 'hora', 'aura', 'ora', 'Agregar al diccionario'])
    ;(template[0].click as () => void)()
    expect(actions.replace).toHaveBeenCalledWith('ahora')
    ;(template[5].click as () => void)()
    expect(actions.addToDictionary).toHaveBeenCalledWith('aora')
    expect(template[6].type).toBe('separator')
    expect(template.slice(7).map((item) => item.role)).toEqual(['undo', 'redo', undefined, 'cut', 'copy', 'paste', 'selectAll'])
  })

  it('sin sugerencias lo dice, y una palabra bien escrita deja solo la edición', () => {
    const actions = { replace: vi.fn(), addToDictionary: vi.fn() }
    const none = editableMenuTemplate(params('Rinari', []), hostText('en'), actions)
    expect(none[0]).toMatchObject({ label: 'No suggestions', enabled: false })
    expect(none[1].label).toBe('Add to dictionary')
    const plain = editableMenuTemplate(params('', []), hostText('es'), actions)
    expect(plain[0]).toMatchObject({ role: 'undo', label: 'Deshacer', enabled: true })
    expect(plain[1]).toMatchObject({ role: 'redo', enabled: false })
  })

  it('fija español e inglés solo si el corrector los tiene', () => {
    const session = { availableSpellCheckerLanguages: ['en-US', 'es-419', 'fr'], setSpellCheckerLanguages: vi.fn() }
    setSpellLanguages(session as never)
    expect(session.setSpellCheckerLanguages).toHaveBeenCalledWith(['es-419', 'en-US'])
    const empty = { availableSpellCheckerLanguages: [], setSpellCheckerLanguages: vi.fn() }
    setSpellLanguages(empty as never)
    expect(empty.setSpellCheckerLanguages).not.toHaveBeenCalled()
  })
})
