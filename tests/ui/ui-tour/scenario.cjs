// Recorrido visual: captura las superficies principales (inicio, chat con
// actividad y subagente, composer y sus menús, panel lateral, Boards, Flujos,
// Ajustes, notificaciones) para revisar el diseño antes y después de cambiarlo.
// No afirma comportamiento: cada paso opcional se registra y el recorrido sigue.
const { click, clickText, command, evaluate, input, key, menuShortcut, report, scenario, screenshot, until, wait, delay, size, useLocalModel, reload, ui } = require('../harness.cjs')

const steps = []
async function step(name, body) {
  try {
    await body()
    steps.push({ name, ok: true })
  } catch (error) {
    steps.push({ name, ok: false, error: String(error?.message ?? error).slice(0, 300) })
    await key('Escape').catch(() => {})
  }
}
const pending = (lane) => fetch(new URL(`/__pending?lane=${lane}`, ui.model)).then(r => r.json())
const release = (lane) => fetch(new URL(`/__release?lane=${lane}`, ui.model)).then(r => r.json())
const text = (s) => `document.body.innerText.includes(${JSON.stringify(s)})`
const slug = (s) => String(s ?? '').replace(/[^\w-]+/g, '_').slice(0, 28)
async function send(message) {
  await input('.composer-surface textarea', message)
  await click('.composer-surface button[aria-label="Enviar mensaje"]')
}
async function popoversIn(scope, prefix) {
  const selector = `${scope} button[aria-haspopup], ${scope} button[aria-expanded]`
  const count = await evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`).catch(() => 0)
  for (let i = 0; i < Math.min(count, 12); i++) {
    await step(`${prefix}-${i}`, async () => {
      const label = await evaluate(`(()=>{const b=document.querySelectorAll(${JSON.stringify(selector)})[${i}];if(!b)return '';b.click();return b.getAttribute('aria-label')||b.textContent.trim().slice(0,30)})()`)
      await delay(450)
      await screenshot(`${prefix}-${i}-${slug(label)}`)
      await key('Escape')
      await delay(250)
    })
  }
}
async function rightClick(selectorExpr, shot) {
  const r = await evaluate(`(()=>{const b=${selectorExpr};const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)
  for (const type of ['mouseDown', 'mouseUp']) ui.win.webContents.sendInputEvent({ type, x: Math.round(r.x), y: Math.round(r.y), button: 'right', clickCount: 1 })
  await delay(500)
  await screenshot(shot)
  await key('Escape')
}

scenario(async () => {
  await step('home', () => screenshot('01-home'))
  await useLocalModel()
  const { session } = await command('session_create', { chat: true, title: 'Recorrido visual' })
  await reload()
  await clickText('Recorrido visual', 'aside button', { includes: true })
  await step('send', () => send('Revisa la carpeta y prepárame un resumen con un ejemplo de código.'))
  await step('live', async () => {
    for (let i = 0; i < 2; i++) {
      await until(async () => await pending('main') > 0, `main step ${i}`)
      await release('main')
    }
    await delay(1200)
    await screenshot('02-chat-live')
  })
  await step('subagent', async () => {
    await until(async () => await pending('main') > 0, 'spawn')
    await release('main')
    await until(async () => await pending('sub') > 0, 'sub waits')
    await release('sub')
    await delay(1200)
    await screenshot('03-chat-subagent-running')
    for (let i = 0; i < 3; i++) {
      await until(async () => await pending('sub') > 0, `sub ${i}`)
      await release('sub')
    }
  })
  await step('finish', async () => {
    const deadline = Date.now() + 60_000
    while (Date.now() < deadline && !(await evaluate(text('FIN DEL RECORRIDO')))) {
      if (await pending('main') > 0) await release('main')
      if (await pending('sub') > 0) await release('sub')
      await delay(500)
    }
    await wait(text('FIN DEL RECORRIDO'), 5_000)
    await delay(900)
    await screenshot('04-chat-done-folded')
  })
  await step('activity-open', async () => {
    await evaluate(`[...document.querySelectorAll('button[aria-label="Ver actividad del turno"]')].forEach(b=>b.click())`)
    await delay(700)
    await screenshot('05-chat-activity-open')
  })
  await step('working', async () => {
    await send('Ahora sigue trabajando un rato.')
    await until(async () => await pending('main') > 0, 'held')
    await delay(1000)
    await screenshot('06-chat-working')
  })
  await popoversIn('.composer-surface', '07-composer')
  await step('release-working', async () => {
    const deadline = Date.now() + 20_000
    while (Date.now() < deadline && !(await evaluate(text('TRABAJO TERMINADO')))) {
      if (await pending('main') > 0) await release('main')
      await delay(400)
    }
  })
  await step('sidebar-context', () => rightClick(`[...document.querySelectorAll('aside button')].find(b=>b.textContent.includes('Recorrido visual'))`, '08-sidebar-context-menu'))
  await step('message-context', () => rightClick(`[...document.querySelectorAll('[data-testid="turn-result"], .markdown')].pop()`, '08b-message-context-menu'))
  await popoversIn('aside', '09-sidebar')
  await step('dock', async () => {
    await click('button[aria-label="Panel lateral"]')
    await delay(700)
    const tabSel = '.pane-dock-tabs [role="tab"]'
    const tabs = await evaluate(`[...document.querySelectorAll(${JSON.stringify(tabSel)})].map(b=>b.textContent.trim())`)
    for (const [i, label] of tabs.entries()) {
      await step(`dock-${label}`, async () => {
        await evaluate(`document.querySelectorAll(${JSON.stringify(tabSel)})[${i}].click()`)
        await delay(900)
        await screenshot(`10-dock-${i}-${slug(label)}`)
        const innerSel = `[...document.querySelectorAll('[data-testid="session-dock"] [role="tab"]')].filter(b=>!b.closest('.pane-dock-tabs'))`
        const inner = await evaluate(`${innerSel}.map(b=>b.textContent.trim())`)
        for (const [j, sub] of inner.entries()) {
          await evaluate(`${innerSel}[${j}]?.click()`)
          await delay(700)
          await screenshot(`10-dock-${i}-${j}-${slug(sub)}`)
        }
      })
    }
  })
  await step('boards', async () => {
    await click('.view-switcher button[aria-label^="Boards"]')
    await delay(1300)
    await screenshot('11-boards')
  })
  await step('flows', async () => {
    await evaluate(`[...document.querySelectorAll('.view-switcher button')].find(b=>/Flujo/i.test(b.getAttribute('aria-label')||b.textContent))?.click()`)
    await delay(1300)
    await screenshot('12-flows')
  })
  await step('back-normal', async () => {
    await click('.view-switcher button[aria-label="Normal"]')
    await delay(700)
  })
  await popoversIn('header', '13-header')
  await popoversIn('footer', '14-statusbar')
  await step('palette', async () => {
    await key('K', ['control'])
    await delay(600)
    await screenshot('15-command-palette')
    await key('Escape')
  })
  await step('settings', async () => {
    await menuShortcut('settings', 'CmdOrCtrl+,')
    await delay(800)
    const navSel = `[...document.querySelectorAll('nav button')].filter(b=>b.textContent.trim())`
    const nav = await evaluate(`${navSel}.map(b=>b.textContent.trim())`)
    for (const [i, label] of nav.entries()) {
      await step(`settings-${label}`, async () => {
        await evaluate(`${navSel}[${i}].click()`)
        await delay(1000)
        await screenshot(`16-settings-${String(i).padStart(2, '0')}-${slug(label)}`)
      })
    }
  })
  await step('mcp-add', async () => {
    await evaluate(`[...document.querySelectorAll('nav button')].find(b=>b.textContent.trim()==='MCP')?.click()`)
    await delay(700)
    await evaluate(`[...document.querySelectorAll('main button, [role="dialog"] button')].find(b=>/Agregar|Añadir|Nuevo/.test(b.textContent))?.click()`)
    await delay(800)
    await screenshot('17-mcp-add')
    await key('Escape')
  })
  await step('close-settings', async () => {
    await key('Escape')
    await delay(500)
  })
  await step('narrow', async () => {
    await size(1000, 760)
    await delay(700)
    await screenshot('18-narrow')
    await size(1500, 900)
  })
  report({ session: session.id, steps })
}, { timeout: 420_000 })
