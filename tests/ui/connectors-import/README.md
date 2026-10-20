# connectors-import

Importar y ofertas de proyecto (plan de conectores C4) con el Engine real y un
servidor MCP falso por stdio (`fake-mcp.cjs`, node, sin red).

- «Importar de otra app» lee la configuración de Codex de la carpeta del
  escenario (`CODEX_HOME`; `CLAUDE_CONFIG_DIR` también apunta allí). Nada
  empieza marcado y solo se importa lo marcado. Claude Desktop, Cursor y
  VS Code se leen de sus rutas normales, solo para listarlos: no se marca ni
  se fotografía esa lista.
- «Pegar JSON» importa un `mcpServers` pegado.
- Ningún valor secreto aparece en la ventana; los nombres sí.
- El servidor importado conecta en segundo plano («Conectado · 2 herramientas»).
- Un proyecto de confianza con `.mcp.json`: al abrir su conversación, Rinari
  pregunta por su servidor; «Usar en este proyecto» lo crea con ámbito de
  proyecto, y al volver a abrirla no pregunta otra vez.
- El detalle dice «Solo en este proyecto», su carpeta y «Carpeta de confianza».
