import { createRoot } from 'react-dom/client'
import { I18nProvider } from '../../src/i18n'
import { QuestionCard } from '../../src/features/questions/Questions'
import { createTestBridge } from '../../src/platform/testBridge'
import { setPlatformForTests } from '../../src/platform'
import './styles.css'
const bridge=createTestBridge();setPlatformForTests(bridge)
bridge.mockCommand('question_resolve',()=>({}))
Object.assign(window,{fixture:{calls:()=>bridge.calls.length,answers:()=>bridge.calls[0]?.args.answers}})
createRoot(document.getElementById('root')!).render(<I18nProvider lang="es"><main style={{maxWidth:720,margin:'60px auto',padding:24}}>
<h1>M05 · Preguntas secuenciales</h1><QuestionCard request={{request_id:'q',session_id:'s',turn_id:'t',status:'pending',questions:[
{id:'action',title:'¿Qué hacemos?',options:[{label:'Inspeccionar'}]},
{id:'scope',title:'¿Qué alcance?',options:[{label:'Todo'}]},
{id:'confirm',title:'¿Confirmamos?',options:[{label:'Sí'}]},
]}} onResolved={()=>{}}/></main></I18nProvider>)

