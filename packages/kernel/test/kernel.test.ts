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

  // E1 (spec §9.4, amended): `disposing` only counts as `loading` if the
  // record will restart. A failed scope's cleanup that will settle to
  // sticky `failed` is not progress, so it reads `absent`.
  it('reads absent, not loading, while a failed scope\'s cleanup is in flight', () => {
    const { kernel } = quietKernel()
    const gate = deferred()
    const clock = definePlugin({
      name: 'clock',
      provides: [Clock],
      setup(scope) {
        scope.provide(Clock, { now: () => 1 })
        scope.defer(() => gate.promise)
        throw new Error('boom')
      },
    })
    kernel.load(clock)
    expect(kernel.pluginState(clock)).toBe('disposing')
    expect(kernel.state(Clock)).toEqual({ status: 'absent' })
    gate.resolve()
  })

  it('stays absent after a sticky failure\'s cleanup settles, with no dependency cycle', async () => {
    const { kernel } = quietKernel()
    const gate = deferred()
    const clock = definePlugin({
      name: 'clock',
      provides: [Clock],
      setup(scope) {
        scope.provide(Clock, { now: () => 1 })
        scope.defer(() => gate.promise)
        throw new Error('boom')
      },
    })
    kernel.load(clock)
    expect(kernel.pluginState(clock)).toBe('disposing')

    gate.resolve()
    await kernel.settle()

    // No dependency ever cycled, so it settles to sticky `failed`, and
    // `state` stays `absent` throughout — never `loading`.
    expect(kernel.pluginState(clock)).toBe('failed')
    expect(kernel.state(Clock)).toEqual({ status: 'absent' })
  })

  it('flips from absent to loading when a dependency cycle clears the failure mid-disposal', async () => {
    const { kernel } = quietKernel()
    const Dep = defineService<{}>('e1-dep')
    const gate = deferred()
    let calls = 0
    const depPlugin = definePlugin({
      name: 'e1-dep-plugin',
      provides: [Dep],
      setup(scope) {
        scope.provide(Dep, {})
      },
    })
    const flaky = definePlugin({
      name: 'flaky',
      inject: [Dep],
      provides: [Clock],
      setup(scope) {
        calls++
        scope.provide(Clock, { now: () => calls })
        scope.defer(() => gate.promise)
        if (calls === 1) throw new Error('boom')
      },
    })
    kernel.load(depPlugin, flaky)
    expect(kernel.pluginState(flaky)).toBe('disposing')
    expect(kernel.state(Clock)).toEqual({ status: 'absent' })

    // The dependency cycling clears the failure — from this moment the
    // same `disposing` record correctly reads `loading` (§7.3).
    kernel.unload(depPlugin)
    expect(kernel.pluginState(flaky)).toBe('disposing')
    expect(kernel.state(Clock)).toEqual({ status: 'loading' })

    gate.resolve()
    await kernel.settle()
    kernel.load(depPlugin)
    await kernel.settle()

    expect(kernel.pluginState(flaky)).toBe('active')
    expect(kernel.state(Clock).status).toBe('present')
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

  // K1 (spec §10.1, §10.6): a throwing on('error') listener must not escape
  // fail(), and must not stop the partial scope from being disposed.
  it('a throwing error listener does not escape kernel.load and the partial scope still unwinds', () => {
    const kernel = createKernel()
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const disposer = vi.fn()
    const badListener = vi.fn(() => {
      throw new Error('listener boom')
    })
    const goodListener = vi.fn()
    kernel.on('error', badListener)
    kernel.on('error', goodListener)

    const bad = definePlugin({
      name: 'bad',
      provides: [Store],
      setup(scope) {
        scope.provide(Store, { items: [] })
        scope.defer(disposer)
        throw new Error('boom')
      },
    })

    expect(() => kernel.load(bad)).not.toThrow()
    expect(kernel.get(Store)).toBeUndefined()
    expect(disposer).toHaveBeenCalledOnce()
    expect(goodListener).toHaveBeenCalledOnce()
    expect(err).toHaveBeenCalledWith(expect.stringMatching(/listener/i), expect.any(Error))
    err.mockRestore()
  })

  it('a throwing error listener during unload does not stop the remaining disposers from running', () => {
    const kernel = createKernel()
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const after = vi.fn()
    const badListener = vi.fn(() => {
      throw new Error('listener boom')
    })
    kernel.on('error', badListener)

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
    err.mockRestore()
  })

  // K2 (spec §7.3): a failed plugin's async cleanup must finish before it
  // is allowed to restart, even though `fail()` marks it failed/inactive
  // synchronously today. Otherwise a second scope's resources overlap the
  // first's still-running disposers. §7.3 also says §7.2's reset rule
  // applies *during* the disposing window: a dependency going absent while
  // cleanup is in flight clears the failure, so the plugin settles to
  // `inactive` (not `failed`) once cleanup finishes, and restarts as soon
  // as deps are present again.
  it('a dependency that cycles while a failed plugin\'s cleanup is in flight retries once cleanup settles', async () => {
    const { kernel } = quietKernel()
    const gate = deferred()
    const disposer = vi.fn(() => gate.promise)
    let setupCalls = 0
    const flaky = definePlugin({
      name: 'flaky',
      inject: [Clock],
      setup(scope) {
        setupCalls++
        scope.defer(disposer)
        if (setupCalls === 1) throw new Error('first time fails')
      },
    })
    const clock = clockPlugin()
    const [, flakyHandle] = kernel.load(clock, flaky)

    expect(kernel.pluginState(flaky)).toBe('disposing')
    expect(flakyHandle!.error).toBeInstanceOf(Error)
    expect(setupCalls).toBe(1)

    // The dependency going absent while `disposing` clears the failure —
    // but the record stays `disposing`: cleanup is still pending, so
    // nothing may restart yet (the reviewer's P1: no second scope may
    // overlap the first's still-running disposer).
    kernel.unload(clock)
    expect(kernel.pluginState(flaky)).toBe('disposing')
    expect(flakyHandle!.error).toBeUndefined()
    expect(setupCalls).toBe(1)

    // And coming back doesn't jump the gate either — cleanup is still
    // pending.
    kernel.load(clock)
    expect(kernel.pluginState(flaky)).toBe('disposing')
    expect(setupCalls).toBe(1)

    gate.resolve()
    await kernel.settle()

    // Cleanup finished; the failure was already cleared, so the plugin
    // restarted on its own once deps were present.
    expect(setupCalls).toBe(2)
    expect(kernel.pluginState(flaky)).toBe('active')
    expect(disposer).toHaveBeenCalledOnce()
  })

  // Contrasting case: §7.2's stickiness still holds when the dependency
  // never went absent during the disposing window.
  it('a failure whose dependencies never went absent stays failed after cleanup settles', async () => {
    const { kernel } = quietKernel()
    const gate = deferred()
    const disposer = vi.fn(() => gate.promise)
    let setupCalls = 0
    const flaky = definePlugin({
      name: 'flaky',
      inject: [Clock],
      setup(scope) {
        setupCalls++
        scope.defer(disposer)
        if (setupCalls === 1) throw new Error('first time fails')
      },
    })
    const clock = clockPlugin()
    const [, flakyHandle] = kernel.load(clock, flaky)

    expect(kernel.pluginState(flaky)).toBe('disposing')
    expect(flakyHandle!.error).toBeInstanceOf(Error)

    gate.resolve()
    await kernel.settle()

    // §7.2: `failed` is sticky and MUST NOT retry on its own — the
    // dependency was present throughout, so the plugin does not get an
    // unsolicited second attempt.
    expect(setupCalls).toBe(1)
    expect(kernel.pluginState(flaky)).toBe('failed')
    expect(flakyHandle!.error).toBeInstanceOf(Error)
    expect(disposer).toHaveBeenCalledOnce()

    // §7.2's actual reset trigger: the dependency becoming absent, then
    // present again, clears the sticky failure and gives a fresh attempt.
    kernel.unload(clock)
    expect(kernel.pluginState(flaky)).toBe('inactive')
    kernel.load(clock)

    expect(setupCalls).toBe(2)
    expect(kernel.pluginState(flaky)).toBe('active')
    expect(disposer).toHaveBeenCalledOnce()
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

// Identity is by `.key`, not by token object, because registry lookups
// (`services.has(token.key)`, cascade matching, `@yatoi/slots`'
// `slot:${name}`) all compare strings. This is what lets a plugin bundle
// delivered from a CDN — carrying its own copy of `@yatoi/kernel` and its
// own token objects — interoperate with the host's kernel: two independently
// created tokens with the same key name the same capability.
describe('11. identity is by key, not by token object', () => {
  it('a consumer created with a separate token object still resolves the provider', () => {
    const kernel = createKernel()
    const A = defineService<Clock>('clock')
    const B = defineService<Clock>('clock')
    expect(A).not.toBe(B)

    const disposed = vi.fn()
    const provider = definePlugin({
      name: 'provider',
      provides: [A],
      setup(scope) {
        scope.provide(A, { now: () => 99 })
        scope.defer(disposed)
      },
    })
    let seenInSetup: number | undefined
    const consumer = definePlugin({
      name: 'consumer',
      inject: [B],
      setup(scope) {
        seenInSetup = scope.get(B).now()
      },
    })

    kernel.load(provider, consumer)
    expect(kernel.pluginState(consumer)).toBe('active')
    expect(seenInSetup).toBe(99)
    expect(kernel.get(B)).toBe(kernel.get(A))
    expect(kernel.state(B)).toEqual(kernel.state(A))

    kernel.unload(provider)
    expect(disposed).toHaveBeenCalledOnce()
    expect(kernel.pluginState(consumer)).toBe('inactive')
    expect(kernel.state(B)).toEqual({ status: 'absent' })

    kernel.load(provider)
    expect(kernel.pluginState(consumer)).toBe('active')
  })

  it('a consumer created with a separate collection token sees contributions made through another', () => {
    const kernel = createKernel()
    const Items = defineCollection<string>('items')
    const OtherItems = defineCollection<string>('items')
    expect(Items).not.toBe(OtherItems)

    const p = definePlugin({
      name: 'p',
      setup(scope) {
        scope.contribute(Items, 'from-a')
      },
    })
    kernel.load(p)
    expect(kernel.list(OtherItems).map((c) => c.value)).toEqual(['from-a'])

    kernel.unload(p)
    expect(kernel.list(OtherItems)).toEqual([])
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
