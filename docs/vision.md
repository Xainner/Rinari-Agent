# Visión: cómo ve imágenes Rinari

Cómo funciona hoy (0.3.1, Engine 2a94168), comprobado contra el código el
2026-10-12. Sustituye a los cinco documentos de septiembre que ahora están en
[historia/vision/](historia/vision/). El detalle de concurrencia y
`model-execution.json` está en `docs/vision-execution.md` de Rinari-CLI. Las
rutas del Engine son relativas a `src/rinari/` de Rinari-CLI.

## Por dónde entra una imagen

- **Adjuntos del composer:** el botón de adjuntar (diálogo nativo), pegar o
  arrastrar al chat, y `@archivo` del proyecto. Cada adjunto se prepara en el
  Engine (`attachment.prepare`, `artifacts/attachments.py`): se copia al
  almacén de artefactos y se valida antes de empezar el turno, así que una
  imagen rota se rechaza al adjuntarla. El usuario elige si una imagen se lee
  como imagen, como texto (OCR) o como las dos cosas; con solo OCR, los
  píxeles no llegan al modelo. Un PDF puede mandar páginas como imagen.
- **Herramientas:** `fs.read_image` (una ruta local, que pasa por la política
  de lectura, o un `artifact://` de la sesión) y `fs.read_pdf_pages` (hasta 4
  páginas por llamada). Sus imágenes se añaden al historial del turno.
- **Capturas del navegador:** `browser.screenshot` guarda el PNG como
  artefacto y devuelve su referencia, **pero no entrega los píxeles**. Para
  verla, el modelo tiene que llamar después a `fs.read_image`.

## Cómo se decide si el modelo ve

La capacidad `vision` de un modelo sale de, en orden de menor a mayor
prioridad: el catálogo de models.dev, lo que guardó «Actualizar modelos» y lo
declarado en el registro (`providers/metadata.py`, `effective_metadata`).
Encima de todo manda `~/.rinari/vision.json` → `model_overrides`, que escriben
el dueño (`rinari vision capability <modelo> auto|supported|unsupported`) y el
propio Engine cuando un modelo rechaza imágenes. Si no se sabe, la visión es
«desconocida», nunca un «no» inventado.

La ruta la decide una sola función, `runtime/vision.py`
`resolve_visual_route`, con el modo de **Ajustes → Visión e imágenes**:

| Modo | Qué hace |
|---|---|
| Automático (por defecto) | Si hay un modelo auxiliar elegido, lo usa **siempre**, aunque el de la conversación vea. Sin auxiliar, manda la imagen al modelo de la conversación solo si declara visión; si es desconocida o no ve, no hay ruta. |
| Auxiliar | Solo el auxiliar. Sin él, no hay ruta. |
| Nativo | Manda siempre los píxeles al modelo de la conversación. |

El composer pregunta la ruta antes de enviar (`session.image_support`) y
muestra qué modelo va a mirar la imagen.

## Qué pasa si el modelo no ve

- **Con auxiliar:** el auxiliar analiza cada mensaje con imágenes, con la
  pregunta del usuario (o la de `fs.read_image`), y el modelo principal recibe
  solo ese texto, marcado como dato no confiable. El análisis se guarda como
  artefacto y se reutiliza si la pregunta y el modelo son los mismos. Cuenta
  en el presupuesto como uso sin precio.
- **Sin ruta:** el composer explica el motivo y desactiva Enviar. Si el modelo
  llama a `fs.read_image` a mitad de turno, la siguiente llamada al modelo
  falla y **el turno termina con error**.
- **En Nativo, si el proveedor rechaza la imagen:** se repite la llamada una
  vez sin imágenes y la app muestra «Este modelo no puede ver imágenes; siguió
  sin ellas». El modelo queda marcado sin visión en `model_overrides` **para
  siempre**; se quita a mano con `rinari vision capability <modelo> auto`.
  Cuenta como rechazo un error que diga que no admite imágenes y también un
  400 sin detalle mientras la visión es desconocida.

No hay OCR automático de respaldo ni paso automático al auxiliar después de un
rechazo.

## Límites

- PNG, JPEG y WebP de un solo cuadro. Antes de cada envío se recodifican a
  JPEG de calidad 90 y como máximo 2048×2048 px (`models/images.py`).
- 10 MiB y 40 MP por imagen; 50 MiB de imágenes por petición, o lo que declare
  el proveedor. Si no cabe, se retiran primero las imágenes de mensajes
  anteriores; si aun así no cabe, el error es explícito. Se ajustan con
  `RINARI_MEDIA_*` (`artifacts/limits.py`).
- 8 adjuntos por mensaje, 50 MiB en total y 25 MiB por documento.
- No hay un tope fijo de imágenes por petición (el antiguo «cuatro» ya no
  existe); un máximo solo se aplica si el proveedor o el modelo lo declaran.

## Sesiones guardadas

Los originales son artefactos inmutables de la sesión; el historial guarda
solo su referencia y su SHA-256. Al reabrir una sesión, si falta un original,
la imagen se retira y queda una nota en su lugar. Los análisis auxiliares que
quedaron a medias por un cierre se marcan como fallidos al arrancar.

## Huecos conocidos

- Un 400 aislado puede dejar un modelo «sin visión» para siempre, y el aviso
  no dice quién puso la marca ni deja quitarla desde la app.
- La nota que sustituye a una imagen retirada invita a releerla y no le dice
  al modelo que no la vio.
- «Actualizar modelos» no lee la visión de los endpoints compatibles con
  OpenAI ni de Anthropic, así que quedan en «desconocida».
- `browser.screenshot` necesita dos llamadas para que el modelo vea la
  captura.
- Dos imágenes pegadas se llaman igual (`image.png`) y la segunda se descarta
  sin aviso.
- Hay dos sitios para marcar si un modelo ve (`model.capabilities.vision` y
  `model_overrides`) y la app no deja editar ninguno.
- Restos sin uso en el Engine: `application/vision_consent.py`, los
  parámetros `allow_unconfirmed_vision` y `confirm_unknown`, `main_rejected`
  (nadie lo pasa) y rutas de tesseract de la época Tauri en
  `artifacts/ocr.py`.

El plan de la 0.3.2 (rama `0.3.2`, `docs/planes/plan-0.3.2.md`) ataca casi
todos: el #14 deja de marcar un modelo por un 400 sin detalle, aprende
también cuando un modelo sí ve, guarda el origen de cada marca con un botón
para reactivar la visión y hace que «Actualizar modelos» lea la visión; el #11
adjunta la captura del navegador si el modelo ve; el #15 rehace las tarjetas
de imagen y visión con i18n; y el #18 arregla los adjuntos pegados.
