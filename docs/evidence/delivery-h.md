# Evidencia de entrega H — cutover Electron

Fecha: 2026-09-20

Plataforma validada: Windows x64

Base Agent: `0bdce0007223e7ed8523ccff5747d3c83f5ae52b`

Engine fijado: `6de4827d58c829535fa9160a8a073423f86a049f`

## Resultado

Electron es el único runtime activo de Rinari Agent. Se retiraron el host de
aplicación `src-tauri`, `src/platform/tauri.ts`, sus dependencias raíz, el
codegen Rust y los jobs de aplicación Tauri. El renderer usa exclusivamente el
contrato de `src/platform` y el bridge Electron.

El bootstrapper visual permanece en `installer/setup` como herramienta de
distribución aislada. Tiene su propio `package.json`, lock, CLI y crate; no se
carga ni se descarga al instalar, compilar o probar la aplicación Electron.
El exportador 0.1.3 se conserva como fuente histórica auditable en
`docs/migration/transition-0.1.3`, no como segundo runtime.

## Gates

| Gate | Estado | Evidencia |
| --- | --- | --- |
| G0 — Baseline | PASS | cutover apilado sobre G3 `0bdce00`; working tree del Engine creado en el SHA fijado sin tocar `feat/computer-use` |
| G1 — Datos/protocolo | PASS | `protocol:check`; importador adversarial en la suite; contrato de 0.1.3 conservado; 130 comandos y cero sin resolver |
| G2 — UX | PASS | 97 archivos / 737 pruebas de renderer y producto; tests heredados portados a `createTestBridge()` |
| G3 — Host | PASS | `desktop:smoke`; `desktop:parity` con 12 módulos y un turno terminal contra proveedor falso |
| G4 — Browser | PASS | `browser:vertical`: 29/29, misma página/target, pestañas, clipping, uploads, downloads y reinicio |
| G5 — Seguridad | PASS | BR10, BR11 y pruebas negativas; página remota sin Node, preload, broker ni acceso a `app://rinari` |
| G6 — Distribución | PASS dentro del alcance unsigned aprobado | instalación, migración, update 0.2.0 → 0.2.1, integridad SHA-512 y rollback; Authenticode diferido por decisión del propietario |
| G7 — Recursos | PASS | BR13: 100/100 ciclos vuelven al baseline, cero listeners duplicados; BR14: Stop 1–2 ms, límite 8 MiB y cero replay |

`G6` no afirma identidad Authenticode. El artefacto y `latest.yml` declaran
explícitamente que el canal es unsigned. No se creó tag, release ni publicación.
macOS y Linux permanecen `NOT_RUN`, fuera del primer objetivo Windows x64.

## Validaciones ejecutadas

```text
npx --yes npm@10 ci                         PASS, 0 vulnerabilidades
npm test                                    PASS, 97 archivos / 737 pruebas
npx tsc --noEmit                            PASS
npm run typecheck:electron                  PASS
npm run protocol:check                      PASS
npm run parity:check                        PASS, 130 / 124 / 6 / 0
npm run build                               PASS
npm run desktop:build                       PASS
npm run desktop:smoke                       PASS, app://rinari sin fugas
npm run desktop:parity                      PASS, 12 módulos + turno terminal
npm run browser:vertical                    PASS, 29/29
npm run setup:web:build                     PASS
cargo fmt --manifest-path installer/setup/src-tauri/Cargo.toml --check
                                               PASS
cargo clippy --manifest-path installer/setup/src-tauri/Cargo.toml
  --all-targets -- -D warnings              PASS
cargo test --manifest-path installer/setup/src-tauri/Cargo.toml
                                               PASS, 11/11
npm run setup:build                         PASS, Rinari-Setup.exe
```

La instalación raíz reporta cero paquetes `@tauri-apps`. El subproyecto
`installer/setup` fija `@tauri-apps/api@2.11.1` y `@tauri-apps/cli@2.11.4`
exclusivamente para construir el bootstrapper.

## Decisiones finales

- El inventario ya no analiza Rust retirado. Compara las llamadas activas con
  `docs/migration/desktop-command-contract.json`, capturado de 0.1.3.
- El codegen de protocolo produce TypeScript solamente.
- El Engine empaquetado vive en `engine-dist` y se resuelve desde
  `process.resourcesPath/engine-dist`.
- El canal de release activo acepta solamente `v0.2.*` y genera candidatos
  draft unsigned; no publica automáticamente una versión final.
- La transición 0.1.3 puede reconstruirse desde el commit histórico indicado
  en su README sin mantener Tauri dentro de la aplicación 0.2.x.
