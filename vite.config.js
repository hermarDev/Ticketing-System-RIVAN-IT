import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  envPrefix: 'VITE_',
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        ops: resolve(__dirname, 'ops.html'),
      },
    },
  },
  server: {
    // Listen on all interfaces so phones on the same Wi‑Fi can use the Network URL.
    host: true,
    proxy: {
      // Nominatim usage policy wants an identifying User-Agent; browsers cannot set it.
      // Dev: proxy adds UA. Production: configure the same /api/nominatim reverse proxy
      // (or set VITE_NOMINATIM_BASE). Public Nominatim also allows CORS (*) as fallback.
      '/api/nominatim': {
        target: 'https://nominatim.openstreetmap.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/nominatim/, ''),
        headers: {
          'User-Agent':
            'NetOpsTicketingSystem/1.0 (https://github.com/netops; location-autocomplete)',
        },
      },
    },
  },
})
