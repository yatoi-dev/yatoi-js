import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const src = (pkg: string) =>
  fileURLToPath(new URL(`./packages/${pkg}/src/index.ts`, import.meta.url))

// Source aliases so cross-package tests never depend on a prior build.
const alias = {
  '@weft/kernel': src('kernel'),
  '@weft/react': src('react'),
  '@weft/slots': src('slots'),
}

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'kernel',
          root: './packages/kernel',
          // Load-bearing: the kernel must run in plain Node. No DOM here.
          environment: 'node',
          include: ['test/**/*.test.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'react',
          root: './packages/react',
          environment: 'jsdom',
          setupFiles: ['./test/setup.ts'],
          include: ['test/**/*.test.{ts,tsx}'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'slots',
          root: './packages/slots',
          environment: 'jsdom',
          setupFiles: ['./test/setup.ts'],
          include: ['test/**/*.test.{ts,tsx}'],
        },
      },
    ],
  },
})
