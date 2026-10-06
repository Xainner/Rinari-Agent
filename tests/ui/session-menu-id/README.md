# Barra lateral: ID de sesión en una línea

El menú de la sesión ajusta su ancho al contenido, así que el ID ya no se
parte entre caracteres. Si un identificador no cabe, se trunca a la vista,
pero sigue completo en el título y en las acciones de copiar.

```bash
npm run ui:e2e -- session-menu-id [--keep]
```

Qué comprueba:

- El ID completo cabe en una sola línea.
- El menú se abre con clic derecho y con los tres puntos.
- Funciona en español y en inglés, sin salirse de la ventana.
- Copiar ID y copiar referencia.

La copia recorre el IPC validado real. Solo se captura la escritura nativa
final, para no reemplazar el portapapeles del equipo, y se restaura al
terminar.
