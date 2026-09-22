import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packageDirectories = [
  'kernel',
  'react',
  'slots',
  'react-slots',
  'vue',
  'vue-slots',
]

function fail(message) {
  throw new Error(`[pack:check] ${message}`)
}

console.log('Cleaning and building publishable packages...')
for (const directory of packageDirectories) {
  rmSync(join(root, 'packages', directory, 'dist'), { recursive: true, force: true })
}
execFileSync('pnpm', ['--filter', './packages/*', '-r', 'run', 'build'], {
  cwd: root,
  stdio: 'inherit',
})

const destination = mkdtempSync(join(tmpdir(), 'yatoi-pack-'))

try {
  for (const directory of packageDirectories) {
    const cwd = join(root, 'packages', directory)
    const output = execFileSync(
      'pnpm',
      ['--silent', 'pack', '--json', '--pack-destination', destination],
      { cwd, encoding: 'utf8' },
    )
    const jsonStart = output.indexOf('{\n  "name"')
    if (jsonStart === -1) fail(`could not read pack report for packages/${directory}`)
    const packed = JSON.parse(output.slice(jsonStart))
    const paths = packed.files.map((file) => file.path)

    for (const required of ['LICENSE', 'README.md', 'package.json', 'dist/index.js', 'dist/index.d.ts']) {
      if (!paths.includes(required)) fail(`${packed.name} is missing ${required}`)
    }

    const unexpected = paths.filter(
      (path) =>
        !['LICENSE', 'README.md', 'package.json'].includes(path) &&
        !/^dist\/.+\.(?:js|d\.ts)$/.test(path),
    )
    if (unexpected.length > 0) {
      fail(`${packed.name} contains unexpected files: ${unexpected.join(', ')}`)
    }

    for (const path of paths.filter((path) => path.startsWith('dist/'))) {
      if (readFileSync(join(cwd, path), 'utf8').includes('sourceMappingURL=')) {
        fail(`${packed.name} contains a broken source-map reference in ${path}`)
      }
    }

    const manifestText = execFileSync(
      'tar',
      ['-xOf', packed.filename, 'package/package.json'],
      { encoding: 'utf8' },
    )
    const manifest = JSON.parse(manifestText)

    if (manifest.version === '0.0.0') fail(`${packed.name} still has the placeholder version`)
    if (manifest.publishConfig?.access !== 'public') fail(`${packed.name} is not configured as public`)
    if (manifest.publishConfig?.registry !== 'https://registry.npmjs.org/') {
      fail(`${packed.name} does not target the public npm registry`)
    }

    for (const [name, range] of Object.entries(manifest.dependencies ?? {})) {
      if (String(range).startsWith('workspace:')) {
        fail(`${packed.name} still has an unpublished workspace range for ${name}`)
      }
    }

    console.log(`Checked ${packed.name}@${packed.version} (${paths.length} files)`)
  }
} finally {
  rmSync(destination, { recursive: true, force: true })
}
