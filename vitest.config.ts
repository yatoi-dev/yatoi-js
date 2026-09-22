import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const src = (pkg: string) =>
  fileURLToPath(new URL(`./packages/${pkg}/src/index.ts`, import.meta.url))
const slots = (pkg: 'react' | 'vue') =>
  fileURLToPath(new URL(`./packages/${pkg}/src/slots/index.ts`, import.meta.url))

// Source aliases so cross-package tests never depend on a prior build.
const alias = {
  '@yatoi/kernel': src('kernel'),
  '@yatoi/react/slots': slots('react'),
  '@yatoi/react': src('react'),
  '@yatoi/slots': src('slots'),
  '@yatoi/react-slots': src('react-slots'),
  '@yatoi/vue/slots': slots('vue'),
  '@yatoi/vue': src('vue'),
  '@yatoi/vue-slots': src('vue-slots'),
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
          include: ['test/**/*.test.{ts,tsx}', '../react-slots/test/**/*.test.{ts,tsx}'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'slots',
          root: './packages/slots',
          // Framework-neutral: no DOM here, like the kernel.
          environment: 'node',
          include: ['test/**/*.test.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'vue',
          root: './packages/vue',
          environment: 'jsdom',
          setupFiles: ['./test/setup.ts'],
          include: ['test/**/*.test.{ts,tsx}', '../vue-slots/test/**/*.test.{ts,tsx}'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'agent-host',
          root: './examples/agent-host',
          // No DOM here either — this example is the no-React, no-DOM case.
          environment: 'node',
          include: ['test/**/*.test.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'server',
          root: './examples/server',
          // Plain node:http and kernel primitives; no DOM or framework.
          environment: 'node',
          include: ['test/**/*.test.ts'],
        },
      },
    ],
  },
})
