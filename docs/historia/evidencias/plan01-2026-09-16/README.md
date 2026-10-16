# Evidencia — base integrada del plan 00/01 (2026-09-16)

Smoke real del host Tauri en desarrollo con el Engine integrado
(`Rinari-CLI` rama `integration/engine-peer-base`), ejecutado en Windows 11
con un `RINARI_HOME` temporal y un proveedor **falso** sin credenciales
(`http://127.0.0.1:9/v1`, `--no-auth`). Las capturas se tomaron por CDP sobre
el WebView2 de la app (`Page.captureScreenshot`, 1440×900); sirven como
referencia para comparar los mismos estados en Electron (documento 02).

## Comprobaciones ejecutadas contra el Engine real

| Comprobación | Resultado |
|---|---|
| `engine_status` | `ready`, protocolo 1, `home_id` presente (16 hex) |
| Capabilities anunciadas | `session_peer_messaging_v1`, `process_identity_v1`, `desktop_processes_v1`, `browser_view_v1`, `turn_changeset_v1`, `permission_profiles_v2` |
| Grupo peer registrado por el board | `enabled`, revisión 1, epoch 1, dos miembros `send/receive` |
| Turno real con proveedor falso | `turn.failed` (`ConnectError`): un solo bloque de error, fila `TurnMeta` «El turno falló · 4s · Preparar reintento», ninguna tarjeta resumen |
| «Preparar reintento» | Rellena el Composer del panel con la entrada del turno; no envía (toast «Mensaje copiado al compositor») |
| «Configurar siguiente mensaje» (menú del header) | El foco termina en el `textarea` del Composer de ese panel y el panel queda enfocado |
| Superficies flotantes | `document.querySelectorAll('[class*=fixed]')` = 0 con dock abierto en Normal y en Boards |
| `console.error` tras recargar | 0 (antes del fix de claves: 3–8 avisos «two children with the same key» por `ProcessesDock`/`Questions`, preexistente en `main`) |

## Capturas

| Archivo | Estado |
|---|---|
| `03-boards-two-panes.jpg` | Boards con dos paneles (860 px): header con identidad/estado, dock acoplado con Archivos · Navegador · Workspace, un solo Composer con PLAN/BUILD/REVIEW, modelo y permisos por panel. |
| `04-boards-menu-browser.jpg` | Menú del header con «Configurar siguiente mensaje» y superficie Navegador rotulada como vista previa (desconectado). |
| `05-normal-dock-files.jpg` | Normal con el mismo dock (Archivos) abierto por la acción tipada `files`; sin overlay. |
| `06-normal-failed-turn.jpg` | Turno fallido en Normal: error, nota de trabajo conservado, diagnóstico y fila de metadatos una sola vez. |
| `07-boards-failed-turn-retry.jpg` | El mismo turno en Boards (idéntico) y el borrador preparado por «Preparar reintento» sin enviar. |

No se probaron proveedores reales ni se usaron credenciales del usuario.
