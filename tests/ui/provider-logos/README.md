# Logos de proveedores

`npm run ui:e2e -- provider-logos` usa el Engine fijado por `engine-manifest.json`, un perfil/home temporal y el proveedor guionizado del arnés. `--keep` deja la ventana abierta.

El catálogo real debe coincidir con las 24 identidades cubiertas: 19 marcas y Custom neutro. Comprueba el asistente, variantes claro/oscuro a 26/14/12 px, ventana de 900 px al 125%, fallo real de carga y tamaño estable, formulario con alias personalizado, tarjetas, modelos, composer, Boards expandidos/colapsados y Flujos.

Los proveedores de prueba conservan los endpoints y tipos del catálogo para que el Engine resuelva su identidad real. Un proxy muerto bloquea esas conexiones, incluidos los puertos de los presets locales. Solo el puerto aleatorio del servidor guionizado queda exento. No se guardan secretos; los tipos que exigen API key usan una referencia a una variable de entorno de prueba sin valor. Las suscripciones quedan desconectadas. Custom sirve las respuestas locales.

Las capturas y `report.json` se guardan en `release/evidence/ui/provider-logos/` (ignorado). Las hojas de contacto clonan los logos ya renderizados del asistente, únicamente para inspeccionarlos juntos; las demás capturas son las vistas de producción.

El recorrido incluye un turno que falla de forma intencional al bloquear el endpoint de Ollama, seguido de una respuesta correcta de Custom. Esto permite verificar el logo del ejecutor en Flujos sin consultar un proveedor real. El modelo global queda en Custom para la revisión manual.
