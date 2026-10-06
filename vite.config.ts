import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Base path must match the GitHub repo name for GitHub Pages project sites
// (https://<user>.github.io/pm-tool/). Update if the repo is renamed.
export default defineConfig({
  plugins: [react()],
  base: '/pm-tool/',
})
