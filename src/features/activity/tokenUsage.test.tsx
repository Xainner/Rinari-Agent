// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { I18nProvider } from '../../i18n'
import TokenUsage from './TokenUsageIndicator'
import TurnTimelineView from './TurnTimelineView'
import { createInitialTimelineState, turnTimelineReducer, engineEventAction, type TimelineAction } from './turnTimelineReducer'
import { formatTokens } from './tokenUsage'
import type { TurnTokenUsage } from '../../types/protocol.generated'

const usage = (revision = 1, total = 12400): TurnTokenUsage => ({ input_tokens: total - 10, output_tokens: 10, total_tokens: total, model_calls: 1, source: 'estimated', phase: 'thinking', revision })
const event = (name: string, payload: Record<string, unknown> | TurnTokenUsage, session = 's1', turn = 't1'): TimelineAction => engineEventAction({ type: 'event', event: name, payload: {session_id:session,turn_id:turn,...payload}}, 1000)!
afterEach(cleanup)
describe('turn token aggregates', () => {
  it('accepts reconciliations down, rejects stale revisions and creates no activity rows', () => {
    let state = turnTimelineReducer(createInitialTimelineState(), event('usage.updated', usage()))
    state = turnTimelineReducer(state,event('usage.updated',{...usage(2,100),source:'reported'}))
    state = turnTimelineReducer(state,event('usage.updated',usage(1,900)))
    expect(state.timelines.t1.usage?.total_tokens).toBe(100)
    expect(state.timelines.t1.usage?.source).toBe('reported')
    expect(state.timelines.t1.items).toHaveLength(0)
    state = turnTimelineReducer(state,event('usage.updated',usage(1,30),'s2','t2'))
    expect(state.timelines.t1.usage?.total_tokens).toBe(100)
    expect(state.timelines.t2.usage?.total_tokens).toBe(30)
  })
  it('deduplicates legacy model ids per child agent and never overrides a native aggregate', () => {
    let state = createInitialTimelineState()
    const report = {model_call_id:'model_1',usage:{input_tokens:20,output_tokens:10}}
    state = turnTimelineReducer(state,event('model.completed',report))
    state = turnTimelineReducer(state,event('model.completed',report))
    state = turnTimelineReducer(state,event('agent.activity',{...report,child_event:'model.completed',agent_id:'a1'}))
    expect(state.timelines.t1.usage?.total_tokens).toBe(60)
    state = turnTimelineReducer(state,event('usage.updated',usage(1,90)))
    state = turnTimelineReducer(state,event('model.completed',report))
    expect(state.timelines.t1.usage?.total_tokens).toBe(90)
  })
  it.each([
    ['en', ['999', '1.0K', '12.4K', '1.0M']],
    ['es', ['999', '1,0 mil', '12,4 mil', '1,0 M']],
  ] as const)('formats compact values and exposes full accessible details (%s)', (lang, compact) => {
    [999,1000,12400,1000000].forEach((n, i) => {
      expect(formatTokens(n, lang)).toBe(compact[i])
      const view=render(<I18nProvider lang={lang}><TokenUsage usage={usage(1,n)} /></I18nProvider>)
      const visible = screen.getByTestId('token-usage')
      expect(visible.textContent).toBe(`~${compact[i]} tokens`)
      // The compact number is hidden from assistive technology; the full
      // breakdown is real text, not an aria-label on a generic span.
      expect(visible.getAttribute('aria-hidden')).toBe('true')
      const details = visible.parentElement!.querySelector('.sr-only')!
      expect(details.textContent).toContain(`${new Intl.NumberFormat(lang).format(n)} tokens`)
      expect(details.textContent).toContain(lang === 'es' ? 'Llamadas' : 'Model calls')
      expect(visible.closest('[aria-live]')).toBeNull()
      view.unmount()
    })
  })
  it('shows what the conversation occupies and keeps the turn cost in the details', () => {
    render(<I18nProvider lang="es"><TokenUsage usage={{ ...usage(1, 31000), source: 'reported', context_tokens: 10600 }} /></I18nProvider>)
    expect(screen.getByTestId('token-usage').textContent).toBe(`${formatTokens(10600, 'es')} tokens`)
    const details = screen.getByTestId('token-usage').parentElement?.getAttribute('title') ?? ''
    expect(details).toContain('Contexto al terminar: 10.600')
    expect(details).toContain('Consumo del turno: 31.000 tokens')
  })

  it('removes the approximation only for fully reported totals', () => {
    const view=render(<I18nProvider lang="en"><TokenUsage usage={{...usage(),source:'mixed'}} /></I18nProvider>)
    expect(screen.getByTestId('token-usage').textContent).toContain('~')
    view.rerender(<I18nProvider lang="en"><TokenUsage usage={{...usage(2),source:'reported'}} /></I18nProvider>)
    expect(screen.getByTestId('token-usage').textContent).not.toContain('~')
  })
})

it('merges persisted legacy calls with live calls and keeps newer snapshot revisions', () => {
  const loaded = (items: Record<string, unknown>[]): TimelineAction => ({ type:'timeline/loaded',sessionId:'s1',turns:[{
    turn_id:'t1',session_id:'s1',turn_index:1,status:'completed',started_at:'2026-09-22',completed_at:'2026-09-22',user_message:'test',final_response:'',items: items.map((item,i) => ({ session_id:'s1',turn_id:'t1',activity_seq:i,event:String(item.event),...item })),
  }] })
  let state=turnTimelineReducer(createInitialTimelineState(),event('model.completed',{model_call_id:'b',usage:{input_tokens:5,output_tokens:5}}))
  state=turnTimelineReducer(state,loaded([{event:'model.completed',session_id:'s1',turn_id:'t1',model_call_id:'a',usage:{input_tokens:10,output_tokens:10}}]))
  expect(state.timelines.t1.usage?.total_tokens).toBe(30)
  state=turnTimelineReducer(state,{type:'snapshot/restored',now:1000,snapshot:{active_turns:[{turn_id:'t1',session_id:'s1',started_at:1000,items:[{event:'usage.updated',session_id:'s1',turn_id:'t1',...usage(4,80)}]}]}})
  state=turnTimelineReducer(state,loaded([{event:'usage.updated',session_id:'s1',turn_id:'t1',...usage(2,100)}]))
  expect(state.timelines.t1.usage?.total_tokens).toBe(80)
})



it('keeps short terminal usage visible and shares the indicator during tool activity', () => {
  const base = {turnId:'t1',sessionId:'s1',startedAt:1000,completedAt:1500,userMessage:'',items:[],usage:usage(2,70)}
  const view=render(<I18nProvider lang="en"><TurnTimelineView timeline={{...base,status:'completed'}} now={1500} onResolveApproval={()=>{}} /></I18nProvider>)
  expect(screen.getByTestId('turn-meta').textContent).toContain('70 tokens')
  view.rerender(<I18nProvider lang="en"><TurnTimelineView timeline={{...base,status:'running',items:[{id:'tool:x',type:'tool',toolCallId:'x',tool:'inspect',status:'running',activitySeq:1,occurredAt:1200}]}} now={1500} onResolveApproval={()=>{}} /></I18nProvider>)
  expect(screen.getAllByTestId('token-usage')).toHaveLength(1)
  expect(screen.queryByTestId('turn-meta')).toBeNull()
})


