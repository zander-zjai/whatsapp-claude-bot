import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon-32.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'ZJAI Client Portal',
        short_name: 'ZJAI Portal',
        description: 'Manage your Zara AI receptionist and WhatsApp bot — conversations, quotes, call logs, and settings.',
        start_url: '/client/login',
        scope: '/',
        display: 'standalone',
        background_color: '#0A0A0B',
        theme_color: '#0A0A0B',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      // No runtimeCaching configured -- the service worker only precaches
      // the built app shell (JS/CSS/HTML) for installability. API calls go
      // straight to the Railway backend on a different origin, untouched.
    }),
  ],
  server: {
    port: 5173,
  },
});
