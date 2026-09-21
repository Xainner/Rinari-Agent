# Exportador de transición Tauri 0.1.3

Esta carpeta conserva, solo como referencia de recuperación, el exportador
restringido que se entregó en el commit
`06fadb40334289c12f63a6cb202c546cdcce7d70`.

El runtime Tauri dejó de formar parte de la aplicación en la entrega H. El
archivo `migration.rs` no se compila desde `main`, no define un segundo host y
no se incorpora al instalador Electron. Para producir la última build de
transición 0.1.3 debe usarse ese commit histórico, cuyo canal continúa separado
como `latest.json`.

Electron 0.2.x conserva el importador y el formato
`rinari.desktop-preferences.v1`; retirar el host antiguo no elimina ni altera
una exportación existente.
