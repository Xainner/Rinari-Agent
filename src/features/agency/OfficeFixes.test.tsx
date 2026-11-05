// @vitest-environment jsdom
// Hallazgos de la oficina (0.4.3): sigue el final como un chat, las caras
// con su punto en la esquina, el encargo largo recortado y la carpeta del
// equipo en su ficha.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import type { AgencyAgent, AgencyTeam, Errand, OfficeMessage } from './types'

const agent = (id: string, name: string): AgencyAgent => ({
  id, rinari_profile_id: 'default', name, role: '', instructions: '', model: null, permission_profile: 'workspace',
  connectors: [], budget: {}, ask_new_destinations: null, session_id: `ses_${id}`, created_at: 1, updated_at: 1, archived_at: null,
})
const writer = agent('agent_w', 'Writer')
const image = agent('agent_i', 'Image')
const team: AgencyTeam = {
  id: 'team_1', rinari_profile_id: 'default', name: 'Estudio', purpose: '', chief_agent_id: 'agent_w',
  connectors: [], budget: {}, members: ['agent_w', 'agent_i'],
  posts: [
    { team_id: 'team_1', agent_id: 'agent_w', session_id: 'post_w', created_at: 1 },
    { team_id: 'team_1', agent_id: 'agent_i', session_id: 'post_i', created_at: 1 },
  ],
  created_at: 1, updated_at: 1, archived_at: null,
}
const message = (id: string, text: string): OfficeMessage => ({
  id, team_id: 'team_1', author_kind: 'agent', agent_id: 'agent_w', text, mentions: [], errand_id: null,
  chain_id: 'c1', hop: 0, created_at: 1700000000,
} as unknown as OfficeMessage)

let officeMessages: OfficeMessage[] = []
let resolveTeam: (() => void) | null = null
const api = {
  agencyTeam: vi.fn(() => new Promise((done) => { resolveTeam = () => done({ team, errands: [], messages: officeMessages }) })),
  agencyOfficePost: vi.fn(async () => ({})),
  agencyTeamOverview: vi.fn(async () => null),
  mcpList: vi.fn(async () => ({ servers: [] })),
  mcpCatalogList: vi.fn(async () => ({ entries: [] })),
  projectList: vi.fn(async () => ({ projects: [
    { id: 'prj_1', root: 'C:/work/estudio', canonical_root: 'c:/work/estudio', name: 'Estudio web', description: '', pinned: false, archived: false, git_fingerprint: null, created_at: '', updated_at: '', last_opened_at: '' },
  ] })),
}
vi.mock('../../services/engine', () => ({
  engineApi: new Proxy({}, { get: (_target, key: string) => (api as Record<string, unknown>)[key] ?? vi.fn(async () => ({})) }),
  onEngineEvent: vi.fn(async () => () => {}),
  commandMessage: String,
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

import { AgencyDataContext } from './AgencyData'
import { ErrandCard } from './Board'
import { TeamPanel } from './OfficePanels'
import OfficeView from './OfficeView'

class ResizeObserverStub {
  static instances: ResizeObserverStub[] = []
  targets: Element[] = []
  constructor(readonly callback: ResizeObserverCallback) { ResizeObserverStub.instances.push(this) }
  observe(target: Element) { this.targets.push(target) }
  unobserve() {}
  disconnect() { this.targets = [] }
  static resize(target: Element) {
    for (const observer of this.instances) if (observer.targets.includes(target)) observer.callback([{ target } as ResizeObserverEntry], observer as unknown as ResizeObserver)
  }
}

const wrap = (node: React.ReactNode, teams: AgencyTeam[] = [team]) => render(
  <I18nProvider lang="es">
    <AgencyDataContext.Provider value={{ agents: [writer, image], teams, reload: () => {} }}>{node}</AgencyDataContext.Provider>
  </I18nProvider>,
)
const frame = () => new Promise((done) => requestAnimationFrame(() => done(null)))
/** Un alto de contenido y una posición de scroll simulados. */
function layout(el: HTMLElement, { height, top }: { height: number; top?: number }) {
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: 300 })
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: height })
  if (top !== undefined) Object.defineProperty(el, 'scrollTop', { configurable: true, writable: true, value: top })
}

beforeEach(() => {
  ;(window as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub
  ResizeObserverStub.instances = []
})
afterEach(() => {
  cleanup()
  officeMessages = []
  resolveTeam = null
  for (const fn of Object.values(api)) fn.mockClear()
})

it('the office opens at the latest message when the load arrives late, and follows what grows after paint', async () => {
  officeMessages = [message('m1', 'Hola'), message('m2', 'Listo el guion')]
  wrap(<OfficeView team={team} agents={[writer, image]} />)
  const log = screen.getByTestId('agency-office-log')
  layout(log, { height: 300, top: 0 })
  // La carga asíncrona llega después del montaje: el número de mensajes ya no es la señal.
  await act(async () => { resolveTeam?.(); await frame() })
  layout(log, { height: 1_200 })
  await act(async () => { ResizeObserverStub.resize(log.firstElementChild!); await frame() })
  expect(log.scrollTop).toBe(1_200)
  // Una imagen o el Markdown se pintan después: crece sin mensaje nuevo, y se sigue.
  layout(log, { height: 1_800 })
  await act(async () => { ResizeObserverStub.resize(log.firstElementChild!); await frame() })
  expect(log.scrollTop).toBe(1_800)
  expect(screen.queryByRole('button', { name: /final|bottom/i })).toBeNull()
})

it('does not drag the owner down after he scrolled up, offers «go to bottom», and own send jumps there', async () => {
  officeMessages = [message('m1', 'Hola')]
  wrap(<OfficeView team={team} agents={[writer, image]} />)
  const log = screen.getByTestId('agency-office-log')
  await act(async () => { resolveTeam?.(); await frame() })
  layout(log, { height: 1_200, top: 1_200 })
  // Sube a leer con la rueda.
  layout(log, { height: 1_200, top: 200 })
  fireEvent.wheel(log)
  fireEvent.scroll(log)
  layout(log, { height: 1_800 })
  await act(async () => { ResizeObserverStub.resize(log.firstElementChild!); await frame() })
  expect(log.scrollTop).toBe(200)
  const bottom = screen.getByRole('button', { name: /final|bottom/i })
  await act(async () => { fireEvent.click(bottom); await frame() })
  expect(log.scrollTop).toBe(1_800)

  // Sube otra vez y escribe: su propio mensaje lo lleva al final.
  layout(log, { height: 1_800, top: 100 })
  fireEvent.wheel(log)
  fireEvent.scroll(log)
  const input = screen.getByRole('textbox')
  fireEvent.change(input, { target: { value: 'Gracias' } })
  await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }); await frame() })
  expect(api.agencyOfficePost).toHaveBeenCalled()
  expect(log.scrollTop).toBe(1_800)
})

it('each face is exactly its avatar and its dot paints above the next face', async () => {
  // Vitest vacía los .css que importa: la hoja se lee del disco.
  const fs = await import(/* @vite-ignore */ 'node:' + 'fs')
  const css: string = fs.readFileSync('src/styles/index.css', 'utf8')
  const rule = (selector: string) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`).exec(css)?.[1] ?? ''
  }
  expect(rule('.agency-office-face')).toMatch(/display: flex/)
  expect(rule('.agency-office-face')).toMatch(/line-height: 0/)
  expect(rule('.agency-face-dot')).toMatch(/z-index: 1/)
  // El `li` no crea su propio contexto de apilamiento: el punto compite con las caras vecinas.
  expect(rule('.agency-office-face')).not.toMatch(/z-index/)
})

it.each([1, 3, 5])('the office head shows %i faces with the state dot only on those working or waiting', (count) => {
  const agents = Array.from({ length: count }, (_, index) => agent(`agent_${index}`, `Agente ${index}`))
  const crew: AgencyTeam = { ...team, members: agents.map((item) => item.id), posts: [] }
  wrap(<OfficeView team={crew} agents={agents} />, [crew])
  const faces = screen.getAllByTestId('agency-office-face')
  expect(faces).toHaveLength(count)
  for (const face of faces) expect(face.firstElementChild?.classList.contains('agent-avatar')).toBe(true)
})

const errand = (body: string): Errand => ({
  id: 'err_1', team_id: 'team_1', title: 'Guion', body, done_when: [], status: 'pending',
  from_agent_id: null, to_agent_id: 'agent_w', created_at: 1, updated_at: 1,
} as unknown as Errand)

it('clamps a long errand body with «Ver más» / «Ver menos», only when it does not fit', async () => {
  const long = 'Línea\n'.repeat(12)
  const height = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('agency-errand-body') && this.classList.contains('is-clamped') ? 240 : 0
  })
  const client = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('agency-errand-body') ? 80 : 0
  })
  wrap(<ErrandCard errand={errand(long)} names={new Map([['agent_w', 'Writer']])} />)
  const body = screen.getByTestId('agency-errand-body')
  expect(body.classList.contains('is-clamped')).toBe(true)
  const more = screen.getByTestId('agency-errand-more')
  expect(more.textContent).toBe('Ver más')
  fireEvent.click(more)
  expect(body.classList.contains('is-clamped')).toBe(false)
  expect(more.getAttribute('aria-expanded')).toBe('true')
  expect(screen.getByTestId('agency-errand-more').textContent).toBe('Ver menos')
  fireEvent.click(screen.getByTestId('agency-errand-more'))
  expect(body.classList.contains('is-clamped')).toBe(true)
  height.mockRestore()
  client.mockRestore()

  // Uno corto cabe entero: sin botón.
  cleanup()
  wrap(<ErrandCard errand={errand('Corto')} names={new Map([['agent_w', 'Writer']])} />)
  expect(screen.queryByTestId('agency-errand-more')).toBeNull()
})

it('the team card says where the team works, with the full path on hover', async () => {
  wrap(<TeamPanel teamId="team_1" />, [{ ...team, project_id: 'prj_1' }])
  const folder = await screen.findByText('Estudio web')
  expect(folder.closest('[title]')?.getAttribute('title')).toBe('C:/work/estudio')
  expect(screen.getByTestId('agency-team-folder').textContent).toContain('Carpeta de trabajo')
})

it('the team card says each post works in its own folder when the team has none', () => {
  wrap(<TeamPanel teamId="team_1" />)
  expect(screen.getByTestId('agency-team-folder').textContent).toContain('cada puesto en una carpeta propia')
  expect(api.projectList).not.toHaveBeenCalled()
})
