# Proveedores: activar y desactivar

Plan 0.4.0 #97. Un proveedor desactivado no gasta ni se consulta: sus modelos
salen de todos los selectores y el Engine no le hace ninguna llamada.

```bash
npm run ui:e2e -- provider-toggle [--keep]
```

Qué comprueba:

- El interruptor de la tarjeta abre un diálogo que dice qué depende del
  proveedor (es el activo y lo usa un agente) y propone un reemplazo.
- Al confirmar, el agente y el modelo activo pasan al reemplazo, sus modelos
  salen de `model.list` y la tarjeta queda al final como «Desactivado».
- Una conversación que seguía con un modelo suyo muestra «está desactivado» al
  enviar, y «Activar prueba-local» lo vuelve a encender.
