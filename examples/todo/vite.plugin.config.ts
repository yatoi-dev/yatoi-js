import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { yatoiAlias } from './vite/yatoi-alias.js'

/**
 * Chapter 2 of the README: builds the calendar plugin to a single,
 * dependency-free ESM file — `dist-plugin/calendar.js` — the way a plugin
 * from a CDN would ship, instead of a file the host imports from its own
 * source tree. `vite preview` serves whatever `build.outDir` points at, so
 * with this config `vite preview --config vite.plugin.config.ts` serves
 * `dist-plugin/` (see the `preview` block below).
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: yatoiAlias(),
  },
  // The host's public/ (plugins.json etc.) is not part of the plugin bundle.
  publicDir: false,
  build: {
    lib: {
      entry: 'src/plugins/calendar/index.tsx',
      formats: ['es'],
      fileName: () => 'calendar.js',
    },
    outDir: 'dist-plugin',
    emptyOutDir: true,
    rollupOptions: {
      // React is the ONLY thing this bundle externalizes. The host shares
      // one React instance with every plugin it loads by URL via an import
      // map (see vite/react-import-map.ts). @yatoi/kernel, @yatoi/slots,
      // and the contract (src/contract) are bundled in on purpose, not
      // left external. A token's identity is its string `key`
      // (packages/kernel/src/token.ts), not the object `defineService` /
      // `defineCollection` returned, so this plugin's own copy of the
      // kernel protocol still resolves the host's `Todos` service and
      // still contributes to the host's `todo.item.extra` slot and
      // `Views` collection — no shared object, no shared module instance,
      // required. That's what lets this whole plugin ship as one
      // dependency-free ESM file, the way a real CDN-delivered plugin
      // would.
      external: ['react', 'react/jsx-runtime', 'react-dom'],
    },
  },
  preview: {
    port: 5174,
    strictPort: true,
    cors: true, // required: the host on :5173 dynamically imports this file
  },
})
