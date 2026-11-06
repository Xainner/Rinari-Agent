# Connect to my server

Rinari Agent works with one Rinari at a time: the engine on this computer (the
sidecar) or the engine of a server running Rinari Gateway 0.2 or later. The
person chooses in **Settings → Servidor**. Switching reconnects the app, and
from then on conversations, projects, memory and files are the server's.

The Gateway side of the contract (listener, pairing, close codes, file routes)
is `docs/conexion-remota.md` in the Rinari-Gateway repository.

## Pairing

1. In the Gateway panel, **Dispositivos** creates a one-time code (10 minutes)
   and shows it as a QR code and as a link: `rinari://pair?url=…&code=…`.
2. In the app, paste the link, or type the server address and the code.
3. Main posts the code to `<server>/remote/v1/pair` and receives a device key.
   Pairing stores the server; it does not switch to it until the person says so.

The device key is encrypted with Electron `safeStorage` (DPAPI on Windows) in
`userData/engines.json`, and it never reaches the renderer. If it cannot be
decrypted any more, the app starts on this computer. Addresses must use
`https://`, except loopback, LAN and Tailscale addresses.

**Olvidar** removes the server from this computer only. To cut access for good,
revoke the device in the panel: the server closes the connection (4401), the app
shows «Ya no está emparejado» and does not retry.

## Connection

`WebSocketTransport` speaks the same protocol v1 as the stdio transport: one
JSON message per WebSocket text frame, with the device key in the
`Authorization` header. The Gateway shares one engine among several devices,
so events from other devices' turns arrive too. A dropped connection leaves the
engine status as degraded and reconnects with backoff (1 s up to 30 s); 4401 is
final.

## Files and folders

- **Opening, revealing, previewing, copying or saving a file** downloads it from
  the Gateway, which serves only what its engine authorizes
  (`artifact.resolve`, `workspace.file.resolve`). Downloads go to
  `userData/remote-files` and are cleared the next time the app starts.
- **Attachments, soul imports and skill sources** from this computer are
  uploaded first, and the engine receives the server path. A path that does
  not exist here is already the server's and is left alone. Folders of this
  computer cannot be uploaded.
- **Project folders** are folders of the server: the folder picker asks for a
  server path instead of opening the native dialog.

## Limits

- The integrated browser is a host of this computer: the app does not offer it
  to a server engine, and the Gateway refuses `host.browser.*`.
- «Abrir carpeta» on the engine home or its instructions answers
  `REMOTE_LOCAL_ONLY`: those folders are on the server.
- One Rinari at a time; there is no merged view of both.

## Testing

Unit tests cover the transport, pairing, storage, uploads, downloads and the
settings screen. The `remote-server` UI scenario runs the real app against a
disposable Gateway when `RINARI_E2E_GATEWAY` and `RINARI_E2E_GATEWAY_ENGINE` are
set (see `tests/ui/README.md`); without them it checks the unreachable-server
path only.
