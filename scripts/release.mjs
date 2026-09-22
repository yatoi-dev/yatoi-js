import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dryRun = process.argv.includes('--dry-run')

execFileSync('pnpm', ['pack:check'], { cwd: root, stdio: 'inherit' })

if (dryRun) {
  console.log('\n[dry run] pack:check passed. Skipping `changeset publish` — nothing was sent to npm.')
  process.exit(0)
}

execFileSync('pnpm', ['exec', 'changeset', 'publish'], { cwd: root, stdio: 'inherit' })
