import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

// Points `@yatoi/*` straight at library source instead of `dist/`, so
// dev/build here never needs `pnpm build` to have run first — the same
// idea as examples/todo/vite/yatoi-alias.ts, duplicated rather than
// imported: this example only needs four (different) packages, and a
// cross-example relative import read as more indirection than it saved.
function yatoiAlias(): Record<string, string> {
  const src = (pkg: string) => fileURLToPath(new URL(`../../packages/${pkg}/src/index.ts`, import.meta.url))
  return {
    '@yatoi/kernel': src('kernel'),
    '@yatoi/vue/slots': fileURLToPath(
      new URL('../../packages/vue/src/slots/index.ts', import.meta.url),
    ),
    '@yatoi/vue': src('vue'),
    '@yatoi/slots': src('slots'),
    '@yatoi/vue-slots': src('vue-slots'),
  }
}

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: yatoiAlias(),
  },
})
