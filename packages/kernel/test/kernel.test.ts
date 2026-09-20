import { describe, expect, it, vi } from 'vitest'
import { createKernel, defineCollection, definePlugin, defineService } from '../src/index.js'
import { deferred, flush, quietKernel, recordNotifications } from './helpers.js'

interface Clock {
  now(): number
}
const Clock = defineService<Clock>('clock')
const Store = defineService<{ items: string[] }>('store')

const clockPlugin = (onDispose = vi.fn()) =>
  definePlugin({
    name: 'clock',
    provides: [Clock],
    setup(scope) {
      scope.provide(Clock, { now: () => 42 })
      scope.defer(onDispose)
    },
  })

describe('1. registration is not activation', () => {
  it('a plugin with unmet inject registers but stays inactive', () => {
    const kernel = createKernel()
    const sync = definePlugin({ name: 'sync', inject: [Clock], setup: vi.fn() })
    const [handle] = kernel.load(sync)
    expect(handle!.state).toBe('inactive')
    expect(sync.setup).not.toHaveBeenCalled()
  })

  it('activates the moment its dependencies are present, in any load order', () => {
    const kernel = createKernel()
    const setup = vi.fn()
    const sync = definePlugin({ name: 'sync', inject: [Clock], setup })
    kernel.load(sync)
    kernel.load(clockPlugin())
    expect(kernel.pluginState(sync)).toBe('active')
    expect(setup).toHaveBeenCalledOnce()
  })

  it('a plugin with no inject activates synchronously on load', () => {
    const kernel = createKernel()
    const [h] = kernel.load(clockPlugin())
    expect(h!.state).toBe('active')
    expect(kernel.get(Clock)?.now()).toBe(42)
  })

  it('unload unregisters and removes provided services', () => {
    const kernel = createKernel()
    const clock = clockPlugin()
    kernel.load(clock)
    kernel.unload(clock)
    expect(kernel.get(Clock)).toBeUndefined()
    expect(kernel.pluginState(clock)).toBe('inactive')
  })

  it('loading the same plugin twice is an error; unloading a non-loaded plugin is a no-op', () => {
    const kernel = createKernel()
    const clock = clockPlugin()
    kernel.load(clock)
    expect(() => kernel.load(clock)).toThrow(/already loaded/)
    expect(() => kernel.unload(definePlugin({ name: 'never', setup() {} }))).not.toThrow()
  })
})

describe('2. cascade unload', () => {
  it('disposes dependents (LIFO disposers) before the provider, transitively', () => {
    const kernel = createKernel()
    const order: string[] = []
    const Derived = defineService<number>('derived')

    const clock = definePlugin({
      name: 'clock',
      provides: [Clock],
      setup(scope) {
        scope.provide(Clock, { now: () => 1 })
        scope.defer(() => order.push('clock:dispose'))
      },
    })
    const mid = definePlugin({
      name: 'mid',
      inject: [Clock],
      provides: [Derived],
      setup(scope) {
        scope.defer(() => order.push('mid:first-registered'))
        scope.provide(Derived, scope.get(Clock).now() * 2)
        scope.defer(() => order.push('mid:last-registered'))
      },
    })
    const leaf = definePlugin({
      name: 'leaf',
      inject: [Derived],
      setup(scope) {
        scope.defer(() => order.push('leaf:dispose'))
      },
    })

    kernel.load(clock, mid, leaf)
    expect(kernel.pluginState(leaf)).toBe('active')
    expect(kernel.get(Derived)).toBe(2)

    kernel.unload(clock)
    expect(order).toEqual(['leaf:dispose', 'mid:last-registered', 'mid:first-registered', 'clock:dispose'])
    expect(kernel.get(Derived)).toBeUndefined()
    expect(kernel.pluginState(mid)).toBe('inactive')
    expect(kernel.pluginState(leaf)).toBe('inactive')
  })

  it('dependent cleanup can still read the service it depended on', () => {
    const kernel = createKernel()
    let seenInCleanup: number | undefined
    const clock = clockPlugin()
    const sync = definePlugin({
      name: 'sync',
      inject: [Clock],
      setup(scope) {
        scope.defer(() => {
          seenInCleanup = scope.get(Clock).now()
        })
      },
    })
    kernel.load(clock, sync)
    kernel.unload(clock)
    expect(seenInCleanup).toBe(42)
  })
})

describe('3. reactive reload', () => {
  it('re-runs setup with a fresh scope when dependencies return', () => {
    const kernel = createKernel()
    const setup = vi.fn()
    const clock = clockPlugin()
    const sync = definePlugin({ name: 'sync', inject: [Clock], setup })
    kernel.load(sync, clock)
    kernel.unload(clock)
    kernel.load(clock)
    expect(setup).toHaveBeenCalledTimes(2)
    expect(setup.mock.calls[0]![0]).not.toBe(setup.mock.calls[1]![0])
    expect(kernel.pluginState(sync)).toBe('active')
  })

  it('waits for async disposal before restarting (disposing → inactive → starting → active)', async () => {
    const kernel = createKernel()
    const gate = deferred()
    const states: string[] = []
    const setup = vi.fn((scope: { defer(fn: () => Promise<void>): void }) => {
      scope.defer(() => gate.promise)
    })
    const clock = clockPlugin()
    const sync = definePlugin({ name: 'sync', inject: [Clock], setup })
    kernel.load(clock, sync)
    kernel.subscribe(() => states.push(kernel.pluginState(sync)))

    kernel.unload(clock)
    expect(kernel.pluginState(sync)).toBe('disposing')
    kernel.load(clock)
    // Clock is back, but sync must not restart while its old scope is still tearing down.
    expect(kernel.pluginState(sync)).toBe('disposing')
    expect(setup).toHaveBeenCalledTimes(1)

    gate.resolve()
    await kernel.settle()
    expect(kernel.pluginState(sync)).toBe('active')
    expect(setup).toHaveBeenCalledTimes(2)
    expect(states.at(-1)).toBe('active')
  })
})

describe('4. sync facade over async', () => {
  it('state() flips synchronously on removal and never exposes a pending disposal', async () => {
    const kernel = createKernel()
    const gate = deferred()
    const clock = definePlugin({
      name: 'clock',
      provides: [Clock],
      setup(scope) {
        scope.provide(Clock, { now: () => 1 })
        scope.defer(() => gate.promise) // slow async cleanup
      },
    })
    kernel.load(clock)
    expect(kernel.state(Clock)).toEqual({ status: 'present', value: { now: expect.any(Function) } })

    kernel.unload(clock)
    expect(kernel.state(Clock)).toEqual({ status: 'absent' })
    expect(kernel.pluginState(clock)).toBe('disposing')

    gate.resolve()
    await kernel.settle()
    expect(kernel.state(Clock)).toEqual({ status: 'absent' })
  })

  it('subscribe fires once per public mutation, synchronously', () => {
    const kernel = createKernel()
    const listener = vi.fn()
    kernel.subscribe(listener)
    const clock = clockPlugin()
    const sync = definePlugin({ name: 'sync', inject: [Clock], setup: vi.fn() })

    kernel.load(clock, sync) // registers two, activates two, provides one — one notification
    expect(listener).toHaveBeenCalledTimes(1)
    kernel.unload(clock) // cascades — still one notification
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('version bumps on every change and is stable otherwise', () => {
    const kernel = createKernel()
    const v0 = kernel.version
    kernel.load(clockPlugin())
    const v1 = kernel.version
    expect(v1).toBeGreaterThan(v0)
    kernel.get(Clock)
    kernel.state(Clock)
    expect(kernel.version).toBe(v1)
  })

  it('reports loading while a provider is mid-async-setup or disposing-with-reload-pending', async () => {
    const kernel = createKernel()
    const started = deferred()
    const disposed = deferred()
    const clock = definePlugin({
      name: 'clock',
      provides: [Clock],
      async setup(scope) {
        await started.promise
        scope.provide(Clock, { now: () => 1 })
        scope.defer(() => disposed.promise)
      },
    })
    kernel.load(clock)
    expect(kernel.state(Clock)).toEqual({ status: 'loading' })
    started.resolve()
    await kernel.settle()
    expect(kernel.state(Clock).status).toBe('present')

    // Unloading: provider is going away for good → absent, not loading.
    kernel.unload(clock)
    expect(kernel.state(Clock)).toEqual({ status: 'absent' })
    disposed.resolve()
    await kernel.settle()
  })

  it('a provider blocked on its own deps reads absent, not loading', () => {
    const kernel = createKernel()
    const Derived = defineService<number>('derived')
    kernel.load(
      definePlugin({
        name: 'mid',
        inject: [Clock],
        provides: [Derived],
        setup(scope) {
          scope.provide(Derived, 1)
        },
      }),
    )
    expect(kernel.state(Derived)).toEqual({ status: 'absent' })
  })
})

describe('5. post-disposal scope calls', () => {
  it('defer after dispose runs immediately; provide/contribute are ignored; get returns the injected value', async () => {
    const { kernel } = quietKernel()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const Items = defineCollection<string>('items')
    const Late = defineService<number>('late')
    const resume = deferred()
    let captured: { get(t: typeof Clock): Clock; defer(fn: () => void): void } | undefined

    const dependent = definePlugin({
      name: 'dependent',
      inject: [Clock],
      provides: [Late],
      async setup(scope) {
        captured = scope
        await resume.promise
        scope.provide(Late, 1)
        scope.contribute(Items, 'x')
      },
    })
    const clock = clockPlugin()
    kernel.load(clock, dependent)
    kernel.unload(clock)

    const lateDisposer = vi.fn()
    captured!.defer(lateDisposer)
    expect(lateDisposer).toHaveBeenCalledOnce()
    expect(captured!.get(Clock).now()).toBe(42)

    resume.resolve()
    await kernel.settle()
    expect(kernel.get(Late)).toBeUndefined()
    expect(kernel.list(Items)).toHaveLength(0)
    expect(kernel.pluginState(dependent)).toBe('inactive')
    expect(warn).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })
})

describe('6. error containment', () => {
  it('a throwing setup fails that plugin, unwinds its partial effects, and spares siblings', () => {
    const { kernel, errors } = quietKernel()
    const unwound = vi.fn()
    const bad = definePlugin({
      name: 'bad',
      provides: [Store],
      setup(scope) {
        scope.defer(unwound)
        scope.provide(Store, { items: [] })
        throw new Error('boom')
      },
    })
    const good = clockPlugin()
    const [badHandle] = kernel.load(bad, good)

    expect(badHandle!.state).toBe('failed')
    expect(badHandle!.error).toBeInstanceOf(Error)
    expect(unwound).toHaveBeenCalledOnce()
    expect(kernel.get(Store)).toBeUndefined()
    expect(kernel.pluginState(good)).toBe('active')
    expect(errors).toHaveLength(1)
  })

  it('a rejecting async setup fails the same way', async () => {
    const { kernel, errors } = quietKernel()
    const bad = definePlugin({
      name: 'bad',
      async setup() {
        await flush()
        throw new Error('async boom')
      },
    })
    kernel.load(bad)
    expect(kernel.pluginState(bad)).toBe('starting')
    await kernel.settle()
    expect(kernel.pluginState(bad)).toBe('failed')
    expect(errors).toHaveLength(1)
  })

  it('failure does not retry in a loop; it resets when a dependency cycles', () => {
    const { kernel } = quietKernel()
    let attempts = 0
    const flaky = definePlugin({
      name: 'flaky',
      inject: [Clock],
      setup() {
        attempts++
        if (attempts === 1) throw new Error('first time fails')
      },
    })
    const clock = clockPlugin()
    kernel.load(clock, flaky)
    expect(kernel.pluginState(flaky)).toBe('failed')
    expect(attempts).toBe(1)

    kernel.unload(clock)
    expect(kernel.pluginState(flaky)).toBe('inactive')
    kernel.load(clock)
    expect(kernel.pluginState(flaky)).toBe('active')
    expect(attempts).toBe(2)
  })

  it('disposer errors are reported, not thrown, and do not stop other disposers', () => {
    const { kernel, errors } = quietKernel()
    const after = vi.fn()
    const p = definePlugin({
      name: 'p',
      setup(scope) {
        scope.defer(after)
        scope.defer(() => {
          throw new Error('cleanup boom')
        })
      },
    })
    kernel.load(p)
    expect(() => kernel.unload(p)).not.toThrow()
    expect(after).toHaveBeenCalledOnce()
    expect(errors).toHaveLength(1)
  })

  it('without an error listener, errors go to console.error', () => {
    const kernel = createKernel()
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    kernel.load(
      definePlugin({
        name: 'bad',
        setup() {
          throw new Error('x')
        },
      }),
    )
    expect(err).toHaveBeenCalledOnce()
    err.mockRestore()
  })
})

describe('7. provide guard', () => {
  it('providing an undeclared token is a setup error', () => {
    const { kernel, errors } = quietKernel()
    const sneaky = definePlugin({
      name: 'sneaky',
      setup(scope) {
        scope.provide(Clock, { now: () => 0 })
      },
    })
    kernel.load(sneaky)
    expect(kernel.pluginState(sneaky)).toBe('failed')
    expect(String(errors[0])).toMatch(/not in this plugin's `provides`/)
    expect(kernel.get(Clock)).toBeUndefined()
  })
})

describe('8. same token, two providers', () => {
  it('first active provider wins; the second fails and the first is untouched', () => {
    const { kernel, errors } = quietKernel()
    const a = clockPlugin()
    const b = definePlugin({
      name: 'clock-b',
      provides: [Clock],
      setup(scope) {
        scope.provide(Clock, { now: () => 99 })
      },
    })
    kernel.load(a, b)
    expect(kernel.get(Clock)?.now()).toBe(42)
    expect(kernel.pluginState(b)).toBe('failed')
    expect(String(errors[0])).toMatch(/already provided by "clock"/)

    // Once the winner leaves, the loser is still failed until its own deps cycle — it has none, so it stays failed.
    kernel.unload(a)
    expect(kernel.get(Clock)).toBeUndefined()
    expect(kernel.pluginState(b)).toBe('failed')
  })

  it('a stale disposer never evicts a newer provider of the same token', () => {
    const kernel = createKernel()
    const a = clockPlugin()
    kernel.load(a)
    kernel.unload(a)
    const b = definePlugin({
      name: 'clock-b',
      provides: [Clock],
      setup(scope) {
        scope.provide(Clock, { now: () => 99 })
      },
    })
    kernel.load(b)
    expect(kernel.get(Clock)?.now()).toBe(99)
  })
})

describe('9. scope tree', () => {
  it('children load inside a parent and dispose before the parent, children-first', () => {
    const kernel = createKernel()
    const order: string[] = []
    const child = definePlugin({
      name: 'child',
      setup(scope) {
        scope.defer(() => order.push('child'))
      },
    })
    const parent = definePlugin({
      name: 'parent',
      setup(scope) {
        scope.defer(() => order.push('parent'))
        scope.load(child)
      },
    })
    kernel.load(parent)
    expect(kernel.pluginState(child)).toBe('active')
    kernel.unload(parent)
    expect(order).toEqual(['child', 'parent'])
    expect(kernel.pluginState(child)).toBe('inactive')
  })

  it('children see parent-provided services and cascade with the parent', () => {
    const kernel = createKernel()
    const child = definePlugin({
      name: 'child',
      inject: [Clock],
      setup: vi.fn(),
    })
    const parent = definePlugin({
      name: 'parent',
      provides: [Clock],
      setup(scope) {
        scope.provide(Clock, { now: () => 7 })
        scope.load(child)
      },
    })
    kernel.load(parent)
    expect(child.setup).toHaveBeenCalledOnce()
    kernel.unload(parent)
    kernel.load(parent)
    expect(child.setup).toHaveBeenCalledTimes(2)
  })

  it('a child handle can dispose just the child; loading after parent dispose throws', () => {
    const kernel = createKernel()
    const child = definePlugin({ name: 'child', setup: vi.fn() })
    let parentScope!: { load(p: typeof child): { dispose(): void } }
    const parent = definePlugin({
      name: 'parent',
      setup(scope) {
        parentScope = scope
      },
    })
    kernel.load(parent)
    const h = parentScope.load(child)
    expect(kernel.pluginState(child)).toBe('active')
    h.dispose()
    expect(kernel.pluginState(child)).toBe('inactive')
    kernel.unload(parent)
    expect(() => parentScope.load(child)).toThrow(/after scope disposed/)
  })

  it('kernel.unload does not reach child plugins — they belong to their parent', () => {
    const kernel = createKernel()
    const child = definePlugin({ name: 'child', setup() {} })
    const parent = definePlugin({
      name: 'parent',
      setup(scope) {
        scope.load(child)
      },
    })
    kernel.load(parent)
    kernel.unload(child) // no-op
    expect(kernel.pluginState(child)).toBe('active')
  })
})

describe('10. collections', () => {
  const Items = defineCollection<string>('items')

  it('contribute is a scope effect: removed on dispose; list is priority-sorted and stable', () => {
    const kernel = createKernel()
    const a = definePlugin({
      name: 'a',
      setup(scope) {
        scope.contribute(Items, 'low', { priority: -1 })
        scope.contribute(Items, 'default-1')
      },
    })
    const b = definePlugin({
      name: 'b',
      setup(scope) {
        scope.contribute(Items, 'high', { priority: 10, mode: 'wrap' })
        scope.contribute(Items, 'default-2')
      },
    })
    kernel.load(a, b)
    const first = kernel.list(Items)
    expect(first.map((c) => c.value)).toEqual(['high', 'default-1', 'default-2', 'low'])
    expect(first[0]).toMatchObject({ mode: 'wrap', owner: 'b', priority: 10 })
    expect(first[1]!.mode).toBe('append')
    expect(kernel.list(Items)).toBe(first) // same reference while unchanged

    kernel.unload(b)
    const second = kernel.list(Items)
    expect(second).not.toBe(first)
    expect(second.map((c) => c.value)).toEqual(['default-1', 'low'])
  })

  it('an empty collection is a shared frozen empty array', () => {
    const kernel = createKernel()
    expect(kernel.list(Items)).toBe(kernel.list(defineCollection('other')))
    expect(Object.isFrozen(kernel.list(Items))).toBe(true)
  })

  it('contributions notify subscribers', () => {
    const kernel = createKernel()
    const seen = recordNotifications(kernel, () => kernel.list(Items).length)
    kernel.load(
      definePlugin({
        name: 'a',
        setup(scope) {
          scope.contribute(Items, 'x')
        },
      }),
    )
    expect(seen).toEqual([1])
  })
})

describe('kernel.dispose', () => {
  it('unloads everything and waits for async disposers', async () => {
    const kernel = createKernel()
    const gate = deferred()
    const done = vi.fn()
    kernel.load(
      definePlugin({
        name: 'slow',
        setup(scope) {
          scope.defer(async () => {
            await gate.promise
            done()
          })
        },
      }),
      clockPlugin(),
    )
    const p = kernel.dispose()
    expect(kernel.get(Clock)).toBeUndefined()
    gate.resolve()
    await p
    expect(done).toHaveBeenCalledOnce()
  })
})
