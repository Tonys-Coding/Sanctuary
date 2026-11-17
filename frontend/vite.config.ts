import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// During development the API runs on :5001; proxying keeps cookies same-origin.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: { '/api': 'http://localhost:5001' },
    // GitHub Codespaces serves the dev server from *.app.github.dev
    allowedHosts: ['.app.github.dev'],
  },
})
