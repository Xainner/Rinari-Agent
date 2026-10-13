# Boards reimaginado

Estado: **propuesta para revisar**, cuarta versión (2026-10-12). Incorpora la dirección del dueño:
- **Se quita la mensajería entre paneles de Boards.** La comunicación entre agentes pasa a una función nueva, **Rinari Agency**, que tiene su documento propio: [idea-rinari-agency.md](idea-rinari-agency.md).
- **Las sesiones madre → hija** (anidadas, con los permisos de la madre) tienen su propio plan, porque no son de Boards: [plan-sesiones-hijas.md](plan-sesiones-hijas.md). Aquí se citan como «la Parte A».
- **Boards es una mesa de trabajo:** varios paneles a la vez (3–4, a veces 6), cada uno con su propio trabajo, del mismo proyecto o de otros, con sus salidas y sus Flujos como paneles propios. Nada se reacomoda solo (Parte B).
- **Todo lo pendiente de Boards en un solo lugar** (Parte C): lo que estaba en el plan 0.3.2, en Planka y en `docs/debt.md`, más el bug nuevo del «Preparando el turno…». Al final, un mapa del código para quien se suma a Boards o a la Agency.

---

## Parte B. Boards: una mesa de trabajo con varias sesiones a la vez

> **Cuarta versión (2026-10-12).** La versión anterior repartía la pantalla «según la atención»: lo que trabajaba solo se encogía a una tira. Al verla en la maqueta, el dueño dijo que está bien pero que **no es lo que busca**: Boards es para **trabajar** en varios paneles a la vez, no para vigilarlos. Lo que se toma y lo que se deja de esa versión está en B.7.

### B.1 Para qué es Boards (el dueño, 2026-10-12)
- **Trabajar con varios paneles a la vez:** normalmente 3–4, a veces 6.
- **Cada panel lleva su propio trabajo.** Pueden ser del mismo proyecto, de proyectos distintos o sesiones sueltas, y pueden estar relacionados o no. Por ejemplo: tres paneles del mismo proyecto, donde A planea, B codifica y C revisa; y al lado, una sesión suelta del dueño haciendo otra cosa.
- **Las salidas como paneles propios:** el navegador, la terminal, los archivos y los agentes de cada sesión, y su vista de **Flujos**, bien visibles, no apretados en un cajón.
- **Limpieza:** Boards nació al inicio del proyecto y arrastra cosas que no sirven (la mensajería entre paneles, «Quitar y cerrar sesión»).

### B.2 Principio de diseño

> **Una mesa de trabajo estable que controla el dueño.** Nada cambia de tamaño ni de lugar solo. Cada panel está completo y a la vista, con su propio trabajo. Lo que necesita al dueño se avisa sin reacomodar nada.

### B.3 Las piezas

1. **Un mosaico que decides tú.**
   - Composiciones: 2 lado a lado, 3 en columnas, 1 grande + 2, 2×2 y 3×2 (para los días de 6). Se eligen con un selector o con **Ctrl+Alt+1…5**, y los bordes se ajustan arrastrando.
   - El mosaico se guarda con el espacio y **no se mueve solo**: un panel que termina, falla o pide algo no cambia de tamaño ni de lugar.
   - Plegar un panel a una tira sigue existiendo, pero solo a mano.
2. **Paneles completos, con una densidad pensada para 4–6.**
   - Cada panel tiene su composer y su conversación entera.
   - Un modo **compacto** (por panel o para todo el board): menos aire en la línea de tiempo, letra un punto menor, el composer de una línea que crece al escribir y la cabecera en una sola fila.
3. **Identidad de cada panel, de un vistazo.**
   - El proyecto con su color, su nombre y su rama, o «sesión suelta»; y el perfil, si es otro.
   - Una **etiqueta de rol** opcional («Planea», «Codifica», «Revisa» o una libre), que va con el modo PLAN / BUILD / REVIEW del panel.
   - **Receta «Planear · Codificar · Revisar»:** un gesto abre tres paneles del mismo proyecto, cada uno con su modo y su etiqueta.
4. **Las salidas como mosaicos propios.**
   - Hoy cada panel tiene un cajón lateral con una superficie a la vez (Agentes, Archivos, Navegador, Workspace, Terminal; `SessionDock`), y en un panel estrecho queda apretado.
   - Propuesta: cualquier superficie se puede **sacar a su propio mosaico** («Sacar a un panel»), al lado de la sesión que la produce. Lleva el color de la sesión y una etiqueta «de *Panel B*», y sigue a su sesión: si la sesión se quita del board, su salida también.
   - Si el panel es ancho, la superficie puede seguir dentro, como hoy.
   - Ejemplos: la vista previa del navegador de B junto a B; la terminal de C debajo de C; el diff de B al lado de C, que revisa.
5. **Flujos de cada panel.**
   - Dentro del panel, un selector **Chat · Flujo**: el panel cambia a la vista de Flujos (`FlowView`) con el alcance de esa sesión o de su proyecto, sin salir de Boards.
   - Y como cualquier salida, el Flujo también se puede sacar a su propio mosaico.
6. **Pasar trabajo de un panel a otro, a mano.** En un resultado, «**Enviar a…**» lo manda como mensaje a otro panel (el plan de A pasa a B). Lo decide el dueño en cada caso: no es mensajería entre agentes, que se va (B.4).
7. **Atención sin mover nada.**
   - Una bandeja **«Te necesitan»** fija arriba del board (no aparece ni desaparece empujando el resto) junta las aprobaciones y preguntas de todos los paneles, para resolverlas ahí mismo.
   - **Ctrl+J** salta a lo siguiente que te necesita: enfoca ese panel sin cambiar el mosaico.
   - En el panel: el borde ámbar que late una vez y una insignia.
8. **Espacios guardados.** Varios boards con nombre por perfil («Mi board», «Pagos», «Release 0.4»), cada uno con sus paneles, sus salidas y su mosaico, mezclando proyectos con libertad. Se abren desde la barra lateral o la paleta.
9. **Llenar rápido:** arrastrar sesiones desde la barra lateral (una madre con sus hijas trae a todas, de [las sesiones hijas](plan-sesiones-hijas.md)), «Nuevo panel» con selector de proyecto o sesión suelta, y la receta del punto 3.
10. **Teclado:** **Ctrl+1…9** ir al panel N; **Ctrl+J** lo siguiente que te necesita; **Ctrl+Alt+1…5** composiciones; **Ctrl+W / Ctrl+N** como hoy.
11. **Conflictos de carpeta a la vista.** Si dos paneles escriben en la misma carpeta, un chip «comparte carpeta con *X*» ofrece abrir el siguiente en un worktree (C10).
12. **Comparar,** como función aparte y para más adelante: el mismo encargo a 2–4 paneles con modelos distintos y una vista de resultados (necesita los worktrees de A3 de las [sesiones hijas](plan-sesiones-hijas.md)).

### B.4 Qué se va
- La mensajería entre paneles: el grupo de peers, `session.send`, `@Panel`, el «máx. 3 saltos», la opción en Ajustes y el chip de recibir/enviar de la cabecera del panel. El historial de mensajes peer se sigue viendo.
- El board único global: los paneles guardados pasan al primer espacio, «Mi board».
- **«Quitar y cerrar sesión»** en el menú del panel (`BoardView.tsx:231-238`, `board.pane.removeAndClose`). En la práctica archivaba la conversación: `session.close` la sacaba del listado y detenía sus vistas previas, el navegador y los procesos. Además, el nombre se confundía con salir de la cuenta. **Queda solo «Quitar del board»**, que saca el panel sin tocar la conversación. Archivar se hace desde la barra lateral, como con cualquier conversación. Se retiran el diálogo de confirmación y las claves `board.pane.removeAndClose*`.
- De la barra de hoy, lo que el mosaico estable vuelve innecesario («Modo foco» pasa a «1 grande + 2»; «Ajustar a la vista», a las composiciones). Se revisa uno por uno al implementar.

### B.5 Lo que se queda
Paneles por sesión, tiras plegadas (a mano), el panel lateral por sesión (ahora también como mosaico), el foco, los avisos de atención y los recibos de lectura. Esto ya funciona y se reaprovecha.

### B.6 Fases

| Fase | Qué | Tamaño |
|---|---|---|
| B1 | Limpieza (mensajería, «Quitar y cerrar sesión», barra), espacios guardados por perfil y composiciones estables | M |
| B2 | Salidas y Flujos como mosaicos propios, y el selector Chat · Flujo en el panel | L |
| B3 | Identidad del panel (proyecto, rol), densidad compacta y bandeja «Te necesitan» con Ctrl+J | M |
| B4 | Receta «Planear · Codificar · Revisar», «Enviar a…» y llenar rápido | S |
| B5 | Conflictos de carpeta con la acción de worktree, y Comparar (necesita A3) | L |

### B.7 De la versión «por atención» (la tercera)
- **Se toma:** la bandeja «Te necesitan» con Ctrl+J, los espacios guardados, las composiciones rápidas, llenar en un gesto, el chip de carpeta compartida y Comparar (más adelante).
- **Se deja:** que los paneles cambien de tamaño solos según su estado y la «tira viva» automática. Si algún día hace falta para vigilar muchos agentes, sería un modo opcional, no el de siempre.
- **La maqueta** (`Documents/Proyectos/rinari-boards-proto`) conserva los modos «Hoy» y «Reimaginado» como referencia. De sus 14 preguntas, las de redimensionado automático (1–4 y 13) dejan de aplicar.

---

## Parte C. Lo pendiente de Boards hoy

Todo lo que ya está anotado sobre Boards en otros lados (el plan 0.3.2, Planka, `docs/debt.md` y lo visto en pruebas), junto en un solo lugar.

| # | Qué | De dónde | Estado |
|---|---|---|---|
| C1 | «Preparando el turno…» aparece un instante en el panel al enviar y luego desaparece (ver C.1) | Planka, Bug (2026-10-12) | Causa verificada. En 0.3.2 como #39 |
| C2 | El composer le quitaba el foco al cajón del panel lateral (el rojo de `boards-side-panel` en `main`) | Plan 0.3.2, «CI» | Hecho en la rama `0.3.2` (0c7f34f, sin subir) |
| C3 | La flecha de la lista de pasos apunta al revés; revisar que en los paneles (`density="pane"`) también esté anclada abajo | Plan 0.3.2, #22 | Decidido |
| C4 | Los avisos de turno terminado solo existen para paneles del board. Se extienden a todas las conversaciones reutilizando `useBoardNotifications`, y sus preferencias pasan a Ajustes → Notificaciones | Plan 0.3.2, #33 | Decidido. Toca código de Boards: coordinar |
| C5 | Pendientes de otros perfiles: agregar paneles filtra por el perfil activo y lo de otros perfiles no se ve | Plan 0.3.2, #34 | Decidido (depende de C4) |
| C6 | Quitar «Quitar y cerrar sesión» y dejar solo «Quitar del board» | Planka, Needs Review | Decidido (B.4, fase B1) |
| C7 | Mensajes entre paneles «como subagentes» | Planka, Idea; triage I1 | Resuelto por decisión: la mensajería se quita (B.4) y la comunicación entre agentes pasa a [Rinari Agency](idea-rinari-agency.md) |
| C8 | Animación en la píldora al cambiar entre Normal y Boards | Planka, Para luego | Sin decidir. Encaja con el pulido de movimiento |
| C9 | Panel en blanco (0 filas) al pasar de Normal a Boards | Visto 3 veces en uso real; intermitente en el escenario `chat-interaction-fixes` | Abierto, sin causa confirmada. Hipótesis: Virtua con un ancla de scroll restaurada fuera de rango |
| C10 | Dos paneles escribiendo en la misma carpeta: el Engine no los serializa y el board solo avisa | `docs/debt.md` | Abierto. Lo resuelve B.3.11 (chip y worktree) |
| C11 | `busy` en `session.list`: tras un arranque en frío no se sabe si una sesión no abierta está trabajando hasta que llega un evento | `docs/debt.md` | Abierto. Lo necesitan la insignia de estado de cada panel y la bandeja (B.3.7) |
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
  - la mensajería que se va (B.4): `usePeerGroup.ts`, `usePeerNotifications.ts`, `PeerForwardDialog.tsx`, `PeerNavigationContext.tsx`, `peerLimits.ts`, y en el composer `src/components/composer/paneMention.ts`.
- Estado: `src/stores/board.ts`, `boardAttention.ts` y `boardStatus.ts`.
- La línea de tiempo de un panel es la misma del chat, con `surface="pane"` (`src/features/activity/TurnTimelineView.tsx`).
- Escenarios: `tests/ui/boards-fit`, `boards-remove-all` y `boards-side-panel`; `chat-interaction-fixes` y `activity-disclosure` también pasan por Boards.

**Engine (`RInari-CLI`):** `src/rinari/engine_protocol/peers.py` (`PeerBroker`, el buzón durable de los mensajes entre paneles). Al quitar la mensajería hay que decidir si el buzón se retira o se guarda como transporte de la Agency, que lo cita en su sección 2.

**Antes de tocar:**
- reglas del proyecto en `AGENTS.md` (el renderer solo habla con el host por `platform()`, el contrato de comandos y cómo se entrega);
- diseño en `docs/design/obsidiana-neon.md` (tokens, componentes canónicos, movimiento);
- comprobaciones en `CLAUDE.md`: vitest, build, typecheck, `protocol:check`, `parity:check` y los escenarios de `tests/ui` tocados, varias veces, con la CPU cargada y con `RINARI_UI_REDUCED_MOTION=1`, más `ui:e2e --all`. Para el movimiento no basta una captura: se muestrea cuadro a cuadro.

---

## Decisiones para el dueño

| # | Decisión | Recomendado |
|---|---|---|
| B-1 | Paneles que cambian de tamaño solos según su estado | **No** (dueño, 2026-10-12): mosaico estable que controla el dueño |
| B-2 | Varios espacios guardados por perfil, en lugar de un board global | Sí |
| B-3 | «Comparar» como función estrella de Boards | No es la estrella: función aparte, para más adelante (B5) |
| B-4 | Salidas (navegador, terminal, archivos, agentes) y Flujos se pueden sacar a su propio mosaico, ligado a su sesión | Sí |
| B-5 | «Enviar a…»: el dueño pasa un resultado de un panel a otro, a mano | Sí (no es mensajería entre agentes) |
| B-6 | Etiqueta de rol por panel y la receta «Planear · Codificar · Revisar» | Sí |
| V | Versiones: Parte B en 0.4 (las hijas: A1 en 0.3.2, A2–A3 después); la Agency aparte | B1 primero |
| C-1 | Los arreglos chicos de Boards ya analizados (C1–C5) van con 0.3.2; la Parte B y la Agency, con quien se sume | Sí: son cambios acotados y C4 toca también lo que no es Boards |
| C-2 | El buzón de los peers (`PeerBroker`): retirarlo con la mensajería o guardarlo como transporte de la Agency | Guardarlo hasta que la Agency tenga su arquitectura (v2 de su documento) |
