# Boards: Ajustar a la vista

«Ajustar a la vista» reparte el ancho real entre los paneles expandidos,
descontando las tiras colapsadas y la columna «Añadir panel». El
comportamiento completo está en `docs/interactive-workspace.md` (Boards).

```bash
npm run ui:e2e -- boards-fit [--keep]
```

Usa el proveedor muerto: el turno que se lanza falla a propósito y no se llama
a ningún modelo.

Qué comprueba:

- Con 1, 2, 3 y 6 paneles, todos tienen el mismo ancho.
- Al desactivarlo vuelven los anchos manuales, y el composer conserva su
  identidad y su borrador.
- Colapsar, expandir y modo foco. Pulsar el botón revela los paneles
  colapsados, venga del modo manual, del ajuste o del modo foco.
- Cambios de tamaño de la ventana, la barra lateral y zoom al 125 %.
- La preferencia del panel lateral en modo cajón.
- La persistencia al recargar, y que un turno fallido no redistribuye.
- La barra compacta sigue siendo accesible; añadir y quitar desde la interfaz.
- Desbordamiento con todo colapsado.
- Migración desde el schema 3, un panel de más de 1600 px y que no se
  reescribe un layout de una versión futura.
