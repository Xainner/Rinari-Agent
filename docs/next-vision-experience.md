> Documento histórico. La política vigente y su validación están en [vision-hermes-refactor.md](vision-hermes-refactor.md).

# Visión configurable

Estado: implementado localmente en el motor/CLI y Rinari Agent.

Añadir Configuración → Visión e imágenes, con tres modos:

- Automático: usar la visión del modelo de conversación cuando esté disponible;
  de lo contrario, consultar al proveedor/modelo visual configurado.
- Modelo visual dedicado: dirigir las consultas visuales al especialista elegido.
- Modelo de la conversación: usar únicamente su visión e informar si no está disponible.

El motor será la autoridad de selección, permisos, envío, persistencia y ejecución.
Reutilizar los proveedores y adaptadores existentes; no añadir otro runtime.
Conservar la herramienta para archivos locales y nuevas consultas sobre artefactos.

Unificar la presentación de adjuntos y llamadas visuales: miniatura ampliable,
estado de procesamiento y detalles del modelo receptor, pregunta y resultado.
Distinguir envío de píxeles, análisis recibido y llamada real de herramienta.
No afirmar comprensión visual verificada solo por haber enviado una imagen.

Las consultas al especialista deben responder a la tarea concreta y permitir
preguntas posteriores sobre la imagen original. Conservar procedencia y referencias
estables; reutilizar resultados solo cuando imagen, modelo y consulta lo permitan.

Hacer visible el proveedor de destino. No duplicar por defecto el envío al modelo
principal y al especialista. Mantener los límites de imágenes, cancelación y
permisos de lectura de archivos. No hay confirmaciones visuales. La capacidad
desconocida permite intentar el envío; no altera la capacidad declarada del modelo.

Validar modelos con y sin visión, cambios de modelo y sesión, persistencia,
errores del especialista, consultas posteriores y presentación de actividad.

## Uso

En Rinari Agent: Configuración → Visión e imágenes. Seleccionar modo y modelo,
guardar sin confirmaciones de capacidad desconocida. El compositor
muestra el destino visual. Las tarjetas «Análisis visual» conservan la pregunta,
el modelo y la respuesta del especialista, además de miniaturas ampliables.

CLI usa la misma configuración:

```text
rinari vision show
rinari vision set dedicated --model <alias-o-id>
rinari vision set automatic --model <alias-o-id>
rinari vision set conversation
```

El motor guarda la selección en vision.json, sin credenciales. Las consultas
especializadas usan ModelRouter y sus adaptadores existentes. La caché vive en
artefactos de la sesión y distingue imagen, consulta completa, modelo, revisiones
de configuración y opciones. Una pregunta nueva consulta de nuevo el original.
No se reescriben mensajes históricos ni se añaden llamadas ficticias a herramientas.

Los tokens y llamadas auxiliares cuentan en el presupuesto y sus eventos incluyen
el modelo real. Los precios auxiliares todavía no están resueltos: el coste total
se declara desconocido, y una restricción monetaria explícita bloquea la ruta
especializada. La cancelación impide entregar el resultado o continuar con otra
llamada; el transporte HTTP ya iniciado puede tardar en finalizar internamente.

Validación con imágenes sintéticas y proveedores simulados, pruebas de actividad,
configuración, cancelación, caché, presupuestos y puente Rust con motor empaquetado.
También se verificó el proveedor real con capacidad desconocida, tanto desde fuentes
como desde el motor empaquetado: adjunto y fs.read_image reconocieron los colores de
una imagen sintética. La ruta dedicada se verificó con dobles de proveedor; no se
presenta como una prueba real de calidad del especialista.

Automático permite un único fallback ante rechazo explícito de imágenes, nunca ante
autenticación, límites, timeout o después de recibir contenido parcial. El rechazo se
recuerda durante diez minutos por identidad de configuración; guardar ajustes permite
un nuevo intento. Los resultados derivados tienen referencias inmutables, incluso
cuando agentes consultan simultáneamente una misma imagen.

La guía general de herramientas queda para el siguiente trabajo. Los hallazgos
sobre credenciales históricas y permisos de red son una auditoría pendiente aparte;
no se han modificado registros ni secretos de la sesión analizada.

La sesión `ses_01M2BK1WFW832K1Z71B23VZ87M` sirve como caso de referencia:
improvisó un especialista visual mediante script. Incorporar en la revisión
los hallazgos de `session-vision-recovery-analysis.md`: credenciales, alcance de
aprobaciones, contabilidad de consultas y detector de bucles ante nuevo progreso.
