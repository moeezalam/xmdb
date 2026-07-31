import { rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * public/ is copied verbatim into dist, so a personal library sitting there
 * would be published by any local `npm run build` — git ignoring it only stops
 * it reaching the repo, not the deploy. CI never has the file, but relying on
 * that leaves a footgun on the author's machine, so strip it from the output.
 */
function excludeLocalLibrary(): Plugin {
  return {
    name: 'xmdb-exclude-local-library',
    apply: 'build',
    closeBundle() {
      const stray = resolve(__dirname, 'dist/data/library.local.json')
      rmSync(stray, { force: true })
    },
  }
}

// GitHub Pages serves project sites from /<repo>/, so the production build
// needs that prefix. Everything that loads an asset at runtime goes through
// import.meta.env.BASE_URL, so this is the only place the path is stated.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/xmdb/' : '/',
  plugins: [react(), excludeLocalLibrary()],
}))
