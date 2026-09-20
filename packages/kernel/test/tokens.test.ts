import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  collection,
  createKernel,
  defineCollection,
  definePlugin,
  defineService,
  service,
  type CollectionToken,
  type Scope,
  type ServiceToken,
} from '../src/index.js'

// Simulates a host augmenting the registry interface to declare services by
// key, the way a third-party plugin that can't depend on a contract package
// would look them up.
declare module '../src/index.js' {
  interface Services {
    clock: { now(): number }
  }
  interface Collections {
    items: string
  }
}

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

describe('service() / collection() — the registry-interface token form', () => {
  it('resolves keys through the augmented Services/Collections interfaces, and rejects unknown ones', () => {
    expectTypeOf(service('clock')).toEqualTypeOf<ServiceToken<{ now(): number }>>()
    // @ts-expect-error unknown key
    service('nope')

    expectTypeOf(collection('items')).toEqualTypeOf<CollectionToken<string>>()
    // @ts-expect-error unknown key
    collection('nope')
  })

  it('is the same capability as the matching defineService/defineCollection call, by key', () => {
    const kernel = createKernel()
    let seenInSetup: { now(): number } | undefined
    const provider = definePlugin({
      name: 'provider',
      provides: [defineService<{ now(): number }>('clock')],
      setup(scope) {
        scope.provide(defineService<{ now(): number }>('clock'), { now: () => 5 })
      },
    })
    const consumer = definePlugin({
      name: 'consumer',
      inject: [service('clock')],
      setup(scope) {
        const clock = scope.get(service('clock'))
        expectTypeOf(clock).toEqualTypeOf<{ now(): number }>()
        seenInSetup = clock
      },
    })

    kernel.load(provider, consumer)
    expect(kernel.pluginState(consumer)).toBe('active')
    expect(seenInSetup?.now()).toBe(5)
  })
})
