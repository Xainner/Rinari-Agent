# Chat: seguir el final mientras Rinari escribe

Plan 0.4.0 #88, #20 y #58. El modelo falso transmite en trozos una respuesta
larga y pesada (bloques de código, una tabla con rutas largas de Windows,
negritas), como la de la sesión donde se vio el error #185.

```bash
npm run ui:e2e -- chat-follow-live [--keep]
```

Qué comprueba, muestreando cada cuadro con `requestAnimationFrame`:

- La flecha «Ir al final» nunca aparece mientras el chat sigue el final.
- Un clic dentro del chat (sin rueda) no apaga el seguimiento.
- Al terminar, la distancia al fondo es de 2 px o menos (antes se aceptaba
  menos de 80 px).
- Ningún error del renderer durante el streaming.
