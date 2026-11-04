import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In development the browser talks to Vite (5173); Vite forwards /api/* to the FastAPI server (8000).
// Because it looks like ONE website to the browser, cookies and CSRF work without extra setup.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': { target: 'http://localhost:8000', changeOrigin: false } } },
  build: { sourcemap: false, chunkSizeWarningLimit: 600 },
})
