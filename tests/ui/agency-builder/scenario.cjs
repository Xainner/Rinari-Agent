// «Arma tu equipo con Rinari» (agency_team_builder_v1): desde el «+» de
// Equipos se describe el equipo, Rinari (un modelo falso) propone agentes,
// jefe, flujo, rutina, carpeta y lo que usa cada uno; el dueño elige si
// reutiliza a su agente, crea el equipo de una vez y en su panel aparece
// «Para empezar», que pone en marcha la rutina al resolverse.
const assert = require('node:assert/strict')
const { existsSync } = require('node:fs')
const { join } = require('node:path')
const { click, command, evaluate, input, reload, report, scenario, screenshot, settleAnimations, useLocalModel, wait } = require('../harness.cjs')

const CARD = '[data-testid="agency-card"]'
const BUILDER = '[data-testid="team-builder"]'
const OUT = join(process.env.RINARI_UI_DATA, 'salidas', 'informes')

scenario(async () => {
  await useLocalModel()
  await command('agency_agent_create', { agent: { name: 'Revisora', role: 'Revisa textos antes de entregarlos' } })
  await evaluate(`localStorage.setItem('rinari.agency.tutorial.seen', JSON.stringify(['default']))`)
  await reload()

  await click(CARD)
  await wait(`Boolean(document.querySelector('[data-testid="agency-new-team"]'))`)
  await click('[data-testid="agency-new-team"]')
  await click('[data-testid="agency-new-team-build"]')
  await wait(`document.querySelector(${JSON.stringify(BUILDER)})?.querySelector('[data-testid="team-builder-description"]') !== null`)
  await settleAnimations()
  await screenshot('describe')

  // Nada nativo: ni <select> ni <progress> en el armador.
  const native = await evaluate(`document.querySelector(${JSON.stringify(BUILDER)}).querySelectorAll('select, progress').length`)
  assert.equal(native, 0, 'the builder uses the canonical controls')

  await input('[data-testid="team-builder-description"]', 'Un equipo que investigue un tema cada lunes y deje el informe en mi carpeta de informes; la Revisora lo revisa.')
  await click('[data-testid="team-builder-propose"]')
  await wait(`document.querySelectorAll('[data-testid="team-builder-agent"]').length === 2`, 60_000)
  await wait(`Boolean(document.querySelector('[data-testid="team-builder-pending"]'))`, 15_000)
  await settleAnimations()
  await screenshot('review-top')

  // La sugerida espera la elección del dueño: hasta entonces no se crea.
  const blocked = await evaluate(`document.querySelector('[data-testid="team-builder-create"]').disabled`)
  assert.equal(blocked, true, 'create waits for the reuse choice')
  const blocker = await evaluate(`document.querySelector('[data-testid="team-builder-blocker"]')?.textContent ?? ''`)
  assert(blocker.includes('Revisora'), `the blocker names the owner's agent: ${blocker}`)
  await evaluate(`[...document.querySelectorAll('[data-testid="team-builder-reuse"] [role="radio"]')].find((b) => b.textContent.includes('Usar a')).click()`)
  await wait(`!document.querySelector('[data-testid="team-builder-create"]').disabled`)

  await evaluate(`document.querySelector('[data-testid="team-builder-flow"]').scrollIntoView({ block: 'start', behavior: 'instant' })`)
  await settleAnimations()
  await screenshot('review-flow')
  await evaluate(`document.querySelector('[data-testid="team-builder-folders"]').scrollIntoView({ block: 'start', behavior: 'instant' })`)
  await settleAnimations()
  await screenshot('review-folders')

  await click('[data-testid="team-builder-create"]')
  await wait(`Boolean(document.querySelector('[data-testid="agency-team-setup"]'))`, 30_000)
  await settleAnimations()
  await screenshot('team-setup')

  const { teams } = await command('agency_team_list', { rinari_profile_id: 'active' })
  const team = teams.find((item) => item.name === 'Investigación semanal')
  assert(team, `the team was created: ${teams.map((item) => item.name)}`)
  assert.equal(team.members.length, 2)
  const agents = (await command('agency_agent_list', { rinari_profile_id: 'active' })).agents
  assert.equal(agents.filter((agent) => agent.name === 'Revisora').length, 1, 'Revisora was reused, not duplicated')
  assert(existsSync(OUT), 'the results folder was created')
  let routines = (await command('agency_routine_list', { team_id: team.id })).routines
  assert.equal(routines.length, 1)
  assert.equal(routines[0].kind, 'flow')
  assert.equal(routines[0].enabled, false, 'the routine waits for «Para empezar»')

  // «Lo hago yo» en cada pieza: la rutina arranca sola.
  for (;;) {
    const left = await evaluate(`document.querySelectorAll('[data-testid="agency-team-setup-manual"]').length`)
    if (!left) break
    await click('[data-testid="agency-team-setup-manual"]')
    await wait(`document.querySelectorAll('[data-testid="agency-team-setup-manual"]').length < ${left}`)
  }
  routines = (await command('agency_routine_list', { team_id: team.id })).routines
  assert.equal(routines[0].enabled, true, 'the routine started once nothing was left')
  await settleAnimations()
  await screenshot('team-setup-done')

  report({
    passed: [
      'the builder opens from the + of Teams and has no native controls',
      'the proposal shows agents, flow, routine, folders and what is missing',
      'creating waits for the reuse choice and reuses the owner agent',
      'the team, its flow routine and its trusted results folder are created at once',
      '«Para empezar» resolves its pieces and the routine starts',
    ],
  })
}, { width: 1400, height: 900 })
