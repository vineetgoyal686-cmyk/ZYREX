import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          charts: ['recharts'],
          pdf: ['html2canvas', 'jspdf'],
        },
      },
    },
  },
  server: {
    historyApiFallback: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: [
      'hm-production-adb4.up.railway.app',
      'zyrex-production-777c.up.railway.app',
      'app.zyhawk.in',
    ],
  },
})
