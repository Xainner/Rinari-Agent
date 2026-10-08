# Brillo del texto de actividad

```bash
npm run build
npm run desktop:build
npm run ui:e2e -- activity-text-shimmer
npm run ui:e2e -- activity-text-shimmer --keep
```

Usa el Engine fijado en `engine-manifest.json`, un perfil temporal y un
proveedor guionizado en loopback, sin credenciales ni consultas externas.
Si el checkout del Engine no está en la ruta predeterminada, indicar `RINARI_CLI`.

Comprueba el movimiento real del fondo del texto entre frames y que no
cambie las dimensiones del rótulo. Recorre Normal y dos Boards, abre un
grupo mixto de operaciones, distingue el comando activo de los terminados
y verifica una ventana estrecha. Comprueba que el texto siga legible y
estático con movimiento reducido del sistema, la preferencia de la app
y colores forzados. La finalización, la inspección del historial y la
cancelación apagan el efecto.

Captura también el rótulo de estado y el grupo en seis posiciones del ciclo:
inicio, entrada, centro, salida, reinicio y nueva entrada. Los píxeles cerca
del reinicio deben ser idénticos y el centro debe mostrar el brillo; así se
detecta la aparición de una segunda franja al repetir el fondo.

Las pruebas de componentes cubren además aprobaciones de subagentes,
preguntas pendientes, errores, detención, snapshots con operaciones aún
marcadas como activas y deltas que conservan la identidad del grupo.

`--keep` deja la app abierta con una demostración: un comando local espera
dos minutos y después el proveedor retiene la siguiente respuesta, para
poder inspeccionar la actividad y detener el turno desde el composer.
Las capturas y el informe quedan en `release/evidence/ui/activity-text-shimmer/`.
