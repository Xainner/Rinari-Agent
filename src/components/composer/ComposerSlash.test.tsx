// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import type { SlashCommand } from '../../services/engine'
import { useComposerStore } from '../../stores/composer'
import Composer from './Composer'
import { installMockPlatform } from '../../test/mockPlatform'

const command = (partial: Partial<SlashCommand> & { name: string }): SlashCommand => ({
  kind: 'ui',
  description: `${partial.name} (engine)`,
  args: '',
  mode: null,
  template: null,
  source: 'builtin',
  ...partial,
})

const catalog = [
  command({ name: 'plan', kind: 'mode', mode: 'plan', args: '[text]' }),
  command({ name: 'review', kind: 'mode', mode: 'review', args: '[text]', template: 'Review the changes' }),
  command({ name: 'new' }),
  command({ name: 'research', kind: 'skill', args: '[text]', source: 'skill', description: 'Investiga en la web' }),
]

vi.mock('./useSlashCommands', () => ({
  SKILLS_CHANGED_EVENT: 'rinari-skills-changed',
  useSlashCommands: () => [catalog, () => undefined],
}))

installMockPlatform()

afterEach(() => {
  cleanup()
  useComposerStore.setState(useComposerStore.getInitialState())
})

function renderComposer() {
  const onSend = vi.fn(async () => true)
  const onModeChange = vi.fn()
  const onUiCommand = vi.fn(async () => true)
  render(
    <I18nProvider lang="es">
      <Composer
        placement="bottom"
        sessionId="ses_1"
        onSend={onSend}
        onUiCommand={onUiCommand}
        isStreaming={false}
        onStop={vi.fn()}
        models={[]}
        activeAlias=""
        onUseModel={vi.fn()}
        onDiscoverModels={vi.fn()}
        onOpenProviders={vi.fn()}
        sessionMode="build"
        onModeChange={onModeChange}
        reasoningEffort="off"
        onReasoningChange={vi.fn()}
        permissionProfile="workspace"
        effectivePermissionProfile="workspace"
        permissionProfilesV2
        onPermissionChange={vi.fn()}
        onSearchFiles={async () => ({ root: '/', files: [] })}
      />
    </I18nProvider>,
  )
  return { onSend, onModeChange, onUiCommand, box: screen.getByRole('textbox', { name: /mensaje/i }) }
}

describe('comandos / en el compositor', () => {
  it('lleva a la vista la opción elegida con las flechas', async () => {
    const scrolled: string[] = []
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function (this: Element) { scrolled.push(this.textContent ?? '') }
    try {
      const { box } = renderComposer()
      const user = userEvent.setup()
      await user.type(box, '/')
      await user.keyboard('{ArrowDown}{ArrowDown}')
      expect(scrolled.at(-1)).toContain('/new')
    } finally {
      Element.prototype.scrollIntoView = original
    }
  })

  it('abre el menú fuera del compositor, que recorta lo que sobresale de su caja', async () => {
    const { box } = renderComposer()
    await userEvent.setup().type(box, '/')
    const menu = screen.getByTestId('composer-suggestions')
    // En un portal, con posición fija: el contenedor con scroll ya no lo tapa.
    expect(box.closest('.composer-root')?.contains(menu)).toBe(false)
    expect(menu.style.position).toBe('fixed')
  })

  it('muestra el menú con descripciones y skills, y completa al elegir', async () => {
    const { box } = renderComposer()
    const user = userEvent.setup()
    await user.type(box, '/re')
    const list = screen.getByRole('listbox', { name: 'Comandos' })
    const options = within(list).getAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual([
      expect.stringContaining('/review'),
      expect.stringContaining('/research'),
    ])
    expect(within(list).getByText('Investiga en la web')).toBeTruthy()
    expect(within(list).getByText('skill')).toBeTruthy()
    await user.keyboard('{Enter}')
    expect((box as HTMLTextAreaElement).value).toBe('/review ')
  })

  it('envía el comando con el turno para que el Engine lo expanda', async () => {
    const { box, onSend } = renderComposer()
    const user = userEvent.setup()
    await user.type(box, '/review solo el parser{Enter}')
    expect(onSend).toHaveBeenCalledWith('/review solo el parser', [], {
      command: { name: 'review', text: 'solo el parser' },
    })
  })

  it('/plan sin texto solo cambia el modo; /new es de la interfaz', async () => {
    const { box, onSend, onModeChange, onUiCommand } = renderComposer()
    const user = userEvent.setup()
    await user.type(box, '/plan {Enter}')
    expect(onModeChange).toHaveBeenCalledWith('plan')
    await user.type(box, '/new')
    await user.keyboard('{Enter}')
    expect(onUiCommand).toHaveBeenCalledWith('new', '')
    expect(onSend).not.toHaveBeenCalled()
  })

  it('una ruta que empieza por / se envía como texto', async () => {
    const { box, onSend } = renderComposer()
    const user = userEvent.setup()
    await user.type(box, '/usr/bin/python falla{Enter}')
    expect(onSend).toHaveBeenCalledWith('/usr/bin/python falla', [])
  })
})
