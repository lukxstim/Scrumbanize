import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Keep the browser's Host header, so the server sees requests from this page as its own (sameOriginForChanges).
      '/api': { target: `http://localhost:${process.env.PORT ?? 3000}`, changeOrigin: false },
      // Live updates (US-24): polling and the WebSocket upgrade.
      '/socket.io': { target: `http://localhost:${process.env.PORT ?? 3000}`, changeOrigin: false, ws: true },
    },
  },
});
