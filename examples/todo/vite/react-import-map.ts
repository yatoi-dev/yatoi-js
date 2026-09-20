import type { Plugin } from 'vite'
import { fileURLToPath } from 'node:url'

const root = (rel: string) => fileURLToPath(new URL(`../${rel}`, import.meta.url))

/**
 * Shares this app's React instance with plugin bundles loaded by URL at
 * runtime (chapter 2 of the README — see ../vite.plugin.config.ts).
 *
 * This app's own code never sees a bare `import 'react'` specifier at
 * runtime — Vite rewrites every such import before the browser gets it
 * (dev: to a pre-bundled dep URL; build: to the bundled chunk this file's
 * import ends up in). So this import map does nothing for the host's own
 * modules; it exists purely for the *remote* plugin. `calendar.js` is
 * built with `react` and `react/jsx-runtime` left external (see
 * vite.plugin.config.ts), so its bare specifiers reach the browser
 * unresolved, exactly as a script tag would — and only a native import map
 * can tell the browser what they mean. Pointing both at this app's own
 * React re-export (src/shared/react.ts, src/shared/jsx-runtime.ts) is what
 * makes the plugin's `useState` run against *this* app's React dispatcher
 * instead of a second copy's — two React instances in one page is an
 * "Invalid hook call".
 *
 * This plugin is the one piece of this whole example that is genuinely
 * about cross-bundle module sharing, not about yatoyi itself — which is
 * why it only matters when plugins are loaded from another origin
 * (README chapter 2). It's harmless the rest of the time.
 */
export function reactImportMap(): Plugin {
  let command: 'build' | 'serve' = 'serve'
  return {
    name: 'todo-example-react-import-map',
    config(_config, env) {
      command = env.command
      // The two shims get their own entries so Rollup emits them as
      // separate, stably-named chunks (see output.entryFileNames below)
      // instead of inlining them into the app bundle. Because both the
      // app entry and these entries import the real 'react' package,
      // Rollup's chunk graph shares one underlying React chunk between
      // them — the app and the shims end up pointing at the same code.
      return {
        build: {
          rollupOptions: {
            input: {
              index: root('index.html'),
              react: root('src/shared/react.ts'),
              'jsx-runtime': root('src/shared/jsx-runtime.ts'),
            },
            // Load-bearing: nothing *inside* this build statically imports
            // the shims' named exports (the app's own JSX/hooks resolve
            // straight to Rollup's internal React chunk; only an
            // externally-loaded plugin bundle, invisible to this build,
            // imports from these entries by name at runtime). Without
            // `'strict'`, Rollup treats those exports as unused and
            // tree-shakes the `export { ... }` statement off the chunk
            // entirely — the file still runs, but has no exports at all.
            // `'strict'` forces every declared export of every entry to
            // survive.
            preserveEntrySignatures: 'strict',
            output: {
              entryFileNames: (chunk) =>
                chunk.name === 'react' || chunk.name === 'jsx-runtime'
                  ? 'shared/[name].js'
                  : 'assets/[name]-[hash].js',
            },
          },
        },
      }
    },
    transformIndexHtml() {
      const imports =
        command === 'serve'
          ? { react: '/src/shared/react.ts', 'react/jsx-runtime': '/src/shared/jsx-runtime.ts' }
          : { react: '/shared/react.js', 'react/jsx-runtime': '/shared/jsx-runtime.js' }
      return [
        {
          tag: 'script',
          attrs: { type: 'importmap' },
          children: JSON.stringify({ imports }, null, 2),
          injectTo: 'head-prepend',
        },
      ]
    },
  }
}
