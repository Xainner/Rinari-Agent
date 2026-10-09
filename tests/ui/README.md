# Pruebas nativas de interfaz

Recorridos con la app de producción (`dist-electron`) y un Engine real, para
lo que jsdom no puede comprobar: geometría, scroll, foco, arrastre de
archivos, diálogos nativos y persistencia tras reiniciar.

```bash
npm run build
npm run desktop:build
npm run ui:e2e -- --list             # escenarios disponibles
npm run ui:e2e -- boards-fit         # uno o varios
npm run ui:e2e -- --all              # todos
npm run ui:e2e -- boards-fit --keep  # deja la ventana abierta al terminar
```

**Engine.** Si `RINARI_ENGINE_BIN` está definido (con `RINARI_ENGINE_ARGS` o
`RINARI_ENGINE_ARGS_JSON`, y `RINARI_ENGINE_CWD`), se usa ese. Si no, se usa
`uv run rinari` en el checkout `RINARI_CLI`, que debe estar en el
`engine_git_sha` de `engine-manifest.json`. La CI hace lo mismo en el job
`ui-e2e`, con la pantalla del runner a 1920×1080: los escenarios necesitan
ventanas de hasta 1900 px, y el arnés falla con la causa si no caben.

**Aislamiento.** Cada escenario:

- arranca con un perfil de Electron y un `RINARI_HOME` temporales, con
  `RINARI_KEYRING=0`;
- pone el proxy en un puerto muerto, con solo el loopback exento;
- usa un modelo falso en loopback o, si no lo necesita, un proveedor muerto
  (`127.0.0.1:9`).

No toca credenciales, sesiones ni el portapapeles del equipo. Si el escenario
pasa, sus datos se borran; si falla, o con `--keep`, se conservan y el
lanzador imprime la ruta.

**Evidencias.** Las capturas y el `report.json` de cada fase quedan en
`release/evidence/ui/<escenario>/`, una carpeta que git ignora. Un fallo deja
también `failure.png` y el final del texto visible en la consola.

## Escenarios

| Escenario | Qué cubre |
|---|---|
| [diagnostics-export](diagnostics-export/scenario.cjs) | Acerca de: «Exportar diagnóstico» muestra el contenido, guarda el ZIP y el paquete lleva registros y el resumen del Engine sin argumentos, títulos ni la carpeta personal |
| [activity-disclosure](activity-disclosure/README.md) | Avances visibles en vivo, operaciones plegadas y resumen al terminar en Normal y Boards |
| [attention-taskbar](attention-taskbar/README.md) | Un resultado en otro chat de Normal sube el número de pendientes |
| [boards-fit](boards-fit/README.md) | Ajustar a la vista en Boards |
| [boards-remove-all](boards-remove-all/README.md) | Quitar todos los paneles, con confirmación |
| [boards-side-panel](boards-side-panel/README.md) | Panel lateral cerrado por defecto en Boards |
| [chat-image-overlay](chat-image-overlay/README.md) | Visor de adjuntos sobre toda la ventana |
| [chat-scroll-button](chat-scroll-button/README.md) | Flecha de bajar junto al composer |
| [chat-send-jump](chat-send-jump/README.md) | Enviar desde arriba del historial lleva al final |
| [composer-file-drag](composer-file-drag/README.md) | Arrastrar archivos a todo el chat |
| [conversation-draft](conversation-draft/README.md) | Conversación nueva como borrador hasta el primer mensaje |
| [document-sheet](document-sheet/README.md) | Un XLSX del workspace se ve como cuadrícula, con fórmulas pendientes honestas |
| [document-preview](document-preview/README.md) | Un PPTX del workspace se ve renderizado, con su contenido, su verificación y sus revisiones |
| [file-media](file-media/README.md) | Video, imagen grande, PDF y audio del workspace; tonos de aviso |
| [memory-proposal](memory-proposal/scenario.cjs) | Memoria visible: la propuesta llega como tarjeta al chat, se aprueba, aparece en Ajustes > Memoria; en modo automático se guarda sola y «Deshacer» la olvida |
| [memory-portability](memory-portability/scenario.cjs) | Ajustes > Memoria: importar un archivo de otra instalación muestra el resumen (nuevos, olvidados) y espera confirmación; lo exportado lleva su digest y no lo olvidado; reimportarlo no añade nada; un archivo cambiado se rechaza |
| [claude-subscription-toggle](claude-subscription-toggle/scenario.cjs) | Claude Subscription es opt-in: apagado por defecto en Ajustes > Proveedores, no se ofrece al agregar un proveedor hasta encenderlo, y el Engine guarda el ajuste |
| [model-change-notice](model-change-notice/README.md) | Aviso «Se cambió de modelo de A a B» |
| [project-reveal](project-reveal/README.md) | Desplegar el proyecto al crear una conversación |
| [provider-limit](provider-limit/README.md) | Cuota agotada: la razón real y «Revisar uso y límites» del proveedor que falló |
| [session-menu-id](session-menu-id/README.md) | ID de sesión en una sola línea |
| [session-title](session-title/README.md) | Título que resume el primer mensaje, en vivo |
| [subagent-follow](subagent-follow/README.md) | La actividad de un subagente sigue su final |

## Escribir un escenario

1. Crea `tests/ui/<nombre>/scenario.cjs` con el arnés:

   ```js
   const { scenario, useLocalModel, command, click, wait, screenshot, report } = require('../harness.cjs')

   scenario(async (ui) => {
     await useLocalModel()
     const { session } = await command('session_create', { chat: true, title: 'Prueba' })
     // …
     await screenshot('estado')
     report({ passed: ['…'] })
   })
   ```

2. Regístralo en `scenarios.mjs`, con sus fases, su modelo falso y sus fixtures.
3. Añade su `README.md`: qué comportamiento fija y cómo se comprueba.

Reglas del arnés:

- **Acciones:** `click` usa eventos de ratón de confianza; `domClick` y
  `clickText` sirven para menús y filas cuya posición no se prueba.
- **Fixtures:** solo se preparan por almacenamiento los fixtures, como
  `seedBoard`. La acción que se prueba se hace siempre desde la interfaz.
- **Restricciones:** nada de proveedores externos ni de credenciales.
