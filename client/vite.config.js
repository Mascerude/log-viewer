import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Route-level code splitting (see App.jsx's React.lazy() page imports)
    // already pulls out everything splittable — what's left in the main
    // chunk is react/react-dom, recharts (used by the home page's error
    // chart), and the home page itself, all needed for the very first
    // paint. Raised past the default 500kB so that expected, already-
    // minimal chunk doesn't keep tripping the build warning.
    chunkSizeWarningLimit: 650,
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
