# Barra lateral: tÃ­tulo que resume el primer mensaje

El Engine nombra una conversaciÃ³n nueva a partir de la intenciÃ³n de su primer
mensaje y publica `session.renamed` al guardarlo, asÃ­ la barra lateral lo
muestra a mitad de turno. Si el modelo no da un tÃ­tulo usable, el mensaje
recortado queda como provisional y se reintenta en los turnos siguientes.

```bash
npm run ui:e2e -- session-title [--keep]
```

El modelo falso responde al tÃ­tulo por su propio carril y retiene la
respuesta principal hasta que la prueba la suelta.

QuÃ© comprueba:

- Con el turno aÃºn en marcha, la barra lateral muestra Â«Poema francÃ©s sobre
  los huskiesÂ» y no el mensaje recortado.
- El turno termina con normalidad despuÃ©s.
