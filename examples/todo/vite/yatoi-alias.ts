import { fileURLToPath } from 'node:url'

/**
 * Points `@yatoi/*` straight at library source instead of `dist/`, so
 * dev/build here never needs `pnpm build` to have run first. Shared by
 * vite.config.ts (the host) and vite.plugin.config.ts (chapter 2's
 * separately built calendar plugin) — both need the same three packages
 * aliased, `@yatoi/react` included even where it's never imported
 * directly, because `@yatoi/slots`' own source imports from it.
 */
export function yatoiAlias(): Record<string, string> {
  const src = (pkg: string) => fileURLToPath(new URL(`../../../packages/${pkg}/src/index.ts`, import.meta.url))
  return {
    '@yatoi/kernel': src('kernel'),
    '@yatoi/react': src('react'),
    '@yatoi/slots': src('slots'),
  }
}
