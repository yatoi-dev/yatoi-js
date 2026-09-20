import { describe, expect, expectTypeOf, it } from 'vitest'
import { defineCollection, definePlugin, defineService, type Scope } from '../src/index.js'

describe('tokens', () => {
  it('are frozen objects carrying only a key', () => {
    const Clock = defineService<{ now(): number }>('clock')
    expect(Clock).toEqual({ kind: 'service', key: 'clock' })
    expect(Object.isFrozen(Clock)).toBe(true)

    const Items = defineCollection<string>('items')
    expect(Items).toEqual({ kind: 'collection', key: 'items' })
  })

  it('two tokens with the same key are distinct values but the same runtime identity', () => {
    const A = defineService<number>('x')
    const B = defineService<number>('x')
    expect(A).not.toBe(B)
    expect(A.key).toBe(B.key)
  })
})

describe('definePlugin typing', () => {
  const Clock = defineService<{ now(): number }>('clock')
  const Store = defineService<{ save(): void }>('store')

  it('types scope.get non-null for injected tokens and optional otherwise', () => {
    definePlugin({
      name: 'sync',
      inject: [Clock],
      setup(scope) {
        expectTypeOf(scope.get(Clock)).toEqualTypeOf<{ now(): number }>()
        expectTypeOf(scope.get(Store)).toEqualTypeOf<{ save(): void } | undefined>()
      },
    })
  })

  it('with no inject, every get is optional', () => {
    definePlugin({
      name: 'bare',
      setup(scope) {
        expectTypeOf(scope.get(Clock)).toEqualTypeOf<{ now(): number } | undefined>()
      },
    })
  })

  it('provide is checked against the token type', () => {
    definePlugin({
      name: 'clock',
      provides: [Clock],
      setup(scope: Scope<readonly []>) {
        scope.provide(Clock, { now: () => 1 })
        // @ts-expect-error wrong shape
        scope.provide(Clock, { nope: true })
      },
    })
  })

  it('requires a name', () => {
    expect(() => definePlugin({ name: '', setup() {} })).toThrow(/name/)
  })
})
