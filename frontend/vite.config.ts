import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['jimmi2051-ideapad-l340-15irh-gaming.tailcd88c1.ts.net'],
  },
})
