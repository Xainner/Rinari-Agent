// Isolated Electron integration test. Never loads the user's profile or provider.
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
const profile=mkdtempSync(join(tmpdir(),'rinari-m03-profile-'))
const output=join(root,'m03-evidence',process.env.M03_CASE ?? 'default')
await build({configFile:false,root:join(root,'tests/m03'),publicDir:join(root,'public'),
  plugins:[react(),tailwind()],build:{outDir:join(root,'m03-dist'),emptyOutDir:true}})
const bundle=await rolldown({input:join(root,'tests/m03/main.ts'),platform:'node',external:['electron',/^node:/]})
await bundle.write({file:join(root,'m03-dist/probe.cjs'),format:'cjs',codeSplitting:false})
await bundle.close()
const electron=(await import('electron')).default
const args=[join(root,'m03-dist/probe.cjs')]
if (process.env.M03_SCALE) args.push(`--force-device-scale-factor=${process.env.M03_SCALE}`)
const child=spawn(electron,args,{cwd:root,stdio:'inherit',env:{
  ...process.env,M03_ROOT:root,M03_OUTPUT:output,M03_PROFILE:profile,
  RINARI_ENGINE_BIN:process.env.M03_PYTHON ?? process.execPath,
  RINARI_ENGINE_ARGS_JSON:JSON.stringify([join(root,process.env.M03_FILES==='1'?'tests/m03/fileEngine.py':'tests/m03/fakeEngine.mjs')]),
  RINARI_ENGINE_CWD:root,
}})
process.exitCode=await new Promise(resolve=>{child.on('exit',code=>resolve(code??1));child.on('error',error=>{console.error(error);resolve(1)})})
console.log('Isolated test profile retained at '+profile)
