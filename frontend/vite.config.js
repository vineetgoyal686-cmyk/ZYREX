import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        app:  resolve(__dirname, 'app.html'),
      },
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          charts: ['recharts'],
          pdf: ['html2canvas', 'jspdf'],
        },
      },
    },
  },
  preview: {
    allowedHosts: ['hm-production-adb4.up.railway.app', 'zyrex-production-777c.up.railway.app']
  }
})