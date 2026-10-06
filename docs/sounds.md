# Tonos de aviso

Rinari reproduce sus propios tonos para los avisos (Ajustes › General ›
Sonidos). Con ellos activos, la notificación del sistema llega sin su sonido:
un solo emisor audible por aviso.

## Qué suena

| Categoría | Cuándo | Por defecto |
| --- | --- | --- |
| `attention` | Aprobación o pregunta nuevas durante un turno; tarea programada que te necesita. | Solo si no miras esa conversación. |
| `success` | Un turno observado en curso termina. | Solo si no miras esa conversación. |
| `error` | Un turno falla o se detiene. Cancelarlo tú no suena. | Solo si no miras esa conversación. |
| `reminder` | Recordatorio programado. | Siempre. |

«Mirar» una conversación: ventana visible y con foco, y la sesión activa en
Normal o un panel expandido en Boards. Nada suena por cargar historial,
restaurar un snapshot o volver a montar la vista. Una ráfaga (varios paneles a
la vez) suena una sola vez, con la categoría más importante
(`attention` > `error` > `reminder` > `success`).

El coordinador es `src/features/sounds/SoundCoordinator.tsx`; el único
reproductor, `src/services/notificationSounds.ts`.

## Paquetes

`public/sounds/<paquete>/<categoría>.mp3`, generados con ElevenLabs Sound
Effects y procesados con ffmpeg: recorte del silencio final, nivel medio
cercano a −20 dB con picos por debajo de −2 dB y fundido de 80 ms.

| Paquete | Estilo | Prompts (resumen) |
| --- | --- | --- |
| `soft` (Suaves) | Interfaz discreta | `attention`: dos notas de campanita de cristal ascendentes · `success`: una campana cálida · `error`: dos notas de vibráfono descendentes · `reminder`: arpegio de tres notas de glockenspiel |
| `rinari` (Rinari) | Anime / lo-fi | `attention`: destello brillante con un blip ascendente · `success`: jingle mágico de «objeto conseguido» · `error`: «oops» con un blip rebotando hacia abajo · `reminder`: melodía chiptune de tres notas |
