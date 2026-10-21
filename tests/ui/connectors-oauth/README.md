# connectors-oauth

Ajustes → Conectores (plan de conectores C3) con el Engine real y un servidor
MCP falso en loopback que inicia sesión con OAuth (metadatos del recurso,
registro dinámico, PKCE, token y revocación).

- Vacío con su arte; «Agregar conector» abre el catálogo.
- GitHub desde el catálogo pide solo el token. Detrás del proxy muerto del
  arnés queda en «Error» con su pista; el token nunca aparece en la ventana.
- «Agregar servidor MCP» con «Iniciar sesión (OAuth)»: al guardar se abre el
  inicio de sesión. El navegador del Engine (`webbrowser`, variable
  `BROWSER` del escenario) es `fake-browser.mjs`, que sigue la autorización
  y el callback solo en loopback: el navegador del equipo no se abre. La
  ventana termina en «Sesión iniciada» y la tarjeta en «Conectado · 3
  herramientas».
- Detalle: Bloquear una herramienta, Preguntar por defecto y corregir la
  anotación «Solo lee»; se comprueba con `mcp_tools_list`.
- El servidor se cae (503): «Reconectar» lo deja en «Error»; vuelve y
  «Reconectar» lo conecta.
- «Desconectar cuenta» revoca el token en el servidor falso.
