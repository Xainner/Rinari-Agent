# Rinari Gateway: al día con el Engine, conexión remota y web nueva

Estado: **Fuera de la 0.4.0** (dueño, 2026-10-15): se retoma cuando el dueño lo tenga listo. Las preguntas quedaron respondidas abajo. Antes: **borrador** (2026-10-12). Lo pidió el dueño al diseñar [Rinari Agency](idea-rinari-agency.md): la Agency necesita poder correr 24/7, y la web del Gateway también hay que cambiarla. Repo: `Documents/DEV/Apps/Rinari-Gateway`.

**Decisión del dueño (2026-10-16):** todo lo de la Agency que necesita el servidor vive en este plan, no en el de la Agency (D-9 de [idea-rinari-agency.md](idea-rinari-agency.md)): la Agency 24/7, los disparadores de correo, Telegram y webhooks, «Detener a todos» desde Telegram y la conexión remota de la app. En la PC, la Agency solo usa el reloj, los archivos, el CI, y el reloj con un MCP. Ver el punto 4 y G3.

## Qué hay hoy (verificado)

- **El Gateway ya corre el mismo Engine que la CLI y el Agent.** Lo fija en `config/engine-pin.json` (repositorio `Rinari-CLI`, commit, protocolo y capacidades requeridas) y le habla por stdio: `src/rinari_gateway/engine.py` es «un cliente stdio; solo transporte, nunca lógica del harness». El Engine se instala como un paquete (bundle) construido desde el commit fijado (`docs/engine-distribution.md`).
- **El atraso es el pin:** `ad78f3a` (CLI #54, 2026-10-08). El CLI va en `178d75c` (#73) y el Agent fija `2a94168` (#71). Saturno corre `0.1.0a40`.
- **Encima del Engine, el Gateway tiene lo suyo:** canales (Telegram, Discord, WhatsApp), la web (panel, chat, Obsidian, automatizaciones), el vault de Obsidian como MCP (`rinari-vault-mcp`), y además **sus propias automatizaciones, planificador, trabajos y memoria** (`automations.py`, `scheduler.py`, `jobs.py`, `memory.py`), que en parte duplican lo que el Engine ya tiene (tareas programadas, memoria).

## Propuesta

1. **Pin al día, como rutina.** Cada vez que se fusiona un cambio del Engine que el Agent adopta, el Gateway sube su pin al mismo commit (con su bundle y sus pruebas). Una lista de comprobación en el repo del Gateway para que no se vuelva a atrasar.
2. **Qué vive dónde.** Regla: **la lógica del agente y del trabajo vive en el Engine**; el Gateway se queda con **canales, web, Obsidian y la operación del servidor**.
   - Revisar una por una sus automatizaciones, planificador, trabajos y memoria: lo que el Engine ya hace (tareas programadas, memoria) se usa del Engine; lo que solo existe en el Gateway y sirve a todos (por ejemplo, horarios tipo cron, trabajos durables) se sube al Engine, para que el escritorio y la Agency también lo tengan.
3. **Conexión remota al Engine.** El Gateway ofrece un punto de conexión **seguro** (TLS, emparejamiento con código o QR, token revocable) por el que la app de escritorio, y mañana la móvil, hablan con **el Engine del Gateway** con el mismo protocolo que usan con el Engine local. En la app: «Conectar a mi servidor».
4. **La Agency en el servidor.** Con 1–3, la Agency corre 24/7 en el Engine del Gateway; los canales del Gateway (Telegram, correo, webhooks) son sus disparadores y sus salidas. Lo que trae la depuración de la Agency (2026-10-16):
   - **Disparadores que solo existen aquí:** correo, Telegram y webhooks. Un webhook necesita la dirección pública que tiene el servidor, y un mismo bot de Telegram admite un solo programa que reciba sus mensajes: el que escucha es el del Gateway, nunca la PC a la vez.
   - **Agentes con disparador externo:** nacen con el interruptor «Preguntar antes de enviar datos a destinos nuevos» encendido (D-6 de la Agency). La pregunta debe poder responderse desde Telegram, no solo desde la app.
   - **«Detener a todos» desde Telegram**, además de desde la app.
   - **Credenciales con dueño** (D-11 de la Agency): se usa el almacén del Engine, que guarda referencias y nunca valores (`application/credentials.py` del repo de la CLI). En el servidor Linux hay que comprobar con qué respaldo se resuelven: el Administrador de credenciales de Windows no existe allí.
   - **La vista Normal de la Agency** (chats, pizarra, registro) es lo primero que se ve desde la app conectada y desde la web (punto 5). La vista de 8 bits llega cuando la Agency la tenga (fase A4, sin fecha).
5. **Web nueva.** La web del Gateway se rediseña con el sistema Obsidiana neón del Agent y suma lo que hoy solo está en el escritorio que tenga sentido en el servidor (la Agency, sus recados, sus registros). Alcance a definir con el dueño.

## Orden

| Paso | Qué |
|---|---|
| G0 | Pin al día y la lista de comprobación |
| G1 | «Qué vive dónde»: inventario de automatizaciones, planificador, trabajos y memoria del Gateway frente al Engine |
| G2 | Conexión remota segura al Engine |
| G3 | La Agency 24/7 en el servidor, con sus disparadores de correo, Telegram y webhooks y «Detener a todos» desde Telegram (punto 4). Necesita al menos la fase A1 de la Agency |
| G4 | Web nueva |

## Preguntas para el dueño (respondidas, 2026-10-15)
1. ¿Qué cambios quieres en la web del Gateway: solo el estilo, o también lo que muestra (la Agency, los recados)? → **Las dos cosas**: estilo nuevo, y además la Agency y los recados.
2. ¿La app de escritorio debe poder trabajar con **los dos** Engines a la vez (el local y el del servidor), o con uno a la vez? → **Uno a la vez**, con un cambio rápido entre ellos.
3. ¿El pin del Gateway se sube junto con el del Agent en cada versión, o con su propio ritmo? → **Junto con el del Agent**, como el pin del Engine.
