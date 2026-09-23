import { useReducer } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nProvider } from '../../src/i18n'
import TurnTimelineView from '../../src/features/activity/TurnTimelineView'
import { createInitialTimelineState,turnTimelineReducer,engineEventAction } from '../../src/features/activity/turnTimelineReducer'
import './styles.css'
import trace from './usage-trace.json'
function Fixture(){
 const [state,dispatch]=useReducer(turnTimelineReducer,undefined,createInitialTimelineState)
 const event=(name:string,payload:Record<string,unknown>)=>dispatch(engineEventAction({type:'event',event:name,payload:{session_id:'s',turn_id:'t',...payload}},Date.now())!)
 Object.assign(window,{fixture:{
 traceLength:trace.length,
 start(){event('turn.started',{message:'Plan with a question and resume — real Engine trace',occurred_at:Date.now()-8000})},
 step(index:number){
  const data=trace[index];event('usage.updated',data)
  if(data.source==='mixed')event('tool.completed',{tool_call_id:'ask-1',tool:'user.ask',activity_seq:3,result:'Question answered'})
  if(data.phase==='settled'){
   event('model.content.completed',{model_call_id:'m2',activity_seq:4,content:'Plan based on your answer. Final usage from the real AgentLoop with a deterministic provider.',output_kind:'final'})
   event('turn.completed',{occurred_at:Date.now()})
  }
 },
 usage:()=>state.timelines.t?.usage
 }})
 return <I18nProvider lang="en"><main style={{maxWidth:920,margin:'40px auto',padding:24}}><h1>M04 · Turn usage — deterministic fixture</h1>{state.timelines.t&&<TurnTimelineView timeline={state.timelines.t} now={Date.now()} onResolveApproval={()=>{}}/>}</main></I18nProvider>
}
createRoot(document.getElementById('root')!).render(<Fixture/>)


