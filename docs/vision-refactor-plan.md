> Documento histórico. La política vigente y su validación están en [vision-hermes-refactor.md](vision-hermes-refactor.md).

# Corrección integral de visión

Estado: implementado localmente. Sustituye las reglas de confirmación del diseño anterior.
Validación y límites: [vision-refactor-validation.md](vision-refactor-validation.md).
Caso de regresión: ses_01M2BNPSST50DRC83GDM23T67T.

## Diagnóstico comprobado

La decisión visual está duplicada en Composer, preparación de adjuntos del servidor,
AgentLoop, CLI, fs.read_image y VisionCaller. Los indicadores allow_unconfirmed_vision,
confirmed_for_session, vision_allowed y confirm_unknown mezclan capacidad y autorización.
VisionCaller.capabilities también presenta visión efectiva como capacidad del modelo
principal. Esto hace difícil explicar qué modelo recibe realmente la imagen.

La sesión de referencia no tenía modelo dedicado configurado ni capacidad declarada
en su modelo principal. El sistema bloqueó la lectura antes de intentar el transporte.
Buscar o activar herramientas no podía resolver esa condición. Las pruebas anteriores
comprobaban ese bloqueo; no demostraban la experiencia ahora acordada.

## Comportamiento que debe quedar fijado

No habrá confirmaciones visuales por mensaje, adjunto o sesión. Tampoco un checkbox
para aceptar capacidades desconocidas en Ajustes. Seleccionar la ruta visual será
suficiente. Las autorizaciones existentes de lectura de archivos siguen siendo
independientes: un archivo externo al workspace conserva su política de acceso.

| Modo | Comportamiento |
|---|---|
| Automático | Intentar el modelo principal si declara visión o su capacidad es desconocida. Si declara que no tiene visión, usar el dedicado configurado. |
| Dedicado | Enviar las imágenes únicamente al proveedor/modelo elegido; entregar su análisis al principal. |
| Conversación | Usar únicamente el principal; una capacidad desconocida permite intentar el envío. |

En automático, un rechazo inequívoco de contenido visual permite un único intento
con el dedicado, si existe y es distinto. No cambiar de proveedor ante un timeout,
error de autenticación, cuota, cancelación o error genérico. En modo dedicado no
volver silenciosamente al principal. No convertir imágenes a OCR silenciosamente.

Cuando no exista ruta utilizable, mostrar un error accionable hacia Ajustes y
permitir que el modelo explique el bloqueo. No encadenar búsquedas o reintentos
de la misma operación visual fallida.

## Refactor propuesto

1. Introducir un resolvedor único del motor. Recibe modo, configuración, modelo
   principal, capacidades declaradas y evidencia de rechazos; devuelve una decisión
   tipada con destino, alternativa permitida y motivo. Es puro y no realiza red.
2. Separar carga de imágenes, resolución de ruta y ejecución visual. Reutilizar
   Artifact Store, ImageReference y ModelRouter. No añadir otro runtime ni credenciales
   en prompts. No falsear la capacidad intrínseca del modelo principal.
3. Hacer que adjuntos, fs.read_image, CLI y agentes usen esa misma decisión. Code
   consulta el resultado del motor y lo presenta; no vuelve a calcularlo con su catálogo.
4. Sustituir los booleanos de confirmación por estados explícitos de ruta y error.
   Mantener temporalmente campos antiguos del protocolo como obsoletos e ignorados;
   no reinterpretar sus valores como una capacidad real. Preservar historial y artefactos.
5. Fijar una decisión por operación visual. Cambiar Ajustes afecta a la siguiente
   operación, sin modificar el destino de una petición en vuelo. Evitar estados
   mutables compartidos entre el padre y agentes concurrentes.

## Errores, repetición y recuperación

Los adaptadores distinguirán rechazo de visión, configuración ausente, autenticación,
límite de servicio, timeout, transporte y cancelación. Conservar código, proveedor y
mensaje seguro del error original. Un HTTP 400 aislado no prueba ausencia de visión.

Registrar rechazos visuales con alcance de proveedor, endpoint, modelo y revisión de
configuración; invalidarlos al cambiar esa identidad. No etiquetar globalmente un
modelo como incapaz por un fallo transitorio. Definir expiración y reintento explícito.

El motor limitará los intentos de la misma operación: mismo turno, imagen, pregunta y
ruta. Un fallo determinista no se vuelve a ejecutar mientras esas condiciones no cambien.
El resultado incluirá motivo y acción requerida. Integrar esa condición con el
gobernador para evitar que múltiples búsquedas de capacidades aparenten progreso
indefinidamente después del bloqueo. No aumentar umbrales ni detener trabajo distinto
que sí esté produciendo resultados. La guía general permanece fuera del alcance.

## Presentación y persistencia

Retirar botones, banners y parámetros de confirmación visual en Code y CLI.
Mostrar destino efectivo sin bloquear por metadatos desconocidos. Conservar miniaturas,
ampliación y borradores al fallar. Estados: cargando archivo, analizando, completado,
fallido y cancelado. Cargar el archivo no equivale a completar el análisis.

Conservar pregunta, destinatario, resultado y procedencia. Una operación tiene un
identificador estable y sus intentos tienen identificadores propios; no utilizar la
clave de caché como identidad de ejecución. Al recargar, reconstruir estados sin
duplicar tarjetas ni dejar operaciones terminales como ejecutándose.

Revisar claves de caché, límites, contabilidad, cancelación y cierre de conexiones.
La caché solo reutiliza la misma consulta y contenido con igual modelo/configuración.
Contabilizar cada intento real, incluyendo la alternativa. Los fallos de observabilidad
no deben provocar reenvíos de imágenes. Mantener límites explícitos y coste desconocido
cuando falten precios, sin desactivar restricciones monetarias existentes.

## Validación que condiciona la entrega

- Primero escribir regresiones que fallen con el código actual: modelo desconocido,
  sin vision.json, sin confirmaciones, tanto adjunto como imagen de carpeta.
- Cubrir los tres modos y capacidades sí/no/desconocida; dedicado válido, ausente,
  eliminado y del mismo modelo; cambios de sesión, modelo, endpoint y configuración.
- Simular rechazo visual real, 400 ajeno a visión, 401, 429, timeout y cancelación.
  Comprobar destinatarios y número exacto de peticiones; alternativa como máximo una vez.
- Verificar bytes visuales en el adaptador real con transporte simulado; comprobar
  que el principal no recibe imágenes en dedicado y que no se pierden silenciosamente.
- Probar recarga, operaciones repetidas, caché, preguntas nuevas, Unicode, permisos
  de lectura, archivos eliminados tras importar, límites y aislamiento entre agentes.
- Reproducir la secuencia de búsquedas de la sesión problemática y comprobar que
  un bloqueo determinista termina en una explicación, sin destruir progreso válido.
- Probar Code → Rust → motor → adaptador y CLI con la misma configuración. Comprobar
  ausencia de confirmaciones en el DOM, funcionamiento desde chat nuevo y borradores.
- Ejecutar protocolo, pruebas pertinentes y compilaciones antes de empaquetar.
- Verificar en Windows el paquete final. Hacer una prueba real con el proveedor
  configurado para adjunto y carpeta, usando una imagen de prueba conocida. Registrar
  modelo, resultado y errores; no equiparar esa prueba con dobles de transporte.

## Orden de ejecución y cierre

Regresiones → resolvedor y errores → integración motor/CLI/agentes → protocolo y Code
→ revisión del diff y regresiones → paquete y prueba real.

Se considera resuelto cuando la sesión equivalente sin configuración previa intenta
visión desconocida sin confirmación, adjuntos y herramientas siguen la misma política,
los fallos tienen recuperación acotada y el paquete final reproduce esos resultados.
No se promete ausencia universal de errores del proveedor: se exige que el harness
los gestione correctamente y sin vueltas improductivas.

Sin commit, push ni publicación dentro de este plan. Preservar cambios locales y
no modificar la sesión de referencia durante las pruebas.
