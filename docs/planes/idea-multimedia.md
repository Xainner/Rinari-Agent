# Multimedia en Rinari Agent: crear y editar imágenes (y después audio y video)

Estado: **idea en análisis** (Planka, Ideas-2, 2026-10-13). No es parte de la 0.3.2 salvo que el dueño lo diga.

## Qué se pidió

Validar qué tan posible es darle a Rinari **un set de herramientas para crear y editar imágenes**, con conectores elegibles en **Ajustes → Visión e imágenes → Creación de imágenes**: GPT Images por API, Codex CLI con la suscripción de ChatGPT (la propia o la del proveedor), otros servicios de valor, y **MCPs asignados** para eso (como Rinari Visual Lab, que ya crea y edita imágenes). Después, lo mismo para **audio y video**.

## Qué hay hoy

- Rinari **ve** imágenes (`fs.read_image`, captura del navegador, adjuntos, visión por modelo en Ajustes → Visión e imágenes), pero **no crea ni edita** ninguna por sí mismo.
- Ya lo hacemos por fuera: el arte de Rinari sale de **Codex CLI** (skill `rinari-promo`, suscripción de ChatGPT), y la sesión de Visual Lab mostró que un **MCP de medios** funciona (con los arreglos del #48 de la 0.3.2: progreso, descargas grandes, salidas fuera de esquema).
- Mostrar el resultado al dueño depende del `file.present` del #35.

## Referencia: Hermes Agent

Hermes trae creación de imágenes integrada a través de **FAL.ai**: una sola clave da acceso a una lista de modelos (FLUX 2, Nano Banana Pro, GPT Image, Ideogram, Recraft, entre otros), se elige el modelo con `hermes tools` y queda en `config.yaml` (`image_gen`). Con la suscripción de Nous Portal, la misma función llega sin clave de FAL por su «Tool Gateway». También tiene una skill para **ComfyUI** (local). Fuente: [Hermes, Image Generation](https://hermes-agent.nousresearch.com/docs/user-guide/features/image-generation) (la página oficial puede estar desactualizada frente a la versión actual).

## Propuesta

### Herramientas (las mismas para cualquier conector)
- `image.generate({prompt, size?, count?, style?, references?})`: crear desde texto, opcionalmente con imágenes de referencia.
- `image.edit({image, prompt, mask?})`: editar una imagen existente (cambiar una parte, quitar o añadir algo, cambiar fondo).
- Después: `image.variations`, `image.upscale`, `image.remove_background`.
- El resultado es un **artefacto de la sesión** y se entrega con `file.present` (#35): tarjeta con miniatura, abrir en «Archivos», guardar en el proyecto.
- Rinari **revisa lo que generó** con su visión antes de entregarlo (como hacemos con el arte de Codex), y lo dice si no cumple.

### Conectores (Ajustes → Visión e imágenes → Creación de imágenes)
| Conector | Cómo | Notas |
|---|---|---|
| **OpenAI Images (API)** | Clave de OpenAI; modelos `gpt-image-*` | Crear y editar; buena calidad con texto en la imagen. |
| **Codex CLI con la suscripción de ChatGPT** | La suscripción propia o la que ya usa el proveedor de Codex | Sin costo por imagen aparte de la suscripción; más lento; es lo que usamos hoy para el arte. |
| **FAL.ai** | Una clave, muchos modelos (FLUX, Nano Banana, Ideogram, Recraft…) | El camino de Hermes; da variedad sin un conector por marca. |
| **Google (Gemini / Nano Banana)** | Clave de Google AI | Edición conversacional fuerte. |
| **OpenRouter** | Si el dueño ya lo tiene, los modelos que devuelven imágenes | Reusa la cuenta existente. |
| **Local: ComfyUI** | Un servidor ComfyUI en la PC o en la red (Saturno) | Sin costo por imagen, privado; necesita GPU. |
| **Un MCP asignado** | Cualquier servidor MCP con herramientas de imagen (por ejemplo Rinari Visual Lab) | Se mapean sus herramientas a `image.generate` / `image.edit`; nada específico de Visual Lab en el código (regla del dueño: nada hardcodeado). |

- Un conector **por defecto** y, si se quiere, uno distinto para editar.
- Cada conector muestra **costo estimado por imagen** cuando se conoce, y el uso entra en Uso y límites.

### Permisos y costo
- Generar cuesta dinero en la mayoría de conectores: en «Solo lectura» y «Proyecto» se pide confirmar (con el costo estimado); en «Acceso completo» no se pregunta, como todo lo demás (plan de permisos v4).
- Un tope opcional de gasto por sesión.

### Audio y video (fase posterior)
El mismo patrón de conectores:
- **audio:** voz, música y efectos (ElevenLabs, que ya usamos para los films; un MCP de medios), más la transcripción del #36;
- **video:** modelos de video vía FAL u otros, y MCPs como Visual Lab (que ya hace covers de canciones).

## Fases
1. **M1:** todas las herramientas de imagen (crear, editar, variaciones, escalar, quitar fondo), conectores OpenAI API, Codex CLI y FAL, entrega con `file.present`, confirmación con costo, sin conector por defecto.
2. **M2:** más conectores (MCP asignado, ComfyUI local, Google y OpenRouter) si no entraron en M1.
3. **M3:** audio (voz, música, efectos).
4. **M4:** video.

## Decisiones del dueño (2026-10-14)
1. **Versión:** pendiente de cerrar junto con el nombre de la versión (el dueño propone subir la 0.3.2 a **0.4.0**).
2. **Ningún conector por defecto.** Si no hay ninguno configurado, Rinari lo dice con honestidad («no tengo cómo crear imágenes; configura un conector en Ajustes → Visión e imágenes») y no improvisa con otras herramientas.
3. **La primera fase incluye todo lo de imágenes:** crear, editar, variaciones, escalar y quitar fondo (M1 y la parte de imágenes de M2 se juntan).
