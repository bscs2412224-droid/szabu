import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // PWA: makes the app installable on a phone and keeps the app shell available offline
    VitePWA({
      // 'prompt': a new version waits until the user taps Update (see UpdateBanner), so a half-written message is never lost
      registerType: 'prompt',
      includeAssets: ['logo.png', 'icons/apple-touch-icon.png', 'icons/favicon-64.png'],
      manifest: {
        id: '/',
        name: 'SzabU - SZABIST Academic Portal',
        short_name: 'SzabU',
        description: 'Official hierarchical messaging app for SZABIST students and faculty.',
        lang: 'en',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        categories: ['education', 'social'],
        // press and hold the app icon (Android) to jump straight to these
        shortcuts: [
          {
            name: 'Messages',
            short_name: 'Messages',
            description: 'Open your conversations',
            url: '/?tab=messages',
            icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'New message',
            short_name: 'New message',
            description: 'Start a new conversation',
            url: '/?compose=1',
            icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
        theme_color: '#0C4DA1',
        background_color: '#ffffff',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Single-page app: unknown routes fall back to the cached app shell,
        // but API calls are never answered from the cache (they carry logins and private data).
        navigateFallback: '/index.html',
        // phone notifications: the handlers for "push" and "notificationclick" live in public/push-handler.js
        importScripts: ['push-handler.js'],
        navigateFallbackDenylist: [/^\/api\//, /^\/socket\.io\//],
        globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
        runtimeCaching: [
          { urlPattern: /^\/api\//, handler: 'NetworkOnly' },
          { urlPattern: /^\/socket\.io\//, handler: 'NetworkOnly' },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      // live messaging (Socket.IO) needs websocket support
      '/socket.io': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
