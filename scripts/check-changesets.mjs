// Enforces the versioning scheme in docs/releasing.md: patches are per
// package, but a minor or major is a new contract and moves all four
// packages together. Changesets has no mode for that (`fixed` locks
// patches too, `linked` makes late packages jump to catch up), so the rule
// lives here: any pending minor/major changeset must name every package.
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packages = readdirSync(join(root, 'packages')).map(
  (dir) => JSON.parse(readFileSync(join(root, 'packages', dir, 'package.json'), 'utf8')).name,
)

const changesetDir = join(root, '.changeset')
const files = readdirSync(changesetDir).filter((f) => f.endsWith('.md') && f !== 'README.md')

let ok = true
for (const file of files) {
  const text = readFileSync(join(changesetDir, file), 'utf8')
  const front = /^---\n([\s\S]*?)\n---/.exec(text)
  if (!front) continue
  const bumps = new Map()
  for (const line of front[1].split('\n')) {
    const m = /^['"]?(@?[^'":]+)['"]?\s*:\s*(major|minor|patch)\s*$/.exec(line.trim())
    if (m) bumps.set(m[1], m[2])
  }
  const level = [...bumps.values()].some((b) => b === 'major')
    ? 'major'
    : [...bumps.values()].some((b) => b === 'minor')
      ? 'minor'
      : null
  if (!level) continue
  const missing = packages.filter((name) => !bumps.has(name))
  const lower = [...bumps].filter(([, b]) => b !== level).map(([n]) => n)
  if (missing.length || lower.length) {
    ok = false
    console.error(`[check:changesets] .changeset/${file} is a ${level} release but`)
    if (missing.length) console.error(`  omits: ${missing.join(', ')}`)
    if (lower.length) console.error(`  bumps below ${level}: ${lower.join(', ')}`)
    console.error(`  A ${level} moves every package together; list all four at "${level}".`)
  }
}

if (!ok) process.exit(1)
console.log(`[check:changesets] ${files.length} changeset(s) satisfy the hybrid version rule`)

// The custom rule above checks the shape of changesets that exist. The
// official status command compares package changes with the base branch and
// catches the other failure mode: forgetting a changeset altogether.
const statusArgs = process.argv.slice(2)
if (statusArgs[0] === '--') statusArgs.shift()
const status = spawnSync('pnpm', ['exec', 'changeset', 'status', ...statusArgs], {
  cwd: root,
  stdio: 'inherit',
})
if (status.error) throw status.error
if (status.status !== 0) process.exit(status.status ?? 1)
