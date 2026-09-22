# Transición Tauri 0.1.3 → Electron 0.2.x

La primera transición es manual y guiada. Tauri 0.1.3 conserva su canal
`latest.json`; Electron comienza una línea separada en 0.2.0. No se intenta
instalar Electron como si fuera una actualización binaria Tauri.

## Preparar la exportación

En Tauri 0.1.3, **Configuración → Acerca de → Preparar transición** crea:

```text
%LOCALAPPDATA%\Rinari\migration\tauri-to-electron-v1.json
```

La ruta es neutral a los perfiles WebView2 y Chromium. El exportador acepta
una lista cerrada de preferencias de presentación: Boards, borradores,
disposición por sesión, idioma, apariencia, atajos y ajustes equivalentes.
No serializa providers, credenciales, cookies, grants, handles, sesiones ni
ningún dato propiedad del Engine.

El manifiesto contiene `schema`, `export_id`, versión de origen, namespace del
Engine, fecha, SHA-256 y el mapa de preferencias. Cada valor tiene límite de
2 MiB y el documento completo de 8 MiB.

Quien parte de Tauri 0.1.2 debe instalar primero 0.1.3 y preparar la
exportación. Ese paso conserva el perfil histórico; no depende del instalador
Electron.

## Importación Electron

Electron intenta la importación antes de cargar `App` y, por tanto, antes de
que los stores lean `localStorage`. La máquina durable sigue:

```text
not_started → validated → staged → committed → verified
```

El host valida esquema, versión, namespace, allowlist, tamaños y checksum. El
renderer escribe exclusivamente el contenido validado, lo relee y entrega el
mismo mapa al host. Solo entonces el host marca `committed` y finalmente
`verified`. Tras verificar, el origen se archiva junto a su `export_id`.

Cualquier fallo produce `failed`, restaura las preferencias previas, conserva
el archivo fuente y muestra una pantalla de recuperación en vez de abrir una
aplicación que parezca vacía. **Reintentar importación** es una acción explícita.

## Propiedad de datos

La transición no mueve `RINARI_HOME`. Sesiones, providers, credenciales,
memoria y artefactos siguen bajo propiedad del Engine y ambos hosts acceden al
mismo namespace. Desinstalar cualquiera de los hosts no borra esos datos.

## Contrato de plataforma

El renderer usa `migration.status()`, `migration.importPending()` y
`migration.retry()`. El exportador existió solo en Tauri 0.1.3 y quedó retirado
del runtime activo durante el cutover. Su fuente exacta y commit se conservan
en [transition-0.1.3](transition-0.1.3/README.md) para recuperación.
