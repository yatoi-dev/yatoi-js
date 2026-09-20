import { fileURLToPath } from 'node:url'

/**
 * Points `@yatoyi/*` straight at library source instead of `dist/`, so
 * dev/build here never needs `pnpm build` to have run first. Shared by
 * vite.config.ts (the host) and vite.plugin.config.ts (chapter 2's
 * separately built calendar plugin) — both need the same three packages
 * aliased, `@yatoyi/react` included even where it's never imported
 * directly, because `@yatoyi/slots`' own source imports from it.
 */
export function yatoyiAlias(): Record<string, string> {
  const src = (pkg: string) => fileURLToPath(new URL(`../../../packages/${pkg}/src/index.ts`, import.meta.url))
  return {
    '@yatoyi/kernel': src('kernel'),
    '@yatoyi/react': src('react'),
    '@yatoyi/slots': src('slots'),
  }
}
