import React from "react";
import ReactDOM from "react-dom/client";
import { Toaster } from "sonner";
import App from "./App";
import { registerParityProbe } from "./services/parityProbe";
import "./styles/index.css";

// La sonda de paridad recorre las APIs de producto (documento 02 §8). Solo se
// registra si el host declara el modo; en un arranque normal no existe.
registerParityProbe(
  (window as { rinariDesktop?: { parityMode?: boolean } }).rinariDesktop?.parityMode === true,
);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
    <Toaster position="bottom-right" />
  </React.StrictMode>,
);

// Ventana dev distinguible de la instalada (mismo identificador/app).
if (import.meta.env.DEV) {
  document.title = 'Rinari Agent (DEV)'
}
