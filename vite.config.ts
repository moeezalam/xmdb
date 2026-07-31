import { copyFileSync, existsSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const LOCAL_LIB = 'public/data/library.local.json'
const OUT_LIB = 'dist/data/library.json'
const OUT_LOCAL = 'dist/data/library.local.json'

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
      rmSync(resolve(__dirname, OUT_LOCAL), { force: true })
    },
  }
}

/**
 * The opposite build, for a private host: promote library.local.json to be the
 * bundled library so the deployed site opens on the real watchlist. Used for
 * the Vercel deploy; the public GitHub Pages build never sets this, which is
 * what keeps the demo on the open site.
 */
function usePrivateLibrary(): Plugin {
  return {
    name: 'xmdb-use-private-library',
    apply: 'build',
    closeBundle() {
      const src = resolve(__dirname, LOCAL_LIB)
      if (!existsSync(src)) {
        throw new Error(
          `XMDB_PRIVATE build needs ${LOCAL_LIB}. Generate it with:\n` +
            `  npm run library -- "path/to/Watchlist.csv" --local`,
        )
      }
      copyFileSync(src, resolve(__dirname, OUT_LIB))
      rmSync(resolve(__dirname, OUT_LOCAL), { force: true })
    },
  }
}

/*
 * GitHub Pages serves project sites from /<repo>/; Vercel serves from the
 * root. Everything that loads an asset at runtime goes through
 * import.meta.env.BASE_URL, so this is the only place a path is stated.
 */
export default defineConfig(({ command }) => {
  const isPrivate = process.env.XMDB_PRIVATE === '1'
  return {
    base: command === 'build' && !isPrivate ? '/xmdb/' : '/',
    plugins: [react(), isPrivate ? usePrivateLibrary() : excludeLocalLibrary()],
  }
})
