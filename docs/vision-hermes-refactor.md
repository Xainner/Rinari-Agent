# Visión por mensaje: implementación de referencia Hermes

Estado: implementado localmente; sin commit, push ni publicación. Fecha: 2026-09-12.
Este documento sustituye las políticas visuales anteriores de Rinari.

## Referencia fijada

Hermes: `d595e636c83aa0b9606d4e914e1140ae9c796897`, inspeccionado en su repositorio oficial.

| Referencia | Adaptación en Rinari |
| --- | --- |
| [image_routing](https://github.com/NousResearch/hermes-agent/blob/d595e636c83aa0b9606d4e914e1140ae9c796897/agent/image_routing.py) | Decisión única: auxiliar explícito tiene prioridad en automático; desconocido requiere auxiliar o configuración; nativo explícito fuerza envío. |
| [vision_tools](https://github.com/NousResearch/hermes-agent/blob/d595e636c83aa0b9606d4e914e1140ae9c796897/tools/vision_tools.py) | fs.read_image carga originales; el adaptador entrega píxeles o el motor produce una observación auxiliar asociada a esa llamada. |
| [context_compressor](https://github.com/NousResearch/hermes-agent/blob/d595e636c83aa0b9606d4e914e1140ae9c796897/agent/context_compressor.py) | Separación entre retirada de herramientas en cada envío y retirada de adjuntos durante compactación. Rinari protege el lote completo más reciente para comparaciones. |

## Flujo implementado

- Originales inmutables en Artifact Store, asociados al mensaje y la llamada.
- Nativo incorpora píxeles al mensaje; no emite tarjetas vision.started/completed.
  VisualPixelsDelivered registra transporte aceptado, sin afirmar comprensión.
- Auxiliar procesa exactamente un mensaje por operación. La pregunta procede de
  display_content o del argumento de la herramienta, nunca de todo el historial.
- Los derivados tienen origen estable y clave de consulta/destino/opciones. La
  reproducción busca resultados existentes, sin llamadas nuevas por contenido
  histórico. Cambiar el modelo no vuelve a procesar los adjuntos anteriores.
- La proyección retira lotes visuales de herramientas superados y conserva handles
  privados que permiten recuperar derivados. Durante compactación se retiran los
  adjuntos anteriores al último mensaje del usuario con imágenes. Se conserva el
  historial persistido. Los mensajes internos del gobernador no son nuevos inputs
  del usuario ni cambian el origen de una consulta visual.
- Anthropic recibe imágenes en tool_result. Chat/Responses reciben una observación
  multimodal después del lote, con identificadores de las herramientas originales.

## Límites y configuración

Eliminados los cupos de cuatro de preparación, herramientas, recarga, proyección,
selección PDF, esquema y compositor. Se conservan límites de importación y de
preparación documental; no equivalen a un límite vitalicio de la sesión.

ModelRouter valida `vision_limits.max_images` solo si está declarado por la
configuración del proveedor/modelo. `vision_limits.max_encoded_bytes` limita bytes
multimodales; sin declaración se utiliza el presupuesto de instalación
`RINARI_MEDIA_REQUEST_BYTES` (50 MiB por defecto). No se estiman tokens visuales
universales. Si el historial excede el límite de transporte, se aplica la misma
retirada de medios históricos antes de enviar: se conservan el último mensaje con
adjuntos y el lote visual más reciente de herramientas completo. Si estos exceden
el límite, se devuelve un error explícito sin recortarlos ni enviar la petición.

Configuración → Visión e imágenes permite Automático, Nativo y Auxiliar, y declarar
Automática/Compatible/No compatible para cada modelo. Los identificadores antiguos
conversation/dedicated se conservan; native/auxiliary son alias aceptados en CLI.
No se cambió la configuración de visión de las sesiones del usuario.

## Presentación y compatibilidad

La vista normal muestra adjuntos y llamadas reales, sin tarjetas de análisis nativo
ni preguntas internas. Proveedor/modelo/pregunta técnica se reservan a detalles.
Los eventos históricos nativos tampoco reaparecen como tarjetas o acciones contadas.
El protocolo incorpora origen, referencia de mensaje y llamada; los tipos TS/Rust
se generan desde el motor y el paquete exige `vision_message_routing_v3`.

Las confirmaciones antiguas permanecen aceptadas como obsoletas e ignoradas. Un
historial sin derivados recuperables conserva referencias en vez de iniciar una
consulta auxiliar durante la recarga.

## Validación

- Suite amplia del motor/CLI/agentes/adaptadores: 235 passed, 1 skipped.
- Suite posterior de contexto, adjuntos, medios y enrutamiento: 89 passed.
- Validación final de rutas, límites, contexto y adaptadores: 92 passed.
- Frontend: 38 passed en nueve archivos, incluyendo ausencia de datos internos y
  persistencia de la declaración de capacidad.
- Protocolo generado, TypeScript, build frontend y cargo check correctos.
- Integración Rust con motor empaquetado: 1 passed.
- Proveedor real qwen3.8-27b-uncensored en estado temporal con capacidad declarada:
  adjunto y fs.read_image respondieron rojo/azul, sin actividad de análisis nativo.
- Ruta auxiliar real desde el motor empaquetado con ese mismo modelo como auxiliar:
  ambas consultas terminaron; una operación auxiliar por consulta, sin reanalizar
  el adjunto histórico. No demuestra la calidad de otros proveedores/modelos.

Pruebas reales reproducibles con tests/manual/vision_smoke.py --session <id>;
--auxiliary verifica la ruta especializada. Solo se lee la selección del proveedor;
credenciales se referencian en memoria mediante variable de entorno, imágenes y
sesiones de prueba son temporales. No se alteró la conversación de referencia.

Se verificaron componentes y transporte, no una inspección manual de la ventana
Windows en esta sesión. Para probar la aplicación, reiniciar npm run tauri -- dev
es suficiente; el motor local empaquetado se actualiza con este trabajo.


## Política de ejecución posterior

Se eliminó el máximo auxiliar de 2048 tokens y se habilitó concurrencia por destino.
La política inicial general es 8 llamadas por destino, configurable en Visión e imágenes,
con Heredar por proveedor y salida por modelo. No representa slots del servidor.
Implementación, límites reales de cancelación y pruebas:
[Ejecución de visión](../../../Rinari-CLI/docs/vision-execution.md).


## Presentación agrupada del análisis auxiliar

La vista normal muestra una sola línea de progreso por turno mientras haya
análisis pendientes. El contador representa las imágenes de las operaciones
conocidas en ese momento, no un inventario de la carpeta. Al terminar correctamente
no se muestran tarjetas auxiliares. Las miniaturas de las lecturas y los adjuntos
originales permanecen en sus actividades/mensajes.

Errores, cancelaciones y resultados parciales se agrupan en un aviso desplegable
con las imágenes afectadas. Los estados pendientes de turnos históricos terminados
se presentan como interrumpidos, sin animación permanente. Al habilitar detalles
técnicos, un único desplegable conserva las operaciones individuales.

Cambio exclusivamente de presentación: no altera eventos, caché ni ejecución.
Validación: 35 pruebas de actividad, comprobación TypeScript y compilación frontend.
