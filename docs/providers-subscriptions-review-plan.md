# Proveedores, suscripciones, cuotas y capacidades

Fecha: 2026-09-22. Estado: implementación local con pruebas automatizadas; aceptación de suscripciones reales y release pendientes.

## Objetivo y arquitectura

Conectar un proveedor debe permitir descubrir modelos, transportar correctamente
sus capacidades y consultar cuotas o saldo cuando exista un contrato validado.
Rinari Engine conserva credenciales, autenticación, enrutamiento, ejecución,
historial y presupuestos. Agent presenta el contrato mediante Electron y
`platform()`. No se incorpora otro harness ni otra base de sesiones.

El catálogo será amplio; las integraciones de suscripción mediante compatibilidad
se identificarán como experimentales. Se comparte la detección de metadatos con
[contexto y compactación](context-compaction-review-plan.md).

## Hallazgos de la revisión previa

- OpenCode Go respondió a `/zen/go/v1/usage` con ventanas rolling, semanal y
  mensual, porcentajes consumidos y reinicios. Su `/models` no informa contexto
  ni modalidades de GLM-5.3-Flash: necesita enriquecimiento de catálogo.
- xAInner, Go y Anthropic respondieron al descubrimiento autenticado. Esto no
  acredita inferencia, visión, herramientas ni razonamiento.
- Anthropic omitía `thinking`/`output_config.effort`; las firmas y bloques de
  continuación se perdían al guardar historial y en streaming.
- Las bases Anthropic acabadas en `/v1` duplicaban el segmento.
- Engine y escritorio mantenían catálogos divergentes; Zen necesita selección
  entre Chat Completions, Responses y Messages por modelo.
- Faltaba el ciclo de autenticación de suscripciones.

## Cobertura acordada

OpenAI API, Anthropic API, Gemini, xAI, DeepSeek, Mistral, OpenCode Go/Zen,
OpenRouter, Groq, Together, DeepInfra, Fireworks, Ollama, LM Studio y personalizados.
Productos separados: ChatGPT (suscripción, acceso Codex), GitHub Copilot,
Z.ai API/Coding Plan, Moonshot API/Kimi Coding y MiniMax API/Token Plan.
Servicios globales; Azure, Bedrock y Vertex quedan fuera.

Cuotas remotas iniciales: Go, ChatGPT, OpenRouter y DeepSeek. Otros mostrarán
estado no soportado y panel del proveedor; locales, no aplicable. El consumo
registrado por Rinari es independiente del consumo de la cuenta.

## Contratos y comportamiento requerido

- Catálogo único en Engine, identidad estable de producto independiente del alias.
- URLs canónicas conservando prefijos y overrides; transporte por modelo;
  cabecera `x-opencode-session` en todas las llamadas que correspondan.
- Capacidades distinguen modelo anunciado, endpoint y transporte implementado;
  procedencia/fecha, contexto/salida/modalidades y niveles específicos por modelo.
- Claude: pensamiento adaptativo o presupuesto legacy según modelo; Gemini:
  niveles válidos y firmas. Parámetros incompatibles fallan antes de enviar.
- Bloques opacos persistidos solo en Engine y ligados al destino original; no
  telemetría de razonamiento privado ni reutilización entre proveedores.
- ChatGPT: OAuth/PKCE y alternativa device; Copilot: device y token de servicio.
  Estados explícitos, cancelación/expiración, renovación coordinada entre
  procesos, credenciales seguras y cuentas independientes. Logout solo Rinari.
- Cuotas: ventanas dinámicas, porcentaje usado/restante, reinicio, alcance,
  fuente y fecha. `null` no significa cero; clave ilimitada no implica saldo
  ilimitado; importes decimales separados por moneda.
- Caché por cuenta/producto/revisión de credencial, timeout 10 s, refresco 60 s
  solo con panel visible, stale a 5 min, Retry-After/backoff hasta 15 min.
  Un fallo de cuotas no bloquea inferencia.

Protocolo: `provider.catalog.get`, `provider.auth.start/get/cancel/logout`,
`provider.usage.get`, `provider.diagnostics.get`; ampliar `model.capabilities`;
eventos `provider.auth.updated` y `provider.usage.updated`. Tipos generados.

## Interfaz y migración

Tarjeta con producto, cuenta, conexión, modelos y resumen de cuota. Detalle con
Conexión, Modelos, Uso y límites y Diagnóstico. Go: barras de porcentaje restante
y reinicios; ChatGPT: ventanas devueltas por servicio sin inventar periodicidad.
Wizard con métodos de autenticación del catálogo y compatibilidad visible.

Preservar IDs, aliases, claves, sesiones y overrides. Inferir productos heredados
solo por tipo/endpoint inequívocos; xAInner sigue siendo personalizado. Negociar
funciones nuevas con capacidades del protocolo; no cambiar el pin hasta publicar
el Engine y verificar el paquete integrado.

## Entregas y aceptación

1. Regresiones, catálogo común, identidad y rutas.
2. Capacidades, Claude/Gemini y continuidad tras herramientas.
3. Cuotas Go/OpenRouter/DeepSeek e interfaz.
4. Suscripciones ChatGPT/Copilot y cuotas ChatGPT.
5. Catálogo amplio, diagnósticos y paquete Electron.

Pruebas deterministas: rutas/prefijos/tres protocolos; streaming y firmas;
OAuth éxito/cancelación/expiración/callback inválido/puerto ocupado/renovación
concurrente/reinicio/logout; cuotas ausentes/0/100/múltiples bolsas/decimales/
datos inválidos; aislamiento de cuentas/productos; migración; teclado/temas/
ventana estrecha. Smoke real con historial sintético y presupuesto acotado.

Terminado exige cuotas Go automáticas con la conexión existente, suscripción
ChatGPT utilizable dentro de Rinari con límites, Claude configurable y continuidad
correcta, capacidades transportables, rutas probadas, ausencia de cuotas explícita
y conexiones anteriores funcionando tras migración/empaquetado.

Sin rotación automática, compras, sobreconsumo, canje de resets ni cookies.

## Fuentes de la revisión

- [Go usage](https://github.com/anomalyco/opencode/blob/dev/packages/console/app/src/routes/zen/go/v1/usage.ts)
- [Hermes account usage](https://github.com/NousResearch/hermes-agent/blob/main/agent/account_usage.py)
- [OpenAI auth](https://developers.openai.com/codex/auth) y [App Server](https://developers.openai.com/codex/app-server)
- [Claude effort](https://platform.claude.com/docs/en/build-with-claude/effort)
- [Gemini compatible](https://ai.google.dev/gemini-api/docs/openai)
- [OpenRouter limits](https://openrouter.ai/docs/api_reference/limits) y [credits](https://openrouter.ai/docs/api/api-reference/credits/get-remaining-credits)
- [DeepSeek balance](https://api-docs.deepseek.com/api/get-user-balance/)
- [Kimi Coding](https://www.kimi.com/code/docs/en/)
- [models.dev](https://models.dev/api.json)

## Resultado de implementación

Cambios coordinados en Rinari-CLI y Rinari-Agent, conservando los cambios ajenos
que ya estaban presentes en el escritorio. No se creó un segundo runtime.

- Engine publica 24 presets y un resolver compartido de capacidades, con una
  instantánea de 916 entradas de modelos para 20 productos. El descubrimiento
  del destino y los overrides guardados prevalecen sobre esa instantánea.
  `scripts/update-provider-metadata.py` permite actualizarla explícitamente al
  preparar una entrega, sin enviar credenciales a models.dev.
- GLM-5.3-Flash de Go detecta 1.000.000 tokens de contexto y visión. Las modalidades
  anunciadas se conservan separadas de las que Rinari puede transportar.
- URLs de Messages sin duplicar `/v1`; selección de Chat/Responses/Messages para
  Go y Zen; afinidad de sesión. Los modelos Zen que requieren Google nativo
  aparecen como no compatibles y se rechazan antes del envío.
- Claude recibe pensamiento adaptativo o presupuesto legacy según modelo.
  Firmas y bloques se conservan en streaming, almacenamiento y forks, ligados a
  proveedor, endpoint y modelo. No aparecen en snapshots ni exportaciones de UI.
  Gemini preserva firmas de herramientas en la API compatible.
- Servicio independiente de cuotas para Go, OpenRouter, DeepSeek y ChatGPT:
  datos desconocidos explícitos, importes decimales, alcances separados, caché,
  datos antiguos con fecha, timeout y backoff. Un límite de inferencia invalida
  la caché para la siguiente consulta visible, respetando la espera del servicio.
- Consumo local por proveedor a partir de eventos nuevos identificados. No se
  atribuye retroactivamente el histórico sin identidad. Las llamadas auxiliares
  sin evento de consumo no forman parte de ese total; la interfaz lo explica.
- ChatGPT: PKCE con callback local y device flow, renovación coordinada entre
  procesos y un solo reintento de autenticación antes de emitir salida.
  Copilot: device flow, selección por `supported_endpoints` y cabeceras específicas
  para Chat, Responses y Messages. La compatibilidad actual usa directamente el
  token OAuth de GitHub, conforme a la implementación pública revisada, en lugar
  de un intercambio antiguo de token de servicio.
- Interfaz con resumen de cuota, producto/modelos/cuenta cuando están disponibles,
  pestañas Conexión/Modelos/Uso y límites/Diagnóstico, login externo y código de
  dispositivo. Se mantiene el catálogo anterior para motores antiguos; el detalle
  nuevo se habilita con las capacidades anunciadas por el Engine.
- Migraciones aditivas `0033` (continuaciones) y `0034` (índice de consumo).
  Se conservan credenciales, IDs, aliases, sesiones y overrides explícitos.

### Evidencia de validación

- Suite de frontend completa: **924 pruebas**, seguida de verificaciones dirigidas
  de proveedores/composer/puente y **2 pruebas nuevas de login**.
- Motor: **249 pruebas dirigidas** de proveedores, autenticación, modelos,
  contexto, sesiones/forks y esquema de protocolo.
- TypeScript, compilación Vite, compilación y tipos Electron, Ruff y comprobación
  de paridad del puente. Los tipos se generan desde el esquema local del Engine.
- Arranque real Electron: renderer `app://rinari`, puente disponible, sin acceso
  accidental a Node. Ese smoke comprueba el host; no simula una conversación.
- Wheel del motor construido, con metadatos y migraciones incluidos. Contrato
  NDJSON ejercitado desde el wheel extraído en directorio temporal: info, catálogo,
  alta local, uso local, diagnóstico, alta OAuth y estado desconectado; sin red.
- Revisión visual en oscuro/claro y contenedor de 360 px; navegación con flechas.
- Consulta real de Go con la credencial existente, sin inferencias ni cambios de
  configuración: estado disponible, tres ventanas y reinicios. Snapshot observado
  el 22/09: 100% restante rolling, 99% semanal y 36% mensual. Son datos de esa
  consulta, no valores fijos ni garantía del saldo actual.

### Límites de aceptación pendientes

1. **Login e inferencia reales de ChatGPT/Copilot**: los ciclos se verificaron con
   transportes simulados. Hace falta iniciar una cuenta desde Rinari para validar
   permisos, modelos habilitados y streaming real de esa suscripción. No se
   importaron sesiones de otras aplicaciones ni cookies.
2. **Inferencia real por proveedor**: la batería cubre las familias y rutas con
   fixtures; no acredita disponibilidad comercial ni todos los modelos de cada
   cuenta. No se realizaron inferencias de pago.
3. **Release integrado**: no se modificó el pin preexistente `40c0089` del Engine,
   asociado al trabajo de Flow. Primero deben publicarse/fusionarse los cambios
   del motor, fijar el SHA alcanzable y volver a generar el contrato y empaquetar
   Electron. El instalador existente todavía no contiene esta entrega.
4. **Actualización del catálogo**: la instantánea incluida es de esta entrega;
   las capacidades recibidas del endpoint se actualizan al descubrir/refrescar.
   No existe descarga periódica automática del catálogo externo.

Durante desarrollo, `RINARI_ENGINE_SCHEMA` debe apuntar al
`src/rinari/engine_protocol/schema/v1.json` del checkout local al ejecutar
`protocol:generate` o `protocol:check`. La comprobación contra el pin publicado
pertenece al cierre de release, no se ha falseado con un SHA sin publicar.

Referencias adicionales de compatibilidad revisadas:

- [Kimi: endpoint global de Coding](https://www.kimi.com/code/docs/en/kimi-code-cli/configuration/env-vars)
- [Copilot: autenticación y cabeceras en OpenCode](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/plugin/github-copilot/copilot.ts)
- [Copilot: descubrimiento de rutas y capacidades](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/plugin/github-copilot/models.ts)
