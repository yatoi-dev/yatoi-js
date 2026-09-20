import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const src = (pkg: string) =>
  fileURLToPath(new URL(`../../packages/${pkg}/src/index.ts`, import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Point at source for a smooth dev loop — no rebuild-the-library step.
      // `exports` in each package's package.json still points at `dist/`
      // for anyone consuming this repo as installed packages.
      '@weft/kernel': src('kernel'),
      '@weft/react': src('react'),
      '@weft/slots': src('slots'),
    },
  },
})
