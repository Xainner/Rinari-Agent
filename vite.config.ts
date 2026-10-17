import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// @ts-expect-error type error without @types/node package
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

// Las pruebas del instalador (`installer/setup`) usan sus propias dependencias
// (`npm ci --prefix installer/setup`, como en el CI). En una copia sin ellas se
// saltan con un aviso, en vez de fallar al no encontrar `@tauri-apps/api`.
// @ts-expect-error type error without @types/node package
import { existsSync } from "node:fs";
const installerDeps = existsSync("installer/setup/node_modules/@tauri-apps/api");
if (!installerDeps && process.argv.some((arg: string) => arg.includes("vitest"))) {
  console.warn("[vitest] installer/setup sin dependencias: se saltan sus pruebas (npm ci --prefix installer/setup).");
}

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],

  test: {
    exclude: ["**/node_modules/**", "**/dist/**", ...(installerDeps ? [] : ["installer/setup/**"])],
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
