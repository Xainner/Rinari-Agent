> Documento histórico. La política vigente y su validación están en [vision-hermes-refactor.md](vision-hermes-refactor.md).

# Validación de visión unificada

Fecha: 2026-09-12. Cambios locales, sin commit ni push.

## Resultado

El motor decide la ruta para adjuntos y fs.read_image. La capacidad desconocida
permite el envío sin confirmación. Los permisos del sistema de archivos siguen
siendo independientes. La actividad distingue carga de imagen y análisis visual.
La capacidad declarada del modelo principal no se sustituye por la del especialista.

## Comprobaciones ejecutadas

- Motor, agentes, CLI, proveedores, presupuesto y protocolo: 227 passed, 1 skipped.
- Regresión de visión después del último cambio de caché: 34 passed.
- Frontend de actividad, compositor y configuración: 35 passed, ocho archivos.
- Ruff en los archivos nuevos/principales del refactor: sin hallazgos.
- TypeScript, generación de protocolo y compilación frontend: correctos.
- cargo check: correcto.
- Integración Rust packaged_engine_browser_catalog_roundtrip: 1 passed.
- Wheel reconstruido, instalado en engine-dist y checksum actualizado.

## Proveedor real

tests/manual/vision_smoke.py utiliza estado temporal y una imagen sintética de dos
rectángulos. Lee la selección del proveedor de la sesión de referencia sin modificar
su historial, permisos ni configuración. No persiste credenciales literales.

Modelo: qwen3.8-27b-uncensored, capacidad declarada desconocida.
Probado desde fuentes y con el Python/motor empaquetado de Rinari Agent:

1. Adjunto: reconoció rojo a la izquierda y azul a la derecha, cero herramientas.
2. Archivo local con espacios y ñ: ejecutó únicamente fs.read_image y reconoció
   los mismos colores. Ambos turnos terminaron con turn.completed.

No hubo confirmaciones visuales ni búsquedas de herramientas para desbloquear visión.
El script inicialmente reutilizaba un identificador RPC; se corrigió con UUID por
petición antes de completar ambos recorridos.

## Límites explícitos

### Corrección del contexto acumulado

El historial ya no falla al superar cuatro imágenes. Se envían las cuatro
referencias distintas más recientes y se conservan referencias recuperables para
las omitidas, sin modificar el historial. fs.read_image permite recuperar una
imagen antigua y priorizarla. El límite es conservador por petición; no equivale
a un cálculo de tokens específico de cada proveedor ni cambia la importación.

Regresión adicional: 39 pruebas de selección/enrutamiento; suite inicial conjunta
con runtime y turnos: 96 passed, 1 skipped. Incluye siete imágenes con artefactos
reales en ambas rutas, doce imágenes históricas y recuperación de una antigua.
Proveedores simulados en esta regresión. Wheel actualizado y prueba del puente
Rust con motor empaquetado: 1 passed.

La ruta dedicada y sus fallbacks tienen pruebas con dobles y transporte simulado;
la comprobación real anterior valida la ruta del modelo principal. No demuestra
calidad general de reconocimiento visual ni el comportamiento de cada proveedor.

No se realizó una inspección manual de la ventana de Windows. La skill
[computer-use](C:/Users/Xainner/.codex/plugins/cache/openai-bundled/computer-use/26.908.40834/skills/computer-use/SKILL.md)
requiere: “Use `node_repl` JavaScript for all Computer Use actions.” Ese runtime no
está disponible en esta sesión; las pruebas de componentes no sustituyen esa revisión.

Para probar la aplicación, reiniciar npm run tauri -- dev desde Rinari-Agent.
No hace falta confirmar visión desconocida ni configurar un especialista para
intentar imágenes con el modelo principal.
