# Presencia: la conversación continua con Rinari

Un modo que se enciende en Ajustes → Presencia. El Engine guarda una sola
conversación por instalación (`presence.get`), que no está en `session.list`:
la app la abre al encender el modo, la ofrece con su entrada «Rinari» arriba
de la barra lateral y le pone su cabecera, con «Entrar» para verla a pantalla
completa junto al panel de lo que pasa en los chats.

```bash
npm run ui:e2e -- presence [--keep]
```

Qué comprueba:

- Apagada por defecto: ni entrada en la barra lateral ni conversación.
- El interruptor guarda el modo en el Engine, y la conversación nace con
  linaje `presence` y acceso total, fuera de la lista de chats.
- Al salir de Ajustes la app está en ella: cabecera con el estado real
  («Todo en calma») y su entrada marcada.
- Un mensaje se responde ahí mismo y sigue sin aparecer entre los chats.
- «Entrar» quita la barra lateral y muestra el panel; «Salir» la devuelve.
- No se cierra: Ctrl+W no hace nada y el Engine rechaza `session.close`.
- «Nueva conversación» abre un chat normal, y la entrada vuelve a ella con lo
  dicho.
- Apagar el modo la quita de la vista sin borrarla: al encenderlo es la misma.
