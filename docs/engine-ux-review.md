# Revisión UX del motor (2026-09-08) — PENDIENTE DE REVISIÓN DEL USUARIO

> Registro histórico anterior al cutover Electron. Las menciones al puente
> Tauri explican el diagnóstico de esa revisión y no son instrucciones activas.

Cambios aplicados para que Rinari Agent no parezca depender de un "motor"
que hay que encender a mano. Nada aquí toca el protocolo ni el engine:
solo presentación y arranque automático.

## Decisión 1 — Arranque automático

- `App.tsx`: un `useEffect` llama `session.startEngine()` una vez al abrir
  la app (guard `useRef` por `StrictMode` en dev).
- Racional: el sidecar empaquetado siempre viaja con la app; el estado
  "Detenido" en arranque limpio era un artefacto del flujo dev, no una
  elección de producto.
- A revisar: ¿reintento automático con backoff si falla, o un solo intento?
  Hoy: un intento + toast de error + dot rojo en el footer.

## Decisión 2 — Fuera el botón "Iniciar motor" del sidebar

- `AppSidebar.tsx`: eliminado el botón dashed + prop `onStartEngine`.
- En estados transitorios (`starting/handshaking/restarting`) se muestra
  "Conectando con Rinari…"; en `stopped/failed`, la lista queda limpia y el
  footer (dot + EngineConsole) conserva el estado real.
- A revisar: ¿mostrar algo más explícito en `failed` dentro de la lista?

## Decisión 3 — Paleta sin "Iniciar motor"

- `CommandPalette.tsx`: eliminado el item + prop `onEngineStart`.
  Queda "Reiniciar" (los comandos de diagnóstico viven en EngineConsole).
- A revisar: ¿reintroducir como comando oculto solo cuando `failed`?

## Decisión 4 — Textos

- `ChatView` vacío sin engine: "Conectando con Rinari…" (`chat.connecting`).
- `EngineConsole`: "Iniciar motor" → "Reintentar conexión" (`engine.retry`),
  visible solo en `stopped/failed`.
- Claves `engine.start` conservadas en i18n (sin uso) por si la revisión
  pide revertir alguna superficie. Borrar tras la revisión.

## Estado real preservado

- Footer del sidebar: dot por estado + versión del engine (sin cambios).
- `EngineConsole`: estado, detalle, reintentar, reiniciar. Sin botón
  "Detener": cerrar la app mata el sidecar; el comando `engine_shutdown`
  sigue existiendo para diagnóstico.
- El auto-arranque nunca enmascara un fallo: `failed` sigue visible.

## Ronda 2 (reporte de prueba 2026-09-08)

- `provider_create` "missing key": la cadena Rust→engine se verificó con el
  payload exacto (clave `type` + nulls) contra el engine empaquetado: OK.
  El mensaje visto es formato Tauri (key ausente en el invoke), que solo
  ocurre si `form.preset` llega vacío. Blindaje: validación explícita
  (`providers.noType`) en wizard y ajustes + test roundtrip con nulls.
  Si reaparece, anotar el texto EXACTO del toast.
- Doble ojo en apikey: era el reveal nativo de WebView2 + el nuestro.
  Se oculta `::-ms-reveal/::-ms-clear` en CSS.
- Imágenes: home 48→96, sidebar 36→44.
