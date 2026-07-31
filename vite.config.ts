import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves project sites from /<repo>/, so the production build
// needs that prefix. Everything that loads an asset at runtime goes through
// import.meta.env.BASE_URL, so this is the only place the path is stated.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/xmdb/' : '/',
  plugins: [react()],
}))
