const assert = require('node:assert/strict')
// Only the scripted server bypasses the dead proxy, including for local presets.
process.env.NO_PROXY = process.env.no_proxy = new URL(process.env.RINARI_UI_MODEL).host
delete process.env.RINARI_LOGOS_TEST_UNSET
const { ui, delay, evaluate, wait, command, reload, seedBoard, panesFor, click, clickText, input, key, menuShortcut, size, screenshot, report, scenario } = require('../harness.cjs')
const expected = { openai:'openai', anthropic:'anthropic', openrouter:'openrouter', deepseek:'deepseek', groq:'groq', together:'together', mistral:'mistral', xai:'xai', 'opencode-zen':'opencode', 'opencode-go':'opencode', ollama:'ollama', lmstudio:'lmstudio', custom:'custom', gemini:'gemini', deepinfra:'deepinfra', fireworks:'fireworks', zai:'zai', 'zai-coding':'zai', moonshot:'moonshot', 'kimi-coding':'kimi', minimax:'minimax', 'minimax-coding':'minimax', chatgpt:'openai', 'github-copilot':'github-copilot', 'claude-subscription':'anthropic' }
const logos = '[data-provider-brand]'
let catalogSize = 0 // Set from the live catalog before any sheet is drawn.
async function healthy(scope = 'document') {
  await wait(`[...${scope}.querySelectorAll('${logos} img')].every(i=>i.complete && i.naturalWidth>0)`)
  const rows = await evaluate(`[...${scope}.querySelectorAll('${logos}')].map(e=>{const r=e.getBoundingClientRect();return {brand:e.dataset.providerBrand,w:r.width,h:r.height,visible:[...e.querySelectorAll('img,svg')].filter(i=>getComputedStyle(i).display!=='none').length,neutral:!!e.querySelector('[data-provider-fallback]'),sources:[...e.querySelectorAll('img')].map(i=>i.getAttribute('src'))}})`)
  assert(rows.length > 0)
  for (const r of rows) {
    assert.equal(r.visible,1,`one visible logo: ${r.brand}`)
    assert.equal(r.w,r.h,`square box: ${r.brand}`)
    assert(r.w>=12 && r.w<=26)
    assert.equal(r.neutral,r.brand==='custom',`fallback: ${r.brand}`)
    assert(r.sources.every(src=>src.startsWith('/logos/')))
  }
  return rows
}
async function settings() { await menuShortcut('settings','CmdOrCtrl+,'); await clickText('Proveedores','nav button'); await wait(`Boolean(document.querySelector('button'))`) }
async function sheet(theme) {
  await evaluate(`(() => {
    document.documentElement.dataset.theme=${JSON.stringify(theme)};
    const grid=document.createElement('div');grid.id='logo-review';grid.style.cssText='position:fixed;inset:0;z-index:99999;padding:24px;display:grid;grid-template-columns:repeat(4,1fr);gap:12px;background:${theme==='light'?'#ffffff':'#101018'};color:${theme==='light'?'#141414':'#fafafa'}';
    for(const button of document.querySelectorAll('[role="dialog"] button')){
      const logo=button.querySelector('${logos}');if(!logo)continue;
      const row=document.createElement('div');row.style.cssText='display:flex;align-items:center;gap:12px;min-width:0;border:1px solid #8884;padding:10px;border-radius:8px';
      for(const size of [26,14,12]) { const copy=logo.cloneNode(true);copy.style.width=size+'px';copy.style.height=size+'px';for(const el of copy.querySelectorAll('img,svg')){el.style.width=size+'px';el.style.height=size+'px';}row.append(copy); }
      const label=document.createElement('span');label.textContent=button.innerText.split('\\n')[0];label.style.cssText='font:12px sans-serif';row.append(label);grid.append(row);
    }document.body.append(grid);
  })()`)
  assert.equal(await evaluate(`document.querySelector('#logo-review').children.length`),catalogSize)
  await healthy('document.querySelector("#logo-review")')
  await screenshot(`logos-${theme}-26-14-12`)
  await evaluate(`document.querySelector('#logo-review').remove()`)
}
scenario(async () => {
  const catalog = (await command('provider_catalog_get')).presets.filter(p=>p.enabled)
  catalogSize = catalog.length
  assert.deepEqual(catalog.map(p=>p.id).sort(),Object.keys(expected).sort(),'coverage of the real pinned catalog')
  ui.win.webContents.reload() // Observe onboarding before the shared ready helper dismisses it.
  await wait(`document.querySelectorAll('[role="dialog"] ${logos}').length===${catalog.length}`)
  const wizard = await healthy('document.querySelector("[role=dialog]")')
  assert.deepEqual(wizard.map(r=>r.brand),catalog.map(p=>expected[p.id]))
  await screenshot('wizard-dark')
  await sheet('dark'); await sheet('light')
  await evaluate(`document.documentElement.dataset.theme='dark'`)
  // Image loading failure goes through Chromium and the actual React onError handler.
  await evaluate(`document.querySelector('[role="dialog"] [data-provider-brand="groq"] img').src='/logos/does-not-exist.svg'`)
  await wait(`Boolean(document.querySelector('[role="dialog"] [data-provider-brand="groq"] [data-provider-fallback]'))`)
  assert.equal(await evaluate(`document.querySelector('[role="dialog"] [data-provider-brand="groq"]').getBoundingClientRect().width`),26)
  await key('Escape')
  ui.win.webContents.reload()
  await wait(`document.querySelectorAll('[role="dialog"] ${logos}').length===${catalog.length}`)
  await size(900,800); ui.win.webContents.setZoomFactor(1.25); await delay(300)
  await healthy('document.querySelector("[role=dialog]")')
  await screenshot('wizard-narrow-125')
  await evaluate(`document.querySelector('[role="dialog"] [data-provider-brand="ollama"]').closest('button').click()`)
  await input('#provider-alias','Mi servidor local')
  assert.equal(await evaluate(`document.querySelector('[role="dialog"] ${logos}').dataset.providerBrand`),'ollama')
  await screenshot('custom-alias-form')
  await key('Escape'); ui.win.webContents.setZoomFactor(1); await size(1400,900)
  // Real catalog identities require the catalog endpoints/types. The dead proxy blocks them; only Custom uses the scripted server.
  const modelIds = {}
  // An external runtime is only saved once its CLI proves a subscription;
  // CI has no signed-in `claude`, so its card is the one not created here.
  const saved = catalog.filter(p=>!p.auth_methods.includes('external-cli'))
  for (const p of saved) {
    const alias = p.id==='ollama' ? 'Mi servidor local' : `Cuenta ${p.id}`
    await command('provider_create',{alias,provider_type:p.provider_type,auth_method:p.auth_methods[0]==='oauth'?'oauth':p.local||p.id==='custom'?'none':'api-key',secret_env:!p.local&&p.id!=='custom'&&p.auth_methods[0]!=='oauth'?'RINARI_LOGOS_TEST_UNSET':undefined,endpoint:p.endpoint || (p.id==='custom'?ui.model:undefined),settings:{product_id:p.id}})
    modelIds[p.id] = (await command('model_add',{provider:alias,provider_model_id:'fake-vertical',alias:`Modelo ${p.id}`,capabilities:{supports_tools:true,supports_streaming:true}})).model.id
  }
  await command('model_use',{reference:modelIds.ollama,provider:'Mi servidor local'})
  const ids=[]
  for(const title of ['Logos · conversación','Logos · panel vecino'])ids.push((await command('session_create',{chat:true,title})).session.id)
  await command('session_model_set',{reference:ids[0],model:modelIds.ollama,provider:'Mi servidor local'})
  await command('session_model_set',{reference:ids[1],model:modelIds.lmstudio,provider:'Cuenta lmstudio'})
  await reload(); await settings()
  await wait(`document.querySelectorAll('[data-anchor^="provider:"] ${logos}').length===${saved.length}`)
  const cards = await healthy()
  assert.equal(cards.filter(r=>r.brand==='custom').length,1)
  await screenshot('provider-cards')
  await clickText('Modelos','nav button'); await healthy(); await screenshot('models')
  await click('button[aria-label="Volver"]')
  await delay(1000)
  await evaluate(`[...document.querySelectorAll('aside button')].find(b=>b.textContent.includes('Logos · conversación')).setAttribute('data-logo-chat','')`)
  await click('[data-logo-chat]')
  await wait(`Boolean(document.querySelector('.composer-surface [data-provider-brand="ollama"]'))`)
  await click('.composer-surface button[title="Elegir modelo"]')
  await wait(`document.querySelectorAll('[data-radix-popper-content-wrapper] ${logos}').length>=${saved.length}`)
  await healthy(); await screenshot('model-picker')
  await key('Escape')
  await input('.composer-surface textarea','Prueba de identidad sin conexión')
  await click('.composer-surface button[aria-label="Enviar mensaje"]')
  await wait(`document.body.innerText.includes('El turno falló')`,60000)
  await command('session_model_set',{reference:ids[0],model:modelIds.custom,provider:'Cuenta custom'})
  await reload(); await clickText('Logos · conversación','aside button',{includes:true})
  await input('.composer-surface textarea','Prueba local de logos')
  await click('.composer-surface button[aria-label="Enviar mensaje"]')
  await wait(`document.body.innerText.includes('LOGOS LISTOS')`,60000)
  await screenshot('conversation')
  await command('session_model_set',{reference:ids[0],model:modelIds.ollama,provider:'Mi servidor local'})
  await seedBoard({panes:panesFor(ids),focusedPaneId:'pane_0',layoutMode:'fit',globalSidePanelOpen:false})
  await wait(`Boolean(document.querySelector('[data-pane-id="pane_0"] [data-provider-brand="ollama"]'))`)
  await wait(`Boolean(document.querySelector('[data-pane-id="pane_1"] [data-provider-brand="lmstudio"]'))`)
  await healthy(); await screenshot('boards')
  await click('[data-pane-id="pane_0"] button[aria-label="Colapsar panel"]')
  await wait(`Boolean(document.querySelector('.pane-strip [data-provider-brand="ollama"]'))`)
  await healthy(); await screenshot('collapsed-board')
  await click('.view-switcher button[aria-label^="Flujos"]')
  await wait(`Boolean(document.querySelector('.flow-stage [data-provider-brand="ollama"]'))`)
  await healthy(); await screenshot('flows')
  report({ engine: require('../../../engine-manifest.json').engine_git_sha, catalog:catalog.map(p=>p.id), passed:[`${catalog.length} real catalog products`,'all images loaded offline','dark/light at 26/14/12px','900px window at 125%','failed image fallback','wizard and custom alias form','provider cards and models','composer and picker','real local turn','Boards and collapsed strip','Flows'] })
  await command('model_use',{reference:modelIds.custom,provider:'Cuenta custom'})
  await settings()
}, {width:1400,height:900})
