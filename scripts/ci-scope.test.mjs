// Qué partes del empaquetado de Windows ejecuta cada cambio. Los casos son
// los ficheros reales de PR recientes: si la regla cambia, se ve contra qué.
import { describe, expect, it } from 'vitest'
import { classify, scopeFor } from './ci-scope.mjs'

const NONE = { bootstrapper: false, package: false, updater: false }

describe('classify', () => {
  it('sólo documentación (#18): no empaqueta nada', () => {
    expect(classify(['docs/debt.md'])).toEqual(NONE)
  })

  it('sólo el renderer: lo cubre frontend con desktop:smoke', () => {
    expect(classify([
      'src/features/flow/FlowView.tsx',
      'src/features/flow/useFlow.ts',
      'src/i18n/es.ts',
    ])).toEqual(NONE)
  })

  it('un cambio de pin del Engine (M02, #11) empaqueta, sin Rust ni updater', () => {
    expect(classify([
      'engine-manifest.json',
      'src/types/protocol.generated.ts',
    ])).toEqual({ bootstrapper: false, package: true, updater: false })
  })

  it('código del host (#17) empaqueta: el mapa de comandos va en el main empaquetado', () => {
    expect(classify([
      'AGENTS.md',
      'electron/main/engine/commandMap.generated.ts',
      'scripts/desktop-parity.mjs',
      'src/platform/commands.generated.ts',
    ])).toEqual({ bootstrapper: false, package: true, updater: false })
  })

  it('el bootstrapper arrastra el paquete: el setup va dentro', () => {
    expect(classify(['installer/setup/src-tauri/src/main.rs'])).toEqual({ bootstrapper: true, package: true, updater: false })
  })

  it('el updater arrastra el paquete: empaqueta sobre el sidecar y el payload', () => {
    expect(classify(['scripts/updater-e2e.ps1'])).toEqual({ bootstrapper: false, package: true, updater: true })
    expect(classify(['scripts/generate-update-metadata.mjs'])).toEqual({ bootstrapper: false, package: true, updater: true })
  })

  it('las actualizaciones activan el updater', () => {
    expect(classify(['electron/main/updates/createUpdates.ts'])).toEqual({ bootstrapper: false, package: true, updater: true })
    expect(classify(['build/app-update.yml'])).toEqual({ bootstrapper: false, package: true, updater: true })
  })

  it('los scripts de empaquetado coinciden por prefijo', () => {
    expect(classify(['scripts/package-engine.ps1']).package).toBe(true)
    expect(classify(['scripts/package-release.ps1']).updater).toBe(true)
    // Un script que no empaqueta no activa nada.
    expect(classify(['scripts/generate-protocol.mjs'])).toEqual(NONE)
  })

  it('una dependencia puede romper cualquier parte menos el Rust', () => {
    expect(classify(['package-lock.json'])).toEqual({ bootstrapper: false, package: true, updater: true })
  })

  it('cambiar el propio CI ejecuta todo', () => {
    const all = { bootstrapper: true, package: true, updater: true }
    expect(classify(['.github/workflows/agent-ci.yml'])).toEqual(all)
    expect(classify(['scripts/ci-scope.mjs'])).toEqual(all)
  })

  it('una ruta parecida no coincide por accidente', () => {
    expect(classify(['docs/electron/notes.md', 'src/build/x.ts', 'tests/installer/y.ts'])).toEqual(NONE)
  })
})

describe('scopeFor', () => {
  it('en push a main corre todo, sin mirar ficheros', () => {
    expect(scopeFor({ event: 'push', full: false, files: ['docs/debt.md'] }))
      .toMatchObject({ bootstrapper: true, package: true, updater: true })
  })

  it('workflow_dispatch corre todo', () => {
    expect(scopeFor({ event: 'workflow_dispatch', full: false, files: [] }))
      .toMatchObject({ bootstrapper: true, package: true, updater: true })
  })

  it('la etiqueta ci:full fuerza todo en un PR', () => {
    expect(scopeFor({ event: 'pull_request', full: true, files: ['docs/debt.md'] }))
      .toMatchObject({ bootstrapper: true, package: true, updater: true, reason: 'ci:full' })
  })

  it('un PR normal decide por rutas', () => {
    expect(scopeFor({ event: 'pull_request', full: false, files: ['docs/debt.md'] }))
      .toEqual({ ...NONE, reason: 'paths' })
  })
})
