import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serwuje projekt pod /<nazwa-repo>/
const base = '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // rejestrację robi src/pwa.ts (pasek „nowa wersja”)
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      // pdf.js (ok. 1,8 MB z workerem) ładuje się dopiero przy wyborze okładki z PDF-a — poza cache instalacyjnym
      workbox: {
        globIgnores: ['**/pdf*'],
        // Wtyczka włącza je sama tylko przy własnej rejestracji (injectRegister), a my rejestrujemy w src/pwa.ts, więc jawnie:
        // nowa wersja aktywuje się od razu, a pasek „Dostępna nowa wersja” pojawia się w otwartej aplikacji.
        skipWaiting: true,
        clientsClaim: true,
      },
      manifest: {
        name: 'Łomiankowe SGH',
        short_name: 'LOM.SGH',
        description: 'Organizacja zajęć na studiach',
        id: base,
        lang: 'pl',
        orientation: 'any',
        theme_color: '#4f46e5',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
