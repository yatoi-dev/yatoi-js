import type { AnyPlugin } from '@yatoyi/kernel'

/**
 * The activation map: code, kept separate from the marketplace's manifest
 * data (`public/plugins.json`). A manifest entry with no matching key here
 * is data the shell can still show (name, description, an "Unavailable"
 * button) without ever importing code for it — the manifest/activation
 * split CLAUDE.md calls out as load-bearing. This is a deliberately tiny
 * stand-in for a real `/loader` package.
 */
export const pluginModules: Record<string, () => Promise<{ default: AnyPlugin }>> = {
  calendar: () => import('./calendar/index.js'),
}
