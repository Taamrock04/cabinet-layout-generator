import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Use 5180 (not Vite's default 5173) to avoid colliding with other local dev
  // servers. strictPort makes a clash fail loudly instead of silently moving.
  server: { port: 5180, strictPort: true },
})
