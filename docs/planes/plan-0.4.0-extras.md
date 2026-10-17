# Plan 0.4.0 — extras

Pedidos sueltos del dueño después de cerrar las tandas de [plan-0.4.0.md](plan-0.4.0.md). Cada uno con lo que se vio, la causa y la propuesta, como en el plan principal.

| # | Qué | Dónde | Estado |
|---|---|---|---|
| E1 | La etiqueta de permisos junto al título sobra | Agent | Hecho (6d8adb3) |
| E2 | El tiempo sale dos veces en la tarjeta de trabajo | Agent | Hecho |
| E3 | Avisos entre perfiles: no salió el indicador | Agent | Registro arreglado (3e4f72e); falta reproducirlo con la Nightly nueva |
| E4 | El resumen final quedó dentro de la actividad y la respuesta fue una oración | CLI + Agent | Hecho (CLI 452278c, Agent 67c3f29) |

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

---

## E3. Avisos entre perfiles: «no hubo indicador de perfil ni del chat»

**Qué se vio** (dueño, 2026-10-17, Nightly 1257, con capturas):
1. En el perfil 1 pidió un plan en un chat.
2. Se fue a otro perfil y pidió otra cosa en otro chat.
3. Sonó la notificación, pero no hubo número en la barra de tareas ni en la bandeja, ni marca en el selector de perfil ni en el chat.

**Lo que dicen los datos** (base del dueño, solo lectura):
- «Plan para tictactoe en JavaScript» (perfil Predeterminado): dos turnos de **9 s y 7 s**; el último terminó a las 19:48:49 UTC.
- «Fallo al eliminar archivo en galería» (perfil «0.3.2», id `test`): un turno de **12 min**, de 19:40:29 a 19:52:11 UTC.
- El turno del tictactoe terminó casi seguro con el chat todavía a la vista: un resultado que se ve 0,5 s con la ventana atendida cuenta como leído, así que ese no quedó pendiente.
- La notificación que sonó es, casi seguro, la de «Fallo al eliminar» (19:52). Esa sí debió marcar el perfil «0.3.2», salvo que fuera la conversación a la vista en ese momento.

**Lo que se comprobó.**
- Escenario nuevo `attention-profiles`: un chat del perfil 1 termina mientras estás en el perfil 2. Resultado: el título pasa a «(1) Rinari Agent», el avatar del selector lleva «1», la campana también, y sale el aviso «terminó». **Funciona en la app de pruebas.**
- **Fallo encontrado en las pruebas (arreglado).** `npm run nightly` arma `dist`/`dist-electron` como Nightly, en la misma carpeta que usa `ui:e2e`. Con la Nightly instalada abierta, la app de pruebas no conseguía el candado de una sola instancia, se cerraba sola con código 0, y el runner lo daba por «OK».
  - Ahora el runner solo da «OK» si el escenario llega a `RINARI_UI_OK`, y se niega a correr sobre una build Nightly.
  - `npm run nightly` vuelve a armar la build normal al terminar.
  - Los «OK» de escenarios corridos después de una Nightly no valían; se repitieron y pasan.
- `app.log` no sirve para reconstruirlo: la línea `[rinari] attention …` es `console.info` y solo se guarda con «Registros detallados».

**Propuesta.**
1. **La línea de pendientes, siempre en `app.log`** (solo ids y estados, sin contenido): cuando un chat queda pendiente o deja de estarlo, que quede rastro aunque los registros detallados estén apagados.
2. **Reproducirlo con el dueño:** con la Nightly nueva, «Registros detallados» encendidos y los mismos pasos. Si falla, el registro dice qué decidió la app.
3. Si el caso real es «la conversación que terminó era la que estaba a la vista al cambiar de perfil»: al cambiar de perfil, la conversación anterior deja de contar como vista (la superficie ya no es suya).

---

## E4. El resumen final quedó dentro de la actividad; la respuesta fue una oración

**Qué se vio** (dueño, 2026-10-17, `ses_01M55P2JNEXZ7WFGE3VEGV5MA8`): «el resumen final parece que me lo dio en la lista colapsable y al final solo me dio una oración».

**Causa (verificada en los eventos de la sesión).**
1. **19:52:04:** Rinari escribe el resumen completo (2877 caracteres).
2. **19:52:08:** llama a `checklist.update` para cerrar la lista de pasos.
3. **19:52:11:** cierra con «Listo, checklist cerrado: no queda nada pendiente. El diagnóstico y las dos tareas sugeridas ya están sobre la mesa.» (116 caracteres).

La app toma como respuesta final solo el texto **después de la última herramienta**. Por eso el resumen queda como texto intermedio dentro de la actividad plegable.

**Propuesta.**
1. **App:** las herramientas de **contabilidad** no parten la respuesta final: `checklist.update`, `goal.update`, `memory.*` y las sugerencias de seguimiento. La respuesta final es el texto que va después de la última acción **de verdad**. En este caso se ve el resumen, y debajo la línea de cierre.
2. **CLI:** una regla en el prompt: «cierra la lista de pasos **antes** de escribir el resumen final; después de él, ninguna herramienta». Así no depende solo de la app.

**Pruebas.**
- **Vitest:** con texto → `checklist.update` → texto corto, el resultado muestra los dos textos, y la actividad no se queda con el resumen.
- **CLI:** la regla está en el prompt.
