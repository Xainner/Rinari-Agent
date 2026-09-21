# Recuperación de turnos y tiempos de espera

Agent exige `durable_turn_recovery_v1` del motor. El contrato añade tiempos de
espera configurables para streaming, disponibles en Configuración → Visión e
imágenes → Ejecución de modelos → Tiempos de espera del modelo.

Los turnos fallidos conservan su diagnóstico tras recarga. Cuando el motor
confirma historial guardado, la UI explica la recuperación y ofrece **Continuar**.
El botón envía una petición explícita; abrir el chat no reanuda ni repite acciones.
El texto parcial no se duplica en los detalles técnicos de la interrupción.

Validación local: 90 pruebas de frontend, TypeScript/build, 18 pruebas Rust y una
prueba adicional del puente con el motor empaquetado. El roundtrip guarda y lee
los nuevos tiempos de espera. El catálogo y OCR del paquete también pasaron.
No se verificó manualmente la ventana; las pruebas visuales son de componentes.

El motor local contiene cambios sin commit, se identifica como desarrollo y
exige reiniciar el proceso de desarrollo para cargarlos. Desde este directorio:

```powershell
npm run desktop:dev
```

El informe del motor está en `Rinari-CLI/docs/stream-recovery.md`: incluye la prueba
real de dos solicitudes con OpenCode Go/Muse Spark 1.3 y resultados sintéticos.
No se ejecutaron herramientas externas ni se continuó la sesión original.
No se realizó commit, push ni publicación.
