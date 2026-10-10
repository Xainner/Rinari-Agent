# Barra lateral: desplegar el proyecto al crear

La barra lateral guarda en `rinari.projectsExpanded` qué proyectos están
desplegados, con una preferencia reactiva por ID. Cuando el Engine confirma
una conversación nueva, solo se despliega su proyecto y se limpia la búsqueda.
Seleccionar, refrescar o renombrar no deshacen un colapso manual.

Normal registra la carpeta con `project.add` antes de `project.open`: el
primer `created` indica un alta y el segundo una sesión recomendada nueva. Un
alta confirmada queda visible aunque después no se pueda crear la sesión.
Boards aplica la misma regla sin cambiar la selección de Normal. Su «Abrir
carpeta» abre la ventana «Nuevo proyecto» con la carpeta elegida y, al crear,
añade un panel borrador (sin conversación vacía); una carpeta que ya es de un
proyecto abre ese proyecto y avisa si ya tiene panel.

```bash
npm run ui:e2e -- project-reveal [--keep]
```

Usa el proveedor muerto: se crean sesiones sin credenciales, pero no hay
respuestas de modelo. El selector de carpetas devuelve rutas temporales y se
restaura al terminar.

Fases:

- `exercise`: recorre la barra lateral, el inicio del proyecto, Boards, un
  filtro previo, la selección de Normal, el alta y su nombre inicial, el cambio
  de conversación, y la cancelación tanto del selector como de una
  conversación duplicada.
- `restart`: las preferencias sobreviven a reiniciar la app y el Engine.

La transición CHAT → PROJECT y los fallos de creación, catálogo o
almacenamiento se cubren con tests de integración de React. La prueba nativa
no provoca la promoción con un turno de modelo.
