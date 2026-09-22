import { fileURLToPath } from 'node:url'

/**
 * Points `@yatoi/*` straight at library source instead of `dist/`, so
 * dev/build here never needs `pnpm build` to have run first. Shared by
 * vite.config.ts (the host) and vite.plugin.config.ts (chapter 2's
 * separately built calendar plugin) — both need the same four packages
 * aliased, including the slots subpath before the package root.
 */
export function yatoiAlias(): Record<string, string> {
  const src = (pkg: string) => fileURLToPath(new URL(`../../../packages/${pkg}/src/index.ts`, import.meta.url))
  return {
    '@yatoi/kernel': src('kernel'),
    '@yatoi/react/slots': fileURLToPath(
      new URL('../../../packages/react/src/slots/index.ts', import.meta.url),
    ),
    '@yatoi/react': src('react'),
    '@yatoi/slots': src('slots'),
  }
}
