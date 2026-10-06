# Boards: panel lateral cerrado por defecto

Una sesión sin layout propio entra en Boards con el panel lateral cerrado. Si
la sesión ya tiene una preferencia, abierta o cerrada, esta le sigue
perteneciendo: se conserva entre Normal y Boards, al quitar y añadir el panel,
y al reiniciar. Los textos visibles y accesibles dicen «Panel lateral» /
«Side panel» (tooltip y nombre de la X, control de visibilidad y ancho).

```bash
npm run ui:e2e -- boards-side-panel [--keep]
```

Usa el proveedor muerto: se crean sesiones sin credenciales, pero no hay
respuestas de modelo. El único fixture es el ancho manual de 480 px del caso
estrecho; la visibilidad se cambia siempre con los controles de la interfaz.

Fases:

- `exercise`:
  - alta desde el diálogo de Boards y una sesión existente sin layout;
  - el lateral abierto y la pestaña Tareas de Normal se conservan;
  - apertura desde el encabezado y desde la barra superior, y cierre sin
    cerrar la sesión;
  - quitar el panel y volver a añadirlo;
  - panel estrecho: no abre cajón al entrar, la apertura explícita crea uno con
    foco y Escape lo cierra;
  - textos en español e inglés.
- `restart`: las preferencias sobreviven al reinicio y una sesión nueva sigue
  empezando cerrada.
