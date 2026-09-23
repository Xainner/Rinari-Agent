import { createInterface } from 'node:readline'
const send = value => process.stdout.write(JSON.stringify(value) + '\n')
const capabilities = Object.fromEntries(['desktop_turn_runtime_v3','tool_contracts_v1','desktop_workspace_v1','interactive_questions_v1','web_preview_v1','plan_read_scope_v1','persistent_context_compaction_v1','recoverable_tool_results_v1','workspace_file_watch_v1'].map(x => [x,true]))
send({type:'hello',protocol:'rinari-engine',protocol_version:1,engine_version:'m03-fixture',capabilities})
let next = 0
const failures = new Set()
const records = new Map()
const session = id => { const row={id,title:id,kind:'CHAT',state:'active',mode:'build',permission_profile:'workspace',created_cwd:'.',current_cwd:'.'};records.set(id,row);return row }
const reply = (id,result) => send({id,ok:true,result})
createInterface({input:process.stdin}).on('line', line => {
  const {id,method,params:p={}} = JSON.parse(line)
  switch(method) {
    case 'session.create': reply(id,{session:session('new-' + ++next),created:true}); break
    case 'session.list': reply(id,{sessions:[...records.values()]}); break
    case 'session.open': reply(id,{session:session(p.ref),warnings:[]}); break
    case 'session.history': {
      const name = p.ref
      setTimeout(() => {
        if(name==='error' && !failures.has(name)) {
          failures.add(name)
          send({id,ok:false,error:{code:'FIXTURE_ERROR',message:'History unavailable',retryable:true}})
          return
        }
        const messages = name==='content' ? [{role:'assistant',content:'Persisted answer',seq:1,created_at:'2026-01-01T00:00:00Z'}] : []
        reply(id,{session_id:name,messages,total:messages.length,has_more:false})
      }, name==='slow-a' ? 550 : 180)
      break
    }
    case 'session.turn.start': reply(id,{turn_id:'fixture-turn',accepted:true}); break
    case 'session.image_support': reply(id,{available:false,model_id:null}); break
    case 'question.list': reply(id,{questions:[]}); break
    case 'engine.shutdown': reply(id,{}); break
    default: send({id,ok:false,error:{code:'UNKNOWN_METHOD',message:method,retryable:false}})
  }
}).on('close',() => process.exit(0))
