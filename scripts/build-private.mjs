/**
 * Builds the private variant: root base path and the personal library from
 * public/data/library.local.json promoted to be the bundled one.
 *
 *   npm run build:private
 *
 * A plain npm script cannot set an environment variable portably without
 * pulling in cross-env, so it is set here and vite is spawned with it.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const local = resolve(root, 'public/data/library.local.json')

if (!existsSync(local)) {
  console.error(
    'Missing public/data/library.local.json.\n' +
      'Generate it first:\n' +
      '  npm run library -- "path/to/Watchlist.csv" --local',
  )
  process.exit(1)
}

const env = { ...process.env, XMDB_PRIVATE: '1' }

// One command string rather than argv: passing an args array alongside
// shell:true concatenates without escaping, which Node now warns about.
const run = (command) => {
  const r = spawnSync(command, { cwd: root, env, stdio: 'inherit', shell: true })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

run('npx tsc -b')
run('npx vite build')
