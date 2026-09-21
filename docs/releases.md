# Releases y actualizaciones de Rinari Agent

Rinari mantiene dos canales incompatibles durante la transición:

| Línea | Host | Metadata | Verificación | Estado |
| --- | --- | --- | --- | --- |
| 0.1.x | Tauri | `latest.json` | firma del updater Tauri | transición 0.1.3 |
| 0.2.x | Electron | `latest.yml` | SHA-512 del instalador | unsigned por decisión actual |

La primera migración Tauri → Electron es manual y guiada. Tauri nunca intenta
instalar el bootstrapper Electron como si fuera uno de sus bundles. El detalle
de datos se encuentra en [tauri-electron-transition.md](migration/tauri-electron-transition.md).

## Canal Electron 0.2.x

`electron-updater@6.8.9` consulta el release de GitHub y descarga el instalador
completo descrito por `latest.yml`. No se usan descargas diferenciales porque el
bootstrapper personalizado no produce blockmaps NSIS.

La descarga puede continuar mientras hay trabajo activo. **Instalar y
reiniciar** entra por la autoridad única de lifecycle: pide confirmación, cierra
el Engine y después llama `quitAndInstall`. Cancelar conserva la actualización
descargada y no interrumpe el Engine.

El bootstrapper recibe `--updated /S --force-run`, espera a que terminen
`rinari-agent.exe` y el alias histórico, conserva el alcance, accesos directos y
PATH registrados por esa instalación, y ejecuta la misma transacción de
staging, verificación, activación atómica y rollback de una instalación manual.
Al terminar relanza la versión instalada.

`latest.yml` incluye tamaño y SHA-512. Esto detecta metadata alterada o bytes
corruptos durante la descarga, pero **no identifica al publicador**. Los
artefactos 0.2.x muestran de forma explícita `rinariUnsigned: true`; Windows
puede mostrar “Editor desconocido”. Authenticode/Azure Trusted Signing queda
pendiente hasta que el proyecto disponga de certificado e identidad legal.

## Construcción local

La versión de `package.json` es la autoridad para el artefacto Electron:

```powershell
npm ci
npm run package:win
```

El comando compone el arte, empaqueta el Engine fijado en
`engine-manifest.json`, construye renderer y host, crea el payload y el
bootstrapper, y genera:

```text
release/installer/Rinari-Agent-Setup-<version>-x64.exe
release/installer/setup.sha256.json
release/installer/latest.yml
```

Si el Engine ya fue empaquetado y verificado puede usarse
`npm run package:win:staged`. `npm run package:update-metadata` regenera solo el
`latest.yml` para la versión actual. Ninguno de estos comandos publica.

El circuito instalado de actualización se ejecuta con:

```powershell
npm run updater:e2e
```

Construye 0.2.0 y una variante 0.2.1, instala 0.2.0 en un prefijo temporal,
rechaza metadata y payload corruptos, aplica 0.2.1, comprueba la versión tras el
relaunch y desinstala el entorno de prueba.

## Workflow de release

La fuente del último canal `v0.1.3` se conserva en el commit histórico indicado
por la guía de transición; el workflow activo ya no construye el host retirado.
Un tag `v0.2.*` exige que el tag coincida con `package.json`, empaqueta el Engine fijado
y crea un **draft** de GitHub explícitamente unsigned con el instalador,
`latest.yml` y hashes. El draft requiere revisión y publicación manual.

No crear ni publicar tags 0.2.x hasta decidir aceptar públicamente el aviso de
editor desconocido o incorporar Authenticode. La disponibilidad del updater
depende de que el draft se publique; una compilación PR no consulta ni publica
un canal alternativo.

## Firma pendiente

La clave histórica del canal Tauri no se reutiliza para firmar ejecutables
Electron: el updater Tauri y Authenticode resuelven problemas distintos.

Para retirar el estado unsigned se necesitará un certificado Authenticode de
una entidad confiable o Azure Trusted Signing, configuración de CI y una prueba
instalada que valide firma y cadena antes de publicar. Hasta entonces no se
afirma identidad criptográfica del editor.

## Matriz de plataformas

Windows x64 es la única plataforma construida y probada en esta entrega.
macOS y Linux permanecen `NOT_RUN`; requieren empaquetado, firma y updater
propios antes de anunciar soporte.
