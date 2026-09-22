# Resultados del motor y ejecución automática

Agent requiere `recoverable_tool_results_v1`. El Engine controla presupuestos,
proyección, persistencia, recuperación y concurrencia; Agent presenta actividad.

El botón «Continuar» se retiró. El turno normal avanza sin impulsos manuales;
los fallos conservan diagnóstico e historial. Un mensaje posterior del usuario
puede retomar el trabajo sin reproducir automáticamente acciones anteriores.

Los grupos distinguen lecturas y archivos exitosos informados por el Engine.
Los resultados de las herramientas y sus datos de presentación son contratos
separados. Los tipos generados corresponden al esquema local actualizado.

El paquete `engine-dist` fue actualizado como desarrollo (no publicado).
`ENGINE_SOURCE.json` registra el commit base, hash de wheel y árbol de fuentes.
Para probarlo, reinicia el proceso de desarrollo y ejecuta:

```powershell
npm run desktop:dev
```

Las pruebas y el catálogo habilitado están documentados en el repositorio Engine,
`docs/tool-results.md`, y en el informe de trabajo del directorio `resultados`.
El manifiesto fija el Engine integrado en `f91ed69f26513f638a3289940dfe3be60098d0d9`.
El paquete local conserva la procedencia de desarrollo con la que fue validado.
