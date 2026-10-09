# Chat: enviar desde arriba lleva al final

Leer arriba del historial pausa el seguimiento, pero enviar un mensaje (o
guiar el turno) es una intenciÃ³n nueva: en cuanto el Engine acepta el envÃ­o,
la conversaciÃ³n va al final. Un envÃ­o rechazado, el cambio de sesiÃ³n durante
la espera o una navegaciÃ³n explÃ­cita posterior no mueven nada.

```bash
npm run ui:e2e -- chat-send-jump [--keep]
```

Usa el modelo falso con respuestas largas.

QuÃ© comprueba:

- Normal: desde la mitad del historial, Enter envÃ­a y la vista termina abajo,
  sin la flecha Â«Ir al finalÂ».
- Boards: solo se mueve el panel que envÃ­a; el vecino conserva su lectura.
