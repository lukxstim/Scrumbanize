import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Installable web app (US-25): manifest and a Workbox service worker (dist/sw.js). The page registers it itself
    // (src/pwa/registerServiceWorker.ts), so the desktop app can leave it out, and asks before taking a new version.
    VitePWA({
      strategies: 'generateSW',
      registerType: 'prompt',
      injectRegister: false,
      // The icons load from the network like other images; only the app shell is stored.
      includeManifestIcons: false,
      manifest: {
        id: '/',
        name: 'Scrumbanize',
        short_name: 'Scrumbanize',
        description: 'Notizen und Scrumban-Board',
        lang: 'de',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        // Design tokens of the light theme (src/index.css): --color-surface for the bar, --color-canvas for the splash.
        theme_color: '#ffffff',
        background_color: '#fafafa',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The app shell only: index.html, scripts, styles and fonts. Data always comes from the server.
        // The plugin adds manifest.webmanifest itself, with its content hash, so it changes with each new version.
        globPatterns: ['index.html', 'assets/**/*.{js,css,woff2}'],
        cleanupOutdatedCaches: true,
        // Links into the app open offline, too; the API and live updates (US-24) never get index.html.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api(\/|$)/, /^\/socket\.io(\/|$)/],
      },
    }),
  ],
  server: {
    proxy: {
      // Keep the browser's Host header, so the server sees requests from this page as its own (sameOriginForChanges).
      '/api': { target: `http://localhost:${process.env.PORT ?? 3000}`, changeOrigin: false },
      // Live updates (US-24): polling and the WebSocket upgrade.
      '/socket.io': { target: `http://localhost:${process.env.PORT ?? 3000}`, changeOrigin: false, ws: true },
    },
  },
});
