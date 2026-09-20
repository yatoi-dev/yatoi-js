import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { yatoyiAlias } from './vite/yatoyi-alias.js'
import { reactImportMap } from './vite/react-import-map.js'

// `reactImportMap` only matters when plugins are loaded from another
// origin (README chapter 2, `dev:remote` / `VITE_PLUGIN_BASE`); it's
// harmless otherwise.
export default defineConfig({
  plugins: [react(), reactImportMap()],
  resolve: {
    alias: yatoyiAlias(),
  },
})
