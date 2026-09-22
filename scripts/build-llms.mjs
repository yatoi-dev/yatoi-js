import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// Absolute URLs: agents fetch llms.txt by URL, so relative paths resolve nowhere.
const base = 'https://github.com/yatoi-dev/yatoi-js/blob/main/'
const packages = ['kernel', 'react', 'slots', 'vue']
const shims = ['react-slots', 'vue-slots']

const links = [
  ...packages.flatMap((name) => [
    [`packages/${name}/README.md`, `Installation and first-use guide for @yatoi/${name}.`],
    [`packages/${name}/AGENTS.md`, `Coding and review instructions for @yatoi/${name}.`],
  ]),
  ...shims.flatMap((name) => [
    [`packages/${name}/README.md`, `Deprecated compatibility shim for @yatoi/${name}.`],
    [`packages/${name}/AGENTS.md`, `Migration instruction for the deprecated @yatoi/${name} shim.`],
  ]),
  ['docs/concepts.md', 'Core vocabulary and the capability-graph mental model.'],
  ['docs/guide.md', 'End-to-end usage patterns for plugins, services, collections, and bindings.'],
  ['docs/pitfalls.md', 'Known mistakes, failure modes, and safer alternatives.'],
  ['docs/spec.md', 'Normative protocol semantics and conformance requirements.'],
  ['docs/beyond-ui.md', 'How the kernel fits agent runtimes and long-running servers.'],
  ['examples/todo/README.md', 'React todo application with installable UI plugins.'],
  ['examples/todo-vue/README.md', 'Vue port of the todo plugin application.'],
  ['examples/agent-host/README.md', 'Node agent host with revocable tools and child-scoped delegation.'],
  ['examples/server/README.md', 'node:http host with capability-driven routes and jobs.'],
]

const index = [
  '# yatoi',
  '',
  'A framework-neutral plugin kernel with reversible effects, typed capability discovery, cascade unload, and React and Vue bindings.',
  '',
  '## Documentation',
  '',
  ...links.map(([path, description]) => `- [${path}](${base}${path}): ${description}`),
  '',
].join('\n')

const fullPaths = [
  'docs/concepts.md',
  'docs/guide.md',
  'docs/pitfalls.md',
  ...packages.concat(shims).map((name) => `packages/${name}/AGENTS.md`),
]
const full = fullPaths
  .map((path) => `# ${path}\n\n${readFileSync(resolve(root, path), 'utf8').trim()}\n`)
  .join('\n')

writeFileSync(resolve(root, 'llms.txt'), index)
writeFileSync(resolve(root, 'llms-full.txt'), full)
