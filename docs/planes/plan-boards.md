# Boards: limpieza y panel colapsado con estado

Estado: **decidido** (2026-10-12, quinta versión). El dueño pidió no complicarlo:
- **Limpieza:** se quitan la mensajería entre paneles y «Quitar y cerrar sesión». La comunicación entre agentes es otra función, **Rinari Agency**: [idea-rinari-agency.md](idea-rinari-agency.md).
- **Una pieza nueva:** el panel colapsado que mantiene su estado en vivo.
- **Las mejoras se ven después,** sobre esa base. Comparar, todavía no. Las ideas de las versiones anteriores quedan aparcadas en B.5.
- **Las sesiones madre → hija** tienen su propio plan, porque no son de Boards: [plan-sesiones-hijas.md](plan-sesiones-hijas.md).
- **Todo lo pendiente de Boards** está en la Parte C, y al final hay un mapa del código para quien se suma a Boards o a la Agency.

---

## Parte B. Boards: limpieza y panel colapsado con estado

> **Decisión del dueño (2026-10-12): no complicarlo.** Boards se queda como es hoy, con la **limpieza** de lo que no sirve y una sola pieza nueva: **el panel colapsado que mantiene su estado**. Sobre esa base se ven las mejoras, primero en uso real y después, si hace falta, con una maqueta. **Comparar, todavía no.** Las versiones anteriores de esta parte (la «por atención» y la «mesa de trabajo») quedan en B.5 como ideas aparcadas, sin decidir.

### B.1 Limpieza: lo que se va
- **La mensajería entre paneles**, entera:
  - en la app: el grupo de peers, `@Panel` en el composer (`paneMention.ts`), **«Enviar al panel…» con «Usar la última respuesta»** y el diálogo de reenvío (`PeerForwardDialog.tsx`) —también se quitan aunque los mande el dueño (decisión 2026-10-12)—, los avisos de mensajes de pares, el «máx. 3 saltos» (`peerLimits.ts`), la opción en Ajustes, y el chip de recibir/enviar y la insignia de mensajes de pares en la cabecera del panel y en la tira;
  - en el Engine, `session.send` hacia paneles;
  - **el historial de mensajes peer que ya existe se sigue viendo** en las conversaciones;
  - en el Engine se retira también el buzón de los mensajes entre paneles (`PeerBroker`, `engine_protocol/peers.py`) con sus métodos y su tabla (decisión C-2). Rinari Agency construirá su propia base desde cero.
- **«Quitar y cerrar sesión»** en el menú del panel (`BoardView.tsx:231-238`, `board.pane.removeAndClose`). En la práctica archivaba la conversación: `session.close` la sacaba del listado y detenía sus vistas previas, el navegador y los procesos. Además, el nombre se confundía con salir de la cuenta. **Queda solo «Quitar del board»**, que saca el panel sin tocar la conversación. Archivar se hace desde la barra lateral, como con cualquier conversación. Se retiran el diálogo de confirmación y las claves `board.pane.removeAndClose*`.
- Lo demás de Boards se queda como está: paneles por sesión, plegar y desplegar, el panel lateral por sesión, ajustar a la vista, el foco y los avisos de atención.

### B.1b La cabecera del panel, más limpia (dueño, 2026-10-12)
- **Se quita el punto de estado** junto al título: el estado ya lo dicen la cara animada de Rinari y los colores cuando algo salta (el borde ámbar si te necesita, el rojo si falla). En la tira de 48 px el punto también pasa a ser la cara de Rinari, en chico.
- **No hay «＋» de panel nuevo en la cabecera.**

### B.2 El panel colapsado mantiene su estado

**Hoy.** Un panel plegado es una tira vertical de 48 px (`CollapsedPaneStrip.tsx`) con un punto de estado, el título en vertical, el modelo y algunas insignias. No dice en qué va la sesión: para saberlo hay que desplegarla.

**Propuesta** (la captura de referencia es la maqueta: «Migrar pagos a Stripe v3» y «Webhooks idempotentes»). Plegado, el panel pasa a ser una **columna estrecha (~200 px) que sigue mostrando su estado en vivo**:
- **Cabecera:** la cara de Rinari según el estado (la misma de la cabecera del panel) y el título completo, en horizontal, hasta en dos líneas.
- **Contexto:** el proyecto y su rama, o «sesión suelta», y un chip `worktree` si la sesión trabaja en uno.
- **Progreso:** el anillo de la lista de pasos (`4/6`), con el paso en curso («Integrar las ramas · Paso 5 de 6»).
- **Lo que está haciendo ahora:** la acción en curso en una línea («Corriendo pruebas…»), o «Esperando a sus hijas (1/2)» cuando existan las hijas con entrega (A2 de [las sesiones hijas](plan-sesiones-hijas.md)).
- **Si te necesita:** la aprobación o la pregunta, en ámbar, con su botón para resolverla sin desplegar, o al menos un aviso claro que la despliega.
- **Al terminar:** el resultado en una línea y el check; si no lo leíste, queda marcado «Nuevo», como hoy.
- **Al pie:** los tokens, el tiempo y el modelo.

**Vistazo al pasar el ratón** (decidido por el dueño, 2026-10-12). Sobre un panel plegado (la columna o la tira de 48 px), una tarjeta flotante muestra sin desplegarlo:
- la última respuesta (las primeras líneas, con «Ver todo» que despliega el panel);
- el paso en curso y la acción del momento;
- si te necesita, la aprobación o la pregunta, **resoluble ahí mismo** (Permitir / Denegar / Responder).

Aparece tras un instante de pausa (~300 ms) para no saltar al pasar de largo, se queda mientras el ratón esté encima y se cierra con Esc. Con teclado: al enfocar la tira, Espacio abre el vistazo. Con movimiento reducido aparece sin animación.

**Reglas:**
- Plegar y desplegar es **siempre a mano**: el panel no cambia de tamaño solo por su estado.
- Si en el board no cabe una columna de ~200 px, el panel cae a la tira de 48 px de hoy, con el punto de estado y el anillo.
- Movimiento: la animación de plegar de hoy (desde el ancho que tenía) se mantiene. Los cambios de estado dentro de la columna usan las transiciones de siempre y, con movimiento reducido, son instantáneos.
- Tras un arranque en frío hace falta saber si una sesión plegada está trabajando: eso es C11 (`busy` en `session.list`).

**Pruebas.**
- Vitest del vistazo: aparece tras la pausa y no al pasar de largo, muestra la respuesta y el paso, y resuelve una aprobación sin desplegar.
- Vitest de la columna plegada: el anillo y el paso, la acción en curso, el aviso de aprobación o pregunta, el resultado sin leer, y la caída a la tira de 48 px cuando no hay sitio.
- Escenario de Boards: se pliega un panel que trabaja y la columna se actualiza con los eventos (paso, acción, fin) sin desplegarse; con `RINARI_UI_REDUCED_MOTION=1` también. La regla de `boards-fit` (que nada cambie la altura de la barra) sigue.

### B.3 Fases

| Fase | Qué | Tamaño |
|---|---|---|
| B1 | Limpieza: la mensajería entre paneles (con el `PeerBroker` del Engine) y «Quitar y cerrar sesión»; y el arreglo del «Preparando el turno…» (C.1) | S–M |
| B2 | El panel colapsado con su estado en vivo, y el vistazo al pasar el ratón (B.2) | M |
| B3 | Atajos de teclado, añadir un panel en un gesto y la barra más limpia (B.4) | S–M |

### B.4 Mejoras decididas (dueño, 2026-10-12)

1. **Atajos de teclado.**
   - **Ctrl+1…9:** ir al panel N (lo enfoca y pone el cursor en su composer). Si el panel está plegado, lo enfoca **sin desplegarlo** y abre su vistazo (dueño, 2026-10-12).
   - **Ctrl+J:** ir al siguiente panel que te necesita (aprobación, pregunta o fallo), en orden de llegada; si está plegado, abre su vistazo sin desplegarlo. Si no hay ninguno, un aviso corto «Nada te necesita».
   - Se suman a los de hoy (Ctrl+W, Ctrl+N) y aparecen en la ayuda de atajos.
2. **Añadir un panel en un gesto.**
   - **Arrastrar** una conversación desde la barra lateral al board: se suelta entre dos paneles o al final, con una guía que marca dónde caerá.
   - ~~«＋ en este proyecto» en la cabecera~~: **quitado** por el dueño (2026-10-12) al verlo en la maqueta; la cabecera queda más limpia. Un panel nuevo se añade arrastrando o con «Añadir panel».
   - El diálogo «Añadir panel» de hoy se queda para lo demás.
3. **Una barra más limpia.**
   - A la vista: los contadores (trabajando, te necesitan, sin leer), «Ajustar a la vista» y «Añadir panel».
   - En un menú «⋯»: «Colapsar terminados», «Modo foco», «Marcar todo como leído» y «Quitar todos».
   - La regla de `boards-fit` sigue: que aparezca un contador nunca cambia la altura de la barra.

4. ~~Salidas como paneles~~: **cambiado por el dueño** (2026-10-12). El panel lateral de cada panel se sigue abriendo con su botón, como hoy, y **se puede extender** mucho más, con «Ampliar» incluido. Eso lo resuelve [plan-0.3.2.md](plan-0.3.2.md) #44 para toda la app, junto con el navegador en tamaños de escritorio. Flujos pasa a ser una pestaña del panel lateral (#43). Boards solo los aprovecha; ya no hacen falta «Sacar a un panel» ni la etiqueta «de B».

**Pruebas.** Vitest de los atajos (Ctrl+1…9, Ctrl+J con y sin pendientes), del soltar desde la barra lateral (posición) y de la barra (qué queda a la vista y qué en el menú). Escenario de Boards: arrastrar una conversación, Ctrl+J entre dos paneles que esperan (uno plegado: se abre su vistazo).

Las siguientes mejoras se proponen una por una a partir de usar Boards ya limpio, cada una con su porqué. Si alguna necesita verse antes de construirla, se hace una maqueta de esa pieza, no de todo Boards.

### B.5 Ideas aparcadas (sin decidir)
Salieron de las versiones anteriores de este plan y de la maqueta (`Documents/Proyectos/rinari-boards-proto`, con los modos «Hoy» y «Reimaginado»). **No están decididas**, y se quedan aquí para no perderlas:
- la bandeja «Te necesitan» con Ctrl+J;
- espacios guardados (varios boards con nombre por perfil);
- composiciones rápidas (1 + pila, 2 lado a lado, 2×2, 3×2);
- etiqueta de rol por panel y la receta «Planear · Codificar · Revisar»;
- el chip de carpeta compartida con «Abrir en worktree» (C10);
- **Comparar** (el mismo encargo a varios modelos), que el dueño dejó para más adelante;
- **descartados** por el dueño: que los paneles cambien de tamaño solos según su estado; «Enviar a…» entre paneles (se quita con la mensajería); el resumen «Mientras no estabas» al volver a Boards; y las salidas como paneles propios (las reemplaza el panel lateral extensible, 0.3.2 #44).

---

## Parte C. Lo pendiente de Boards hoy

Todo lo que ya está anotado sobre Boards en otros lados (el plan 0.3.2, Planka, `docs/debt.md` y lo visto en pruebas), junto en un solo lugar.

| # | Qué | De dónde | Estado |
|---|---|---|---|
| C1 | «Preparando el turno…» aparece un instante en el panel al enviar y luego desaparece (ver C.1) | Planka, Bug (2026-10-12) | Causa verificada. En este plan, fase B1 (salió de 0.3.2) |
| C2 | El composer le quitaba el foco al cajón del panel lateral (el rojo de `boards-side-panel` en `main`) | Plan 0.3.2, «CI» | Hecho en la rama `0.3.2` (0c7f34f, sin subir) |
| C3 | La flecha de la lista de pasos apunta al revés; revisar que en los paneles (`density="pane"`) también esté anclada abajo | Plan 0.3.2, #22 | Decidido |
| C4 | Los avisos de turno terminado solo existen para paneles del board. Se extienden a todas las conversaciones reutilizando `useBoardNotifications`, y sus preferencias pasan a Ajustes → Notificaciones | Plan 0.3.2, #33 | Decidido. Toca código de Boards: coordinar |
| C5 | Pendientes de otros perfiles: agregar paneles filtra por el perfil activo y lo de otros perfiles no se ve | Plan 0.3.2, #34 | Decidido (depende de C4) |
| C6 | Quitar «Quitar y cerrar sesión» y dejar solo «Quitar del board» | Planka, Needs Review | Decidido (B.1, fase B1) |
| C7 | Mensajes entre paneles «como subagentes» | Planka, Idea; triage I1 | Resuelto por decisión: la mensajería se quita (B.1) y la comunicación entre agentes pasa a [Rinari Agency](idea-rinari-agency.md) |
| C8 | Animación en la píldora al cambiar entre Normal y Boards | Planka, Para luego | Sin decidir. Encaja con el pulido de movimiento |
| C9 | Panel en blanco (0 filas) al pasar de Normal a Boards | Visto 3 veces en uso real; intermitente en el escenario `chat-interaction-fixes` | Abierto, sin causa confirmada. Hipótesis: Virtua con un ancla de scroll restaurada fuera de rango |
| C10 | Dos paneles escribiendo en la misma carpeta: el Engine no los serializa y el board solo avisa | `docs/debt.md` | Abierto. El chip con «Abrir en worktree» quedó aparcado (B.5) |
| C11 | `busy` en `session.list`: tras un arranque en frío no se sabe si una sesión no abierta está trabajando hasta que llega un evento | `docs/debt.md` | Abierto. Lo necesita el panel colapsado con estado (B.2) |
| C12 | Los recibos de lectura se indexan por instalación, no por home del Engine | `docs/debt.md` | Abierto |
| C13 | Regla que se mantiene: que aparezca un contador en la barra de Boards nunca cambia su altura | 52530f7, comprobado en `boards-fit` | Vigente |

### C.1 «Preparando el turno…» parpadea en el panel

**Qué se vio** (Planka, Bug, con captura). En un panel de Boards, al enviar un mensaje aparece un instante el bloque «En proceso desde hace 0 s · Preparando el turno…» y luego desaparece. Que no esté es lo correcto en un panel; lo que sobra es que aparezca.

**Causa (verificada).**
- En 0.3.0 se quitó el «Pensando» de los paneles: en un panel, la cabecera viva del turno se oculta mientras Rinari solo piensa, porque eso ya lo dice la cara de Rinari en la cabecera del panel (`TurnTimelineView.tsx:619-623`, `paneThinking`).
- Pero esa regla solo cubre el estado `thinking`. Antes de pensar, el Engine emite `turn.preparing`, y la línea de tiempo pasa por el estado `preparing` (`activityPresentation.ts:129`).
- En `preparing` la cabecera sí se muestra: ya hay un elemento en la línea de tiempo, así que `showHeader` es verdadero al instante. Cuando llega la primera respuesta del modelo el estado pasa a `thinking` y la cabecera se esconde. De ahí el parpadeo.

**Propuesta.** En un panel, `preparing` se trata igual que `thinking`: la cabecera viva espera a que haya algo que contar (una acción, la respuesta, un reintento, la cancelación). Es un cambio de una línea en `TurnTimelineView.tsx`. El chat normal no cambia.

**Pruebas.**
- Vitest de `TurnTimelineView` con `surface="pane"`: con solo `turn.preparing` no hay `[data-live-activity]`; con una acción, sí. Con `surface="chat"` sigue igual que hoy.
- Escenario de Boards (`boards-fit` o uno nuevo): se envía en un panel y se muestrea con `requestAnimationFrame` desde el envío hasta la primera acción. `[data-live-activity]` no aparece en ningún cuadro.

---

## Mapa del código (para quien se suma)

**App (`Rinari-Agent`):**
- `src/features/board/`:
  - `BoardView.tsx` (el board), `SessionPane.tsx` y `PaneHeader.tsx` (cada panel), `CollapsedPaneStrip.tsx` (la tira plegada), `BoardToolbar.tsx`, `AddPaneDialog.tsx`, `DraftPane.tsx` (panel nuevo sin sesión aún);
  - atención y avisos: `BoardAttentionSection.tsx`, `BoardActivityController.tsx`, `useBoardNotifications.ts`, `useResultVisibility.ts`;
  - la mensajería que se va (B.1): `usePeerGroup.ts`, `usePeerNotifications.ts`, `PeerForwardDialog.tsx`, `PeerNavigationContext.tsx`, `peerLimits.ts`, y en el composer `src/components/composer/paneMention.ts`.
- Estado: `src/stores/board.ts`, `boardAttention.ts` y `boardStatus.ts`.
- La línea de tiempo de un panel es la misma del chat, con `surface="pane"` (`src/features/activity/TurnTimelineView.tsx`).
- Escenarios: `tests/ui/boards-fit`, `boards-remove-all` y `boards-side-panel`; `chat-interaction-fixes` y `activity-disclosure` también pasan por Boards.

**Engine (`RInari-CLI`):** `src/rinari/engine_protocol/peers.py` (`PeerBroker`, el buzón durable de los mensajes entre paneles). **Se retira con la mensajería** (C-2): sus métodos del protocolo, sus eventos y su tabla, con una migración que la elimina. Lo que ya se escribió en las conversaciones se sigue viendo.

**Antes de tocar:**
- reglas del proyecto en `AGENTS.md` (el renderer solo habla con el host por `platform()`, el contrato de comandos y cómo se entrega);
- diseño en `docs/design/obsidiana-neon.md` (tokens, componentes canónicos, movimiento);
- comprobaciones en `CLAUDE.md`: vitest, build, typecheck, `protocol:check`, `parity:check` y los escenarios de `tests/ui` tocados, varias veces, con la CPU cargada y con `RINARI_UI_REDUCED_MOTION=1`, más `ui:e2e --all`. Para el movimiento no basta una captura: se muestrea cuadro a cuadro.

---

## Decisiones

| # | Decisión | Estado |
|---|---|---|
| B-1 | Limpieza: quitar la mensajería entre paneles y «Quitar y cerrar sesión» | Decidido (dueño, 2026-10-12) |
| B-2 | El panel colapsado mantiene su estado en vivo (columna de ~200 px; tira de 48 px si no cabe) | Decidido (dueño, 2026-10-12) |
| B-3 | Paneles que cambian de tamaño solos según su estado | Descartado (dueño, 2026-10-12) |
| B-4 | Comparar | Todavía no (dueño, 2026-10-12) |
| B-5 | Lo demás de las versiones anteriores (B.5) | Aparcado: se propone pieza por pieza después de usar Boards limpio |
| C-1 | Lo que es solo de Boards sale de 0.3.2 y queda en este plan: C1 («Preparando el turno…»), la limpieza (B1) y el panel colapsado (B2) | Decidido (dueño, 2026-10-12) |
| C-2 | El buzón de los peers (`PeerBroker`) se retira con la mensajería, para que Rinari Agency construya bien su propia base | Decidido (dueño, 2026-10-12) |
