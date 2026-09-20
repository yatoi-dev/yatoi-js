/**
 * The deliberately nasty case from AGENTS.md: a service unloads while
 * three dependents are mid-async setup. Nothing may leak, nothing may
 * double-run, and observers must never see an intermediate "present".
 */
import { describe, expect, it, vi } from 'vitest'
import { definePlugin, defineService } from '../src/index.js'
import { deferred, flush, quietKernel, recordNotifications } from './helpers.js'

const Clock = defineService<{ now(): number }>('clock')
const Out = [
  defineService<string>('out-a'),
  defineService<string>('out-b'),
  defineService<string>('out-c'),
] as const

function clockPlugin() {
  return definePlugin({
    name: 'clock',
    provides: [Clock],
    setup(scope) {
      scope.provide(Clock, { now: () => 1 })
    },
  })
}

describe('torture: provider unloads while dependents are mid-async setup', () => {
  it('no dependent activates, nothing leaks, and reload activates each exactly once', async () => {
    const { kernel, errors } = quietKernel()
    const gates = [deferred(), deferred(), deferred()]
    const preAwaitDisposers = [vi.fn(), vi.fn(), vi.fn()]
    const postAwaitReached = [0, 0, 0]
    const setupCalls = [0, 0, 0]
    const activations = [0, 0, 0]

    const dependents = [0, 1, 2].map((i) =>
      definePlugin({
        name: `dep-${i}`,
        inject: [Clock],
        provides: [Out[i]!],
        async setup(scope) {
          const run = setupCalls[i]!++
          scope.defer(preAwaitDisposers[i]!)
          // First run: block on the gate (provider will vanish meanwhile).
          // Second run: proceed immediately so the reload can complete.
          if (run === 0) await gates[i]!.promise
          postAwaitReached[i]!++
          scope.provide(Out[i]!, `value-${i}-run-${run}`)
          scope.defer(() => {
            activations[i]!-- // undone on dispose, so a leak shows as a non-zero net
          })
          activations[i]!++
        },
      }),
    )

    const clock = clockPlugin()
    kernel.load(clock, ...dependents)

    // All three are stuck in their first await.
    for (const d of dependents) expect(kernel.pluginState(d)).toBe('starting')
    for (const t of Out) expect(kernel.state(t)).toEqual({ status: 'loading' })

    const outSeen = recordNotifications(kernel, () => Out.map((t) => kernel.state(t).status))

    kernel.unload(clock)

    // Synchronously: all three are torn down, their pre-await effects reversed.
    for (const d of dependents) expect(kernel.pluginState(d)).toBe('inactive')
    for (const fn of preAwaitDisposers) expect(fn).toHaveBeenCalledOnce()
    for (const t of Out) expect(kernel.state(t)).toEqual({ status: 'absent' })

    // Now let the stale setups resume. They must land nowhere.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    gates[1]!.resolve()
    gates[0]!.resolve()
    gates[2]!.resolve()
    await kernel.settle()

    expect(postAwaitReached).toEqual([1, 1, 1]) // they did run past the await…
    for (const t of Out) expect(kernel.get(t)).toBeUndefined() // …but nothing landed
    for (const d of dependents) expect(kernel.pluginState(d)).toBe('inactive')
    expect(warn).toHaveBeenCalledTimes(3) // three ignored `provide`s
    expect(errors).toEqual([])

    // Reload the provider: each dependent activates exactly once, with the second run's value.
    kernel.load(clock)
    await kernel.settle()
    expect(setupCalls).toEqual([2, 2, 2])
    for (const d of dependents) expect(kernel.pluginState(d)).toBe('active')
    expect(Out.map((t) => kernel.get(t))).toEqual(['value-0-run-1', 'value-1-run-1', 'value-2-run-1'])
    expect(activations).toEqual([1, 1, 1])

    // Observer log: statuses went loading → absent → (loading) → present, never a stray present in between.
    const firstPresent = outSeen.findIndex((s) => s.includes('present'))
    const lastAbsent = outSeen.map((s) => s.includes('absent')).lastIndexOf(true)
    expect(firstPresent).toBeGreaterThan(lastAbsent)
    for (const snapshot of outSeen.slice(0, firstPresent)) expect(snapshot).not.toContain('present')

    warn.mockRestore()
    await kernel.dispose()
    expect(activations).toEqual([0, 0, 0])
  })

  it('a stale setup that provides *and then* the scope is disposed does not leave the value behind', async () => {
    const { kernel } = quietKernel()
    const gate = deferred()
    const provided = deferred()
    const Dep = defineService<number>('dep')
    const dependent = definePlugin({
      name: 'dep',
      inject: [Clock],
      provides: [Dep],
      async setup(scope) {
        await gate.promise
        scope.provide(Dep, 1) // lands while active…
        provided.resolve()
        await flush() // …then the provider is pulled during this await
        scope.provide(Dep, 2) // ignored — scope disposed
      },
    })
    const clock = clockPlugin()
    kernel.load(clock, dependent)
    gate.resolve()
    await provided.promise
    expect(kernel.get(Dep)).toBe(1)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    kernel.unload(clock)
    expect(kernel.get(Dep)).toBeUndefined()
    await kernel.settle()
    expect(kernel.get(Dep)).toBeUndefined()
    expect(kernel.pluginState(dependent)).toBe('inactive')
    warn.mockRestore()
  })
})

describe('torture: StrictMode-shaped double invoke, in plain Node', () => {
  it('load → unload → load synchronously yields exactly one active instance', () => {
    const { kernel, errors } = quietKernel()
    const setups: object[] = []
    const disposed = vi.fn()
    const p = definePlugin({
      name: 'p',
      provides: [Clock],
      setup(scope) {
        setups.push(scope)
        scope.provide(Clock, { now: () => setups.length })
        scope.defer(disposed)
      },
    })
    kernel.load(p)
    kernel.unload(p)
    kernel.load(p)

    expect(setups).toHaveLength(2)
    expect(disposed).toHaveBeenCalledOnce()
    expect(kernel.pluginState(p)).toBe('active')
    expect(kernel.get(Clock)?.now()).toBe(2)
    expect(errors).toEqual([])
  })

  it('load → unload → load with an async disposer: second instance waits, then activates once', async () => {
    const { kernel } = quietKernel()
    const gate = deferred()
    const setup = vi.fn()
    const p = definePlugin({
      name: 'p',
      setup(scope) {
        setup()
        scope.defer(() => gate.promise)
      },
    })
    kernel.load(p)
    kernel.unload(p)
    kernel.load(p) // a *new* record; old one is still disposing
    expect(setup).toHaveBeenCalledTimes(2) // independent records don't gate each other…
    expect(kernel.pluginState(p)).toBe('active')
    gate.resolve()
    await kernel.settle()
    expect(setup).toHaveBeenCalledTimes(2)
    expect(kernel.pluginState(p)).toBe('active')
  })

  it('a provider with an async disposer still releases its token synchronously, so the re-load provides cleanly', async () => {
    // All disposers are *invoked* synchronously (only their promises are
    // awaited), and the provide-remover is one of them. So the second
    // instance never collides with the first — semantics #8 is not tripped.
    const { kernel, errors } = quietKernel()
    const gate = deferred()
    const p = definePlugin({
      name: 'p',
      provides: [Clock],
      setup(scope) {
        scope.provide(Clock, { now: () => 1 })
        scope.defer(() => gate.promise)
      },
    })
    kernel.load(p)
    kernel.unload(p)
    expect(kernel.get(Clock)).toBeUndefined() // token released synchronously (LIFO: provide's remover ran)
    kernel.load(p)
    expect(kernel.pluginState(p)).toBe('active')
    expect(kernel.get(Clock)?.now()).toBe(1)
    expect(errors).toEqual([])
    gate.resolve()
    await kernel.settle()
    expect(kernel.get(Clock)?.now()).toBe(1)
    expect(kernel.pluginState(p)).toBe('active')
  })
})
