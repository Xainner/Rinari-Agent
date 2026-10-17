# Plan 0.4.0 — extras

Pedidos sueltos del dueño después de cerrar las tandas de [plan-0.4.0.md](plan-0.4.0.md). Cada uno con lo que se vio, la causa y la propuesta, como en el plan principal.

| # | Qué | Dónde | Estado |
|---|---|---|---|
| E1 | La etiqueta de permisos junto al título sobra | Agent | Hecho (6d8adb3) |
| E2 | El tiempo sale dos veces en la tarjeta de trabajo | Agent | Anotado |

---

## E1. Sin etiqueta de permisos en la barra del título

**Qué se vio** (dueño, 2026-10-17, con captura). Junto al título de la conversación sale «Acceso completo» en ámbar: «No me gusta que en el título salga el acceso, ya eso lo tenemos en el composer».

**Causa.** Permisos v4, P-4 ([plan-permisos-v4.md](plan-permisos-v4.md)) pidió el modo «siempre a la vista en su cabecera» (`ChatHeader.tsx`, `PermissionBadge`, c3c4191). El chip del composer ya dice el mismo modo y deja cambiarlo.

**Hecho (6d8adb3).** Se quitó la etiqueta, su prop `permission` desde `App.tsx` y su CSS; la prueba de `ChatHeader` comprueba que no está. El modo queda en el chip del composer. Entra en la próxima Nightly.

---

## E2. El tiempo, dos veces en la tarjeta de trabajo

**Qué se vio** (dueño, 2026-10-17, con captura). Mientras Rinari trabaja, la tarjeta dice «Pensando… / 12 s» a la izquierda y «13 s ~3…» a la derecha: el mismo tiempo dos veces.

**Causa (verificada, `features/activity/TurnStatusCard.tsx`).** Son dos relojes a propósito (#49, diseño A):
- debajo del título, `turn-action-time`: lo que lleva **la acción en curso** (`actionSince`: desde la acción o la última llamada al modelo), que se reinicia con cada acción para distinguir un turno largo que avanza de uno trabado;
- a la derecha, `turn-total-time`: el **total del turno**, junto a los tokens.

Al empezar el turno, o mientras la primera acción no termina, los dos arrancan casi a la vez y marcan lo mismo (12 s / 13 s), así que se lee como un reloj duplicado.

**Propuesta.**
1. **El reloj de la acción solo cuando aporta:** se oculta mientras la acción empezó a menos de 2 s del inicio del turno (es decir, mientras ambos cuentan lo mismo). Aparece en cuanto hay una acción posterior, y entonces dice qué mide: «esta acción · 12 s».
2. A la derecha queda siempre el total con los tokens, que no cambia.
3. En un panel angosto (una sola línea) se muestra solo el total; el de la acción va en el detalle al pasar el ratón, como hoy.

**Pruebas.** Vitest de `TurnStatusCard`: con una sola acción desde el inicio hay un solo reloj; tras una segunda acción salen los dos y el de la acción se reinicia. Captura en `ui-tour` del turno en curso. Pasa por la sesión de pulido de UI.
