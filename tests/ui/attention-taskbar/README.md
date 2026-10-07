# attention-taskbar

**Qué fija.** El número de chats pendientes (título de la ventana, insignia de
la barra de tareas y marca de la bandeja salen de la misma cuenta) incluye los
chats de Normal, no solo los paneles de Boards.

**Cómo.** Envía un mensaje en «Informe largo» con el modelo retenido, cambia a
«Otra conversación» y comprueba que un chat trabajando no cuenta. Al soltar la
respuesta, el título pasa a `(1) Rinari Agent`; al abrir el chat y ver el
resultado vuelve a `Rinari Agent`.

El overlay de Windows y la cara de la bandeja se prueban en
`electron/main/native/indicators.test.ts`: el arnés no puede leer la barra de
tareas.
