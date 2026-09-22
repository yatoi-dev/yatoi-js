import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

execFileSync('pnpm', ['pack:check'], { cwd: root, stdio: 'inherit' })
execFileSync('pnpm', ['exec', 'changeset', 'publish'], { cwd: root, stdio: 'inherit' })
