# Boards: Quitar todos

El botón «Quitar todos» / «Remove all» vacía el board en una sola
actualización, también con paneles colapsados o en modo foco. Antes pide
confirmación con el diálogo de la app, porque la disposición del board no se
puede deshacer. Conserva las conversaciones y su ejecución, los borradores, los
paneles laterales, los recibos de lectura y las preferencias generales del
board. Limpia el foco, su instantánea y los errores de los paneles retirados.

```bash
npm run ui:e2e -- boards-remove-all [--keep]
```

El modelo falso retiene la primera petición: con un turno en curso se quitan
todos los paneles y después se libera la respuesta. La conexión sigue viva, y
el turno termina y queda en el historial.

Fases:

- `exercise`: comprueba que cancelar el diálogo no toca el board, y que
  confirmar vacía el board con paneles expandidos, colapsados y en modo foco.
  Comprueba también que se conservan los borradores y los laterales, y que el
  control en inglés es accesible a 780 px.
- `restart`: tras reiniciar Electron y el Engine, el board sigue vacío y las
  sesiones activas. Vuelve a añadir las conversaciones desde la interfaz, y
  `--keep` deja esa ventana abierta.
