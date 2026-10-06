# Chat: flecha de bajar junto al composer

La flecha «Ir al final» está a 8 px del borde inferior del historial, y con el
espaciado actual queda a unos 20 px del composer en Normal y a 30 en Boards.
Si el borrador crece, la flecha sube con el historial.

```bash
npm run ui:e2e -- chat-scroll-button [--keep]
```

El modelo falso produce un historial largo con un turno real del Engine.

Qué comprueba:

- La distancia al composer, el centrado y que nada tapa la flecha.
- Que lleva al final y desaparece.
- Que no aparece en chats vacíos ni estando ya al final.
- Normal y Boards, con el composer compacto y crecido, y una ventana baja.
