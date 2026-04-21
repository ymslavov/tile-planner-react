import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves this app at https://<user>.github.io/tile-planner-react/
// The base path ensures asset URLs resolve correctly.
export default defineConfig({
  plugins: [react()],
  base: '/tile-planner-react/',
})
