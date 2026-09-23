// Real Chromium evidence, isolated from user state. Usage: node scripts/improvement-evidence.mjs 04
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'
import { rolldown } from 'rolldown'
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve,join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root=resolve(fileURLToPath(new URL('..',import.meta.url)))
const improvement=process.argv[2]
if(!/^0[4-7]$/.test(improvement??'')) throw Error('Choose 04, 05, 06 or 07')
const profile=mkdtempSync(join(tmpdir(),'rinari-evidence-'))
await build({configFile:false,root:join(root,'tests','m'+improvement),publicDir:join(root,'public'),
 plugins:[react(),tailwind()],build:{outDir:join(root,'evidence-dist'),emptyOutDir:true}})
const bundle=await rolldown({input:join(root,'tests/improvement/main.ts'),platform:'node',external:['electron',/^node:/]})
await bundle.write({file:join(root,'evidence-dist/probe.cjs'),format:'cjs',codeSplitting:false})
await bundle.close()
const child=spawn((await import('electron')).default,[join(root,'evidence-dist/probe.cjs'),...(process.env.EVIDENCE_SCALE?['--force-device-scale-factor='+process.env.EVIDENCE_SCALE]:[])],{cwd:root,stdio:'inherit',env:{...process.env,EVIDENCE_ROOT:root,EVIDENCE_CASE:improvement,EVIDENCE_PROFILE:profile}})
process.exitCode=await new Promise(resolve=>{child.on('exit',code=>resolve(code??1));child.on('error',error=>{console.error(error);resolve(1)})})
console.log('Isolated profile: '+profile)

