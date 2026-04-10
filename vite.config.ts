import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    solid(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Shorecast',
        short_name: 'Shorecast',
        description: 'NOAA tide predictions and weather for US coastal stations',
        theme_color: '#e8dcc8',
        background_color: '#e8dcc8',
        display: 'standalone',
        icons: [
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff,woff2}'],
        navigateFallback: '/index.html',
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
    allowedHosts: 'all',
  },
})
