// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '../../i18n'
import { ChangeSetRow } from './ChangeSetRow'
import TurnResult from './TurnResult'
import TurnMeta from './TurnMeta'
import { changeSetPresentation, presentedChangeSets } from './changeSetPresentation'
import type { ChangeSetTimelineItem, TurnTimeline } from './types'
import { createInitialTimelineState, engineEventAction, turnTimelineReducer } from './turnTimelineReducer'

afterEach(cleanup)
const empty: ChangeSetTimelineItem = {id:'c',type:'changeset',changesetId:'c',turnId:'t',activitySeq:1,occurredAt:1000,status:'active',additions:0,deletions:0,undoable:false,attributionComplete:true,warnings:[],files:[]}
const timeline=(items: ChangeSetTimelineItem[]): TurnTimeline=>({turnId:'t',sessionId:'s',startedAt:1000,completedAt:1500,status:'completed',userMessage:'',items})
const file={path:'a.bin',absolute_path:'/fixture/a.bin',kind:'modified' as const,ownership:'agent' as const,confidence:'exact',binary:true,sensitive:false,diff:null,diff_truncated:false,undoable:true}
const wrap=(node: React.ReactNode,lang:'es'|'en'='es')=><I18nProvider lang={lang}>{node}</I18nProvider>

it('classifies by observed files, including binary and rename with zero textual diff',()=>{
  expect(changeSetPresentation(empty)).toBe('hidden')
  expect(changeSetPresentation({...empty,attributionComplete:false})).toBe('hidden')
  expect(changeSetPresentation({...empty,warnings:['unknown']})).toBe('hidden')
  expect(changeSetPresentation({...empty,files:[file]})).toBe('changes')
  expect(changeSetPresentation({...empty,files:[{...file,kind:'renamed'}],attributionComplete:false})).toBe('changes')
})

it('hides fully observed empty sets without forcing metadata or review actions',()=>{
  const review=vi.fn()
  const view=render(wrap(<><ChangeSetRow item={empty} turnActive={false}/><TurnResult timeline={timeline([empty])}/><TurnMeta timeline={timeline([empty])} actions={0} emphasis={false} onReviewChanges={review}/></>))
  expect(view.container.textContent).toBe('')
  expect(screen.queryByRole('button')).toBeNull()
  expect(review).not.toHaveBeenCalled()
})

it.each(['es','en'] as const)('says nothing when no file changed, even with partial coverage (%s)',lang=>{
  const partial={...empty,attributionComplete:false,warnings:['C:/private/secret.env=secret','Workspace scan exceeded the attribution budget.']}
  const review=vi.fn()
  const value=timeline([partial,{...partial,id:'c2'}])
  const view=render(wrap(<><ChangeSetRow item={partial} turnActive={false}/><TurnResult timeline={value}/><TurnMeta timeline={value} actions={3} emphasis onReviewChanges={review}/></>,lang))
  expect(view.container.textContent).not.toMatch(/cobertura|coverage|0 archivo|0 file|\+0|-0|secret|C:\//i)
  expect(screen.queryByRole('button',{name:/Revisar cambios|Review changes/})).toBeNull()
})

it('keeps real changes actionable and uses the latest nonempty set for metadata',async()=>{
  const real={...empty,files:[file],attributionComplete:false}
  const review=vi.fn()
  const value=timeline([real,{...empty,id:'empty-newer',activitySeq:2}])
  expect(presentedChangeSets(value).latest).toBe(real)
  render(wrap(<><ChangeSetRow item={real} turnActive={false}/><TurnMeta timeline={value} actions={0} emphasis={false} onReviewChanges={review}/></>))
  expect(screen.getByText(/Se observaron estos cambios/)).toBeTruthy()
  expect(screen.getByText('1 archivo(s) de este turno')).toBeTruthy()
  await userEvent.setup().click(screen.getByRole('button',{name:'Revisar cambios'}))
  expect(review).toHaveBeenCalledOnce()
})


it('keeps the audit item and renders history and live events identically',()=>{
  const row={event:'turn.changes.completed',turn_id:'t',session_id:'s',id:'c',activity_seq:1,files:[],warnings:[],attribution_complete:false,additions:0,deletions:0,undoable:false}
  const live=turnTimelineReducer(createInitialTimelineState(),engineEventAction({type:'event',event:row.event,payload:row},1000)!)
  const history=turnTimelineReducer(createInitialTimelineState(),{type:'timeline/loaded',sessionId:'s',turns:[{turn_id:'t',session_id:'s',turn_index:1,status:'completed',started_at:'2026-09-22',completed_at:'2026-09-22',user_message:'test',final_response:'',items:[row]}]})
  expect(live.timelines.t.items).toHaveLength(1)
  const view=render(wrap(<TurnResult timeline={live.timelines.t}/>))
  const before=view.container.textContent
  act(()=>view.rerender(wrap(<TurnResult timeline={history.timelines.t}/>)))
  expect(view.container.textContent).toBe(before)
})


