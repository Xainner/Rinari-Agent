# Rinari en el teléfono (iOS y Android)

Estado: **Fuera de la 0.4.0** (dueño, 2026-10-15): se retoma cuando el dueño lo tenga listo. Las preguntas quedaron respondidas abajo. Antes: idea en exploración (2026-10-13).

## La idea

Cada usuario se conecta desde el teléfono **a su propio Gateway**, por dirección o dominio (o con un QR de emparejamiento): un «Claude Code Cloud» personal en el que todo se queda con el usuario. El teléfono es un cliente más del mismo Engine ([plan-gateway.md](plan-gateway.md): conexión remota segura).

## Maqueta

`Documents/Proyectos/rinari-mobile-proto` (`index.html`, 38 capturas en `shots/`): bienvenida con Rinari de cuerpo entero hablando como personaje, conexión al Gateway, cajón lateral, conversación con aprobaciones y preguntas de un toque, hojas inferiores para las herramientas del panel lateral y una vista compacta de [Rinari Agency](idea-rinari-agency.md). Variantes iOS y Android.

## Decisiones del dueño

- **Sí a la tarjeta del turno en curso fuera de la app** (2026-10-13), en los dos sistemas:
  - **iOS:** Live Activity (pantalla de bloqueo y Dynamic Island) y widget de pantalla de inicio;
  - **Android:** el equivalente: notificación en curso con su progreso (las «Live Updates» de las versiones recientes de Android, o una notificación persistente con barra de progreso en las anteriores) y widget de pantalla de inicio.
  - Muestran lo mismo que la tarjeta de estado de la app ([plan 0.4.0](plan-0.4.0.md) #49): qué hace Rinari, el paso de la lista, el tiempo, y un aviso cuando te necesita (aprobación o pregunta), con un toque que abre la conversación.

## Preguntas (respondidas, 2026-10-15)

1. ¿Notificaciones push reales (requieren un servicio de envío y que el Gateway las dispare)? → **Sí**, enviadas por el Gateway.
2. ¿Aprobar con Face ID / huella las acciones sensibles desde el teléfono? → **Sí.**
3. ¿Qué tecnología: nativa (Swift / Kotlin) o multiplataforma (React Native, Flutter)? Las Live Activities y los widgets necesitan código nativo en cualquier caso. → **React Native**, con módulos nativos solo para widgets y Live Activities.
