import type { AnyPlugin } from '@yatoyi/kernel'

/**
 * The code side of the manifest (`public/plugins.json` is the data side —
 * docs/concepts.md "Manifest / activation split"). Each entry is a
 * loader, not the plugin itself, so an id the manifest describes but this
 * registry doesn't list (e.g. "tags") stays installable-in-principle and
 * un-runnable in practice — the "Unavailable" case in the Marketplace.
 *
 * This is chapter 1's loader: the plugin's code is bundled with the app,
 * so `import()` here is an ordinary dynamic import Vite code-splits at
 * build time, not a fetch from another origin. `useMarketplace.ts`'s
 * `loaderFor` is what switches to loading by URL for chapter 2.
 */
export const registry: Record<string, () => Promise<unknown>> = {
  calendar: () => import('./calendar/index.js'),
}
