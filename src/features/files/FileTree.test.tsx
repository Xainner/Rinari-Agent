// @vitest-environment jsdom
// El árbol de la vista Archivos (#98): carpetas primero y cada una cargada al
// desplegarla, el estado git en letra y color, lo desplegado recordado por
// conversación, un buscador de archivos y «Plegar todo».
import { installMockPlatform } from '../../test/mockPlatform'
const host = installMockPlatform()
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import FileTree, { resetFileTreeCacheForTests } from './FileTree'

const open = vi.fn()
vi.mock('./FileWorkspace', () => ({ useFileWorkspace: () => ({ open, selected: undefined }) }))

const ROOT = 'C:/repo'
const entry = (relative: string, kind: 'dir' | 'file', git?: string) => ({
  name: relative.split('/').pop(), relative_path: relative, path: `${ROOT}/${relative}`, kind, ...(git ? { git } : {}),
})
const LISTINGS: Record<string, unknown[]> = {
  '': [entry('src', 'dir', 'M'), entry('lib', 'dir'), entry('README.md', 'file')],
  src: [entry('src/app.ts', 'file', 'M'), entry('src/new.ts', 'file', 'U')],
  lib: [entry('lib/core', 'dir')],
  'lib/core': [entry('lib/core/index.ts', 'file')],
}

beforeEach(() => {
  window.localStorage.clear()
  resetFileTreeCacheForTests()
  host.invoke.mockImplementation(async (name: string, args: Record<string, unknown> = {}) => {
    if (name === 'workspace_dir_list') return { root: ROOT, path: args.path ?? '', entries: LISTINGS[String(args.path ?? '')] ?? [], truncated: false, git: true }
    if (name === 'workspace_file_search') return { root: ROOT, files: [{ path: `${ROOT}/src/app.ts`, relative_path: 'src/app.ts', name: 'app.ts' }] }
    return {}
  })
})
afterEach(() => { cleanup(); vi.clearAllMocks(); host.bridge.calls.length = 0 })

const view = () => render(<I18nProvider lang="es"><FileTree sessionId="ses_a" /></I18nProvider>)
const listed = (path: string) => host.bridge.calls.filter((call) => call.name === 'workspace_dir_list' && (call.args.path ?? '') === path).length

it('lists the root with folders first and loads a folder only when opened', async () => {
  view()
  const items = await screen.findAllByRole('treeitem')
  expect(items.map((item) => item.textContent)).toEqual(['srcM', 'lib', 'README.md'])
  expect(items[0].dataset.git).toBe('M')
  expect(listed('src')).toBe(0)
  await userEvent.click(items[0])
  expect(await screen.findByText('new.ts')).toBeTruthy()
  expect(listed('src')).toBe(1)
  await userEvent.click(screen.getByText('app.ts'))
  expect(open).toHaveBeenCalledWith(`${ROOT}/src/app.ts`)
})

it('remembers open folders per conversation, and «Plegar todo» closes them', async () => {
  view()
  await userEvent.click((await screen.findAllByRole('treeitem'))[0])
  await screen.findByText('app.ts')
  cleanup()
  view()
  expect(await screen.findByText('app.ts')).toBeTruthy()
  await userEvent.click(screen.getByRole('button', { name: 'Plegar todo' }))
  await waitFor(() => expect(screen.queryByText('app.ts')).toBeNull())
})

it('one search finds files anywhere', async () => {
  view()
  await screen.findAllByRole('treeitem')
  await userEvent.type(screen.getByRole('searchbox'), 'app')
  const results = await screen.findByTestId('file-tree-results')
  expect(results.textContent).toContain('app.ts')
  expect(results.textContent).toContain('src')
})

it('a folder that only holds another opens with it, as one row «lib/core»', async () => {
  view()
  await userEvent.click((await screen.findAllByRole('treeitem'))[1])
  expect(await screen.findByText('lib/core')).toBeTruthy()
  expect(await screen.findByText('index.ts')).toBeTruthy()
})

it('a file dragged from the tree carries what the composer needs for «@archivo»', async () => {
  view()
  const readme = (await screen.findAllByRole('treeitem')).find((item) => item.textContent === 'README.md')!
  expect(readme.getAttribute('draggable')).toBe('true')
  const data = new Map<string, string>()
  const { fireEvent } = await import('@testing-library/react')
  fireEvent.dragStart(readme, { dataTransfer: { setData: (type: string, value: string) => data.set(type, value), effectAllowed: '' } })
  expect(JSON.parse(data.get('application/x-rinari-file')!)).toMatchObject({ sessionId: 'ses_a', relative_path: 'README.md' })
})

it('mounted again (it moves within the Files view) it shows the last listing at once without asking again', async () => {
  const first = view()
  expect(await screen.findByText('README.md')).toBeTruthy()
  first.unmount()
  view()
  expect(screen.getByText('README.md')).toBeTruthy()
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(listed('')).toBe(1)
})
