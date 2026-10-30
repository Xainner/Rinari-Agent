# Auditoría de la Agency en uso real (2026-10-21)

Recorrido en la Nightly 0.4.0-nightly.20261021.1958 (Agent 3fe88f8, Engine 34fb9b6), perfil aparte «Auditoría Agency», tres agentes con deepseek-v4.1-flash en esfuerzo medio, un equipo «Mesa de oro», una cadena en la oficina, un recado, reglas, «Detener a todos» y archivar. Se sumó un análisis del código contra [idea-rinari-agency.md](idea-rinari-agency.md).

El dueño la juzgó incompleta y por debajo de la visión; las pruebas con mocks pasaban sin recorrer lo que él usa. Esta tanda arregla todo lo de abajo y se valida recorriendo la app real.

## Decisiones del dueño (2026-10-21)

- **D-31. Saltos por cadena: 8** (antes 3, D-1). El tope de 20 entregas por cadena y los presupuestos siguen frenando un bucle. Al cortarse una cadena queda un aviso fijo en la oficina y en la campana, y el agente sabe que su mención no se entregó.
- **D-32. Con la Agency detenida**, si el dueño le escribe a un agente en su chat, el agente responde (lo pidió él) y el chat avisa que la Agency está detenida; nada más despierta solo.
- **D-33. Conectores en un puesto: los del agente más los del equipo** (antes, solo los del equipo).
- **D-34. Personalidad: la del agente, sin la de Rinari.** Sus instrucciones son su Soul. Además puede usar un Soul guardado de Rinari y editarlo desde la Agency.
- **Permisos y nada más** (dueño, 2026-10-21): programar, crear reglas y lo demás va por el modo de autonomía del agente; ninguna capa de «propuesta» encima.

## Lo que se encontró

### Bloqueantes
1. Una regla creada por un agente sale duplicada en Reglas («Propuesta» y «Activa»); «Activar» la duplica; el aviso dice «propone una regla»; el tutorial y los textos prometen que «ninguna regla se activa sin tu visto bueno».
2. Una cadena cortada no se ve (solo un toast de 15 s); `office.say` le dice al agente que se publicó; los recados que llegan al tope quedan «entregados» sin que nadie pueda cerrarlos.
3. El texto normal de la oficina se pintaba como mención (regresión de 3fe88f8; arreglado en 6dd3db7).
4. Un agente con Acceso completo leyó `~/.rinari/state.db` con Python y buscó en el Engine y en los proyectos del dueño: la casa de Rinari no está protegida para los agentes.
5. Desde su chat directo un agente no puede publicar en la oficina de su equipo, y una regla no puede entregar a la oficina ni a otro agente (destinos `@Agente` / `@Pizarra`, visión 10.1).
6. Archivar al jefe lo deja de jefe y de miembro; la barra lateral muestra su id crudo; no se puede desarchivar; no pide confirmación.
7. Los puestos no muestran si trabajan (barra lateral, cabecera de la oficina, Ficha del equipo).
8. Los agentes hablan con la personalidad de Rinari.

### Importantes
9. En un puesto el agente no ve sus conectores y nadie se lo dice; el texto de Ajustes decía lo contrario.
10. Una entrega despertó una charla de tres agentes que nadie pidió.
11. Mencionar a dos agentes despierta al segundo antes de tiempo.
12. El resultado de un recado sale como Markdown crudo en su tarjeta.
13. La campana no es por perfil.
14. El composer del agente muestra «Predeterminado» aunque el agente tiene su esfuerzo, y dice «guiar a Rinari».
15. La Ficha solo se abre desde la portada; al menú contextual de agentes, puestos y equipos le faltan «Ficha» y «Copiar ID de sesión».
16. «Nueva regla» deja una propuesta en memoria que hay que activar y se pierde al cerrar.
17. Las reglas no se editan, no muestran su historial ni se puede deshacer la última ejecución.
18. «Reanudar» deja pausadas las reglas y bloqueados los recados.
19. Las conversaciones de las ejecuciones de una regla quedan ocultas.
20. La portada solo lista agentes: ni equipos ni lo que espera al dueño.
21. «Usar una plantilla» sigue en «Pronto» aunque el Engine tiene plantillas y duplicar.

### Pulido
22. «De Tú para…», «El Engine corta…», números sin formato local, un mensaje suelto «D».
