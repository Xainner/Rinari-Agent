# Rinari Agent Nightly

Estado: **decidido, entra en la 0.4.0** (dueño, 2026-10-14). Las decisiones están abajo.

## La idea

Una rama `next` (en esta versión, la propia `0.4.0`) que es un main adelantado: cada bloque del plan entra ahí con las pruebas locales, sin PR ni los ~30 min de CI por PR. De ella sale **Rinari Agent Nightly**, instalada junto a la normal, para usar todo lo nuevo en el día a día. Al final, `next → main` pasa una sola vez por el CI completo y se publica como siempre.

## Decisiones del dueño (2026-10-13)

1. **Datos: los del home de la instalación normal** (`~/.rinari`), no una carpeta aparte.
2. **Las dos formas de instalar:**
   - **local:** `npm run nightly` trae las ramas `next` de CLI y Agent, corre las pruebas rápidas, arma el instalador y lo instala; nada sale de la PC (lo más rápido para el dueño);
   - **prereleases «nightly» en GitHub**, con su propio canal de actualización, para quien quiera usarla sin compilar. Publicar cada una sigue pidiendo permiso del dueño, como cualquier release.

## Lo que implica compartir `~/.rinari`

- **Las migraciones son de ida.** La 0.4.0 trae `0050`–`0052`. Al abrir la Nightly, el Engine las aplica a `state.db`, y desde ese momento **la versión normal no abre**: `storage/migrations/runner.py:135-141` rechaza una base «más nueva que la soportada». La normal vuelve a funcionar al actualizarse a 0.4.0.
- **Dos Engines sobre la misma base a la vez** duplicarían lo que corre solo: tareas programadas (`ScheduleRunner`), reanudaciones (#24), goals (#23), y pisarían archivos como `policies/approval_grants.json`.

**Salvaguardas propuestas** (para que compartir sea seguro):
1. **Respaldo antes de migrar:** la primera vez que la Nightly va a aplicar una migración nueva, copia `state.db` (y `policies/`) a `~/.rinari/backups/antes-de-nightly-<fecha>/` y lo dice.
2. **Una sola a la vez:** un candado en `~/.rinari`; si la normal está abierta, la Nightly no arranca su Engine y avisa «Cierra Rinari Agent para usar la Nightly» (y al revés).
3. **Volver a la normal:** en Ajustes de la Nightly, «Volver a la versión normal» restaura el respaldo (con aviso de que se pierde lo hecho desde entonces en la Nightly), o se espera a la 0.4.0.

## Lo demás

| Tema | Cómo |
|---|---|
| Convivir instaladas | Otro `appId` (`com.rinari.agent.nightly`), otro nombre e icono con marca «Nightly», otra carpeta de instalación, sin inicio con Windows por defecto. |
| Engine | La Nightly fija la punta de la rama `next` del CLI en vez del pin de `engine-manifest.json`. |
| Pruebas al subir a `next` | Solo las rápidas (tsc, typecheck:electron, vitest, pytest, ruff; unos minutos). `ui:e2e --all` de noche o al pasar a main. |
| Hotfixes | Después de cada hotfix en main, main se mezcla en `next`. |
| Actualizaciones | La local se reinstala con `npm run nightly`. La de GitHub busca solo prereleases del canal `nightly` (`allowPrerelease` y un canal propio), sin mezclarse con las normales. |
