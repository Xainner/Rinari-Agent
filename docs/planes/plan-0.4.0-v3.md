# Plan 0.4.0 v3: caché y Set 2 de la batería

Estado: **en revisión con el dueño, hallazgo por hallazgo** (desde 2026-10-19). No se escribe código hasta que el dueño lo autorice.

Origen: el «Set 2 (caché)» de la batería de uso real (`C:\Users\Xainner\Documents\Proyectos\pruebas-040-1018\HALLAZGOS.md`), corrido con la Nightly que lleva el Engine 9231110 (la del [plan v2](plan-0.4.0-v2.md)). Los F-n son sus hallazgos.

La regla de cero hardcodeo del [plan v2](plan-0.4.0-v2.md#regla-cero-hardcodeo-dueño-2026-10-18) vale igual aquí. Lo que es de servicios externos va a [notas-servicios-externos.md](notas-servicios-externos.md). Allí ya está **F46** (subagentes en paralelo contra un servidor local de un solo slot): se arregla en el servidor, no en Rinari.

## Avance

| Hallazgo | Estado |
|---|---|
| F45 | Decidido (abajo). |
| F41 | Por revisar. |
| F42 | Por revisar. |
| F43 | Por revisar. |
| F44 | Por revisar. |
| F27 bis | Por revisar. |
| F46 | Fuera: nota externa. |

## F45: asentar las salidas viejas por presión, no por rondas

**Qué pasa.** `context/settle.py` deja intactas las 8 rondas más recientes y asienta las anteriores de 8 en 8: cambia los resultados largos de herramientas por una nota corta. Lo hace por cuenta de rondas, quepa o no el contexto. Cada vez que el corte avanza, cambia un trozo del medio del historial, y todo lo que viene detrás se vuelve a leer. En la nube es una pérdida de caché pequeña. Con un modelo local son decenas de miles de tokens de relectura de golpe: en qwen2/c1 la caché cayó de 84.769 a 16.384 en una llamada (~85 mil tokens de prefill).

**Cambio.**
1. Mientras el contexto quepa holgado, no se asienta nada. El historial solo crece al final.
2. Cuando la petición pasa de un umbral alto de la ventana (al empezar, el 60 %), se asienta de una sola vez todo lo viejo, hasta bajar a un umbral bajo (al empezar, el 35 %). Siempre se dejan intactas las rondas recientes. La presión se mide igual que para compactar (`context/tokens.py`, que compacta al 80 %).
3. El corte se guarda con la conversación, no se recalcula en cada llamada. Solo avanza la próxima vez que se pase el umbral alto. Se mantiene entre turnos y se reinicia al compactar.
4. `tools/read_cache.py` pregunta por ese mismo corte guardado, para no decirle nunca al modelo «ya lo leíste» de algo que ya no ve.
5. Si no se conoce la ventana del modelo, se queda el comportamiento actual por bloques, como respaldo.

Es genérico: solo usa la ventana y el conteo de tokens, que Rinari tiene para cualquier modelo. No mira el proveedor ni si es local o nube. Los dos umbrales son el punto de partida y se ajustan con las mediciones.

**Lo que ya existe y no cambia.** El tope de cada salida al entrar, que es lo que hace Codex:
- cada resultado entra con 64 KB como máximo (`observation_bytes`), la salida de un proceso con 16 KB, y una ronda entera con 256 KB;
- el resto va a un `artifact://` que se puede leer con `artifact.read`.

Lo que entra así ya no cambia nunca después.

**Queda fuera, como idea.** Asentar tras una pausa larga, cuando la caché del proveedor probablemente ya expiró y no hay nada que romper (lo que hace el microcompact de Claude Code). Cuánto dura la caché depende del proveedor, y en un servidor local no expira por tiempo sino al desalojarse, así que no se puede hacer genérico sin adivinar.

**Referencias.**
- La API de Anthropic hace lo mismo con su *context editing* (`clear_tool_uses`): `trigger` como umbral, `keep` para lo reciente y `clear_at_least` para que cada limpieza valga la caché que rompe.
- Hermes resume el medio de la conversación al 50 % de la ventana.
- Codex compacta cerca del 90 % y no toca el medio antes.

**Validación.**
- Pruebas de `settle` por presión: no cambia por debajo del umbral, salta una vez hasta el umbral bajo, el corte es estable entre llamadas y turnos, y el respaldo funciona sin ventana conocida.
- Coherencia con `read_cache`.
- Una sesión larga con un modelo local, para medir que desaparecen las caídas de caché a mitad del turno.
