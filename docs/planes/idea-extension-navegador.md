# Rinari en tu navegador: una extensión para Chrome y Edge

Estado: **idea aprobada para después de 0.4.0** (dueño, 2026-10-12). Todavía no es un plan.

## De dónde sale

Del #45 del [plan 0.4.0](plan-0.4.0.md): Cloudflare Turnstile y otras verificaciones humanas rechazan el navegador integrado de Rinari, porque es un navegador automatizado. Cambiar de motor (por ejemplo, a Firefox) no lo arregla. Disfrazar el navegador no se hace. Lo que sí sirve, para los sitios donde el dueño ya inició sesión, es que **el agente trabaje en el navegador de siempre del dueño**, como la extensión de Claude para Chrome.

## Qué sería

Una extensión para Chrome y Edge que conecta el navegador del dueño con el Engine de Rinari en su PC:
- el agente abre y usa **pestañas propias, agrupadas** (un grupo de pestañas «Rinari» con su color), en el navegador real del dueño, con sus sesiones ya iniciadas;
- en el panel lateral de Rinari, el Navegador muestra esa pestaña y lo que el agente hace;
- todo lo demás del navegador del dueño queda fuera del alcance del agente.

## Cómo encajaría

- **Extensión (Manifest V3)** con *native messaging* hacia un pequeño programa que instala Rinari y que habla con el Engine local. Nada pasa por internet.
- **En el Engine, un backend más** para el navegador (`browser/backend.py` ya define la interfaz `BrowserBackend`; hoy están el navegador integrado y el Chrome/Edge que lanza la CLI). Las herramientas del agente (`browser.*`) no cambian.
- **El dueño elige** en Ajustes → Navegador qué usa cada conversación o proyecto: el integrado, el Chrome/Edge con perfil de Rinari (#45) o «Mi navegador» (la extensión).

## Seguridad (no negociable)

- **Permiso por sitio.** La primera vez que el agente quiere entrar a un dominio, el dueño lo aprueba. Hay una lista de sitios que nunca se tocan (bancos y pagos, por defecto).
- **Solo sus pestañas.** El agente no lee ni toca las pestañas del dueño, ni el historial, ni las contraseñas guardadas.
- **Indicador siempre visible** de que Rinari está usando el navegador, y un botón para detenerlo al instante.
- **Las reglas de siempre siguen:** lo que viene de la web es dato, no instrucción (la guardia de contenido externo); lo irreversible (enviar, comprar, publicar, borrar) pide aprobación; las contraseñas y los datos de pago nunca los escribe el agente; las verificaciones humanas las resuelve el dueño.

## Preguntas abiertas

1. ¿Se publica en la Chrome Web Store y en la tienda de Edge (pasan revisión, se actualizan solas) o se instala en modo desarrollador al principio?
2. ¿Qué API usa la extensión para manejar la pestaña: `chrome.debugger` (como CDP, más potente, muestra el aviso «una extensión está depurando este navegador») o scripts de contenido (más limitados)?
3. ¿Cómo se ve la pestaña en el panel lateral de Rinari: capturas periódicas o solo un resumen con «Ir a la pestaña»?
4. ¿Firefox también, más adelante (su API de extensiones es parecida)?

## Siguiente paso propuesto

Una sesión de investigación, de solo lectura y con un informe, sobre cómo lo hacen la extensión de Claude para Chrome y otras parecidas, qué permite cada API, qué exige cada tienda y cuánto cuesta el MVP (una pestaña: navegar, leer, hacer clic y escribir).
