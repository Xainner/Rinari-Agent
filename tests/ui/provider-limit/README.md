# Errores: cuota agotada lleva a Uso y límites del proveedor

El modelo falso responde HTTP 429 con `insufficient_quota`, como OpenAI cuando
la cuenta se queda sin créditos. Antes era `RATE_LIMIT`, reintentable, y el
turno solo mostraba el texto del proveedor.

```bash
npm run ui:e2e -- provider-limit [--keep]
```

Qué comprueba:

- El turno dice la razón real («prueba-local no tiene cuota ni créditos…») y
  conserva el mensaje del proveedor debajo.
- Con otro proveedor ya activo, «Revisar uso y límites» abre Ajustes >
  Proveedores en la tarjeta del que falló, con la pestaña «Uso y límites».
- «Volver» regresa a la conversación.
