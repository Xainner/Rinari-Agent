import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nProvider } from '../../src/i18n'
import TurnResult from '../../src/features/activity/TurnResult'
import TurnMeta from '../../src/features/activity/TurnMeta'
import type { ChangeSetTimelineItem } from '../../src/features/activity/types'
import './styles.css'
const empty:ChangeSetTimelineItem={id:'c',type:'changeset',changesetId:'c',turnId:'t',activitySeq:1,occurredAt:1000,status:'active',additions:0,deletions:0,undoable:false,attributionComplete:true,warnings:[],files:[]}
const file={path:'fixture.bin',absolute_path:'/fixture/fixture.bin',kind:'modified' as const,ownership:'agent' as const,confidence:'exact',binary:true,sensitive:false,diff:null,diff_truncated:false,undoable:true}
function Fixture(){
 const [state,set]=useState({i:0,mode:'normal'})
 Object.assign(window,{fixture:{show:(i:number,mode:string)=>set({i,mode})}})
 const partial=state.i===1||state.i===3
 const item={...empty,files:state.i>1?[file]:[],attributionComplete:!partial,warnings:partial?['Workspace scan exceeded the attribution budget.']:[]}
 const turn={turnId:'t',sessionId:'s',startedAt:1000,completedAt:1500,status:'completed' as const,userMessage:'',items:[item]}
 return <I18nProvider lang="es"><main style={{width:state.mode==='board'?420:900,margin:'40px auto',padding:24}}><h1>M06 · {state.mode} · {['Vacío completo','Vacío parcial','Cambio completo','Cambio parcial'][state.i]}</h1><p>Resultado de la operación de prueba.</p>
 <TurnResult timeline={turn}/><TurnMeta timeline={turn} actions={0} emphasis={state.i===1}/></main></I18nProvider>
}
createRoot(document.getElementById('root')!).render(<Fixture/>)

