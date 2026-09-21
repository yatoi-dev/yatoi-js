import { defineComponent, h, nextTick, onUnmounted, type Component } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { createKernel, definePlugin, defineService, type Kernel } from '@yatoi/kernel'
import {
  KernelProvider,
  Requires,
  provideKernel,
  useKernel,
  usePlugin,
  useService,
  useServiceState,
} from '../src/index.js'

interface Clock {
  now(): number
}
const Clock = defineService<Clock>('clock')
const Store = defineService<{ name: string }>('store')

const clockPlugin = definePlugin({
  name: 'clock',
  provides: [Clock],
  setup(scope) {
    scope.provide(Clock, { now: () => 42 })
  },
})
const storePlugin = definePlugin({
  name: 'store',
  provides: [Store],
  setup(scope) {
    scope.provide(Store, { name: 'local' })
  },
})

function mountWithKernel(kernel: Kernel, component: Component, props: Record<string, unknown> = {}) {
  const Root = defineComponent({
    setup() {
      provideKernel(kernel)
      return () => h(component, props)
    },
  })
  return mount(Root, { attachTo: document.body })
}

describe('provideKernel / useKernel / KernelProvider', () => {
  it('throws a clear error outside a provider', () => {
    const Probe = defineComponent({
      setup() {
        useKernel()
        return () => null
      },
    })
    expect(() => mount(Probe)).toThrow(/no provideKernel\(\)\/<KernelProvider>/)
  })

  it('provideKernel makes the kernel available to useKernel below it', () => {
    const kernel = createKernel()
    const Probe = defineComponent({
      setup() {
        const k = useKernel()
        return () => h('span', String(k === kernel))
      },
    })
    const wrapper = mountWithKernel(kernel, Probe)
    expect(wrapper.text()).toBe('true')
  })

  it('<KernelProvider> works from a template-style tree', () => {
    // Mounted through a wrapping Root rather than
    // `mount(KernelProvider, { props: { kernel } })` directly: @vue/test-
    // utils backs a mounted component's top-level `props` option with a
    // *deep* `reactive({})` (to support its `setProps()`), unlike a
    // normal Vue component instance's own props (`shallowReactive`) — so
    // passing an opaque kernel object through it there would return a
    // reactive Proxy wrapper from `useKernel()`, not the exact reference,
    // which is a test-utils-root-props quirk, not something a real
    // `<KernelProvider :kernel="kernel">` usage hits (ordinary component
    // props are shallow).
    const kernel = createKernel()
    const Probe = defineComponent({
      setup() {
        const k = useKernel()
        return () => h('span', String(k === kernel))
      },
    })
    const wrapper = mount(
      defineComponent({
        setup() {
          return () => h(KernelProvider, { kernel }, { default: () => h(Probe) })
        },
      }),
    )
    expect(wrapper.text()).toBe('true')
  })
})

describe('useService', () => {
  it('ref updates on provide and unprovide with the exact provided reference', async () => {
    const kernel = createKernel()
    const seen: (Clock | undefined)[] = []
    const Probe = defineComponent({
      setup() {
        const clock = useService(Clock)
        return () => {
          seen.push(clock.value)
          return h('span', clock.value ? `now=${clock.value.now()}` : 'no clock')
        }
      },
    })
    const wrapper = mountWithKernel(kernel, Probe)
    expect(wrapper.text()).toBe('no clock')

    kernel.load(clockPlugin)
    await nextTick()
    expect(wrapper.text()).toBe('now=42')
    expect(seen.at(-1)).toBe(kernel.get(Clock))

    kernel.unload(clockPlugin)
    await nextTick()
    expect(wrapper.text()).toBe('no clock')
  })

  it('does not trigger for unrelated kernel changes', async () => {
    const kernel = createKernel()
    kernel.load(clockPlugin)
    let renders = 0
    const Probe = defineComponent({
      setup() {
        useService(Clock)
        return () => {
          renders++
          return null
        }
      },
    })
    mountWithKernel(kernel, Probe)
    const afterMount = renders
    kernel.load(storePlugin)
    await nextTick()
    expect(renders).toBe(afterMount)
  })

  it('the ref is read-only', () => {
    // Vue's readonly refs don't throw on write in production mode — they
    // warn (dev mode) and silently drop the write. Assert the drop, and
    // that a warning was raised, rather than a thrown exception.
    const kernel = createKernel()
    kernel.load(clockPlugin)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let clockRef!: ReturnType<typeof useService<Clock>>
    const Probe = defineComponent({
      setup() {
        clockRef = useService(Clock)
        return () => null
      },
    })
    mountWithKernel(kernel, Probe)
    const before = clockRef.value
    // @ts-expect-error read-only ref
    clockRef.value = undefined
    expect(clockRef.value).toBe(before)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('useServiceState', () => {
  it('stable objects per status; loading during async setup', async () => {
    const kernel = createKernel()
    let resolve!: () => void
    const slow = definePlugin({
      name: 'slow-clock',
      provides: [Clock],
      async setup(scope) {
        await new Promise<void>((r) => (resolve = r))
        scope.provide(Clock, { now: () => 1 })
      },
    })
    const states: string[] = []
    const objects: object[] = []
    const Probe = defineComponent({
      setup() {
        const s = useServiceState(Clock)
        return () => {
          states.push(s.value.status)
          objects.push(s.value)
          return h('span', s.value.status)
        }
      },
    })
    const wrapper = mountWithKernel(kernel, Probe)
    expect(wrapper.text()).toBe('absent')

    kernel.load(slow)
    await nextTick()
    expect(wrapper.text()).toBe('loading')
    const loadingObj = objects.at(-1)

    resolve()
    await kernel.settle()
    await nextTick()
    expect(wrapper.text()).toBe('present')

    // Same object while still loading (no spurious writes in between).
    const loadingObjs = new Set(objects.filter((o) => (o as { status: string }).status === 'loading'))
    expect(loadingObjs.size).toBe(1)
    expect(objects.filter((o) => (o as { status: string }).status === 'loading').every((o) => o === loadingObj)).toBe(
      true,
    )
  })
})

describe('Requires', () => {
  it('fallback while absent; default slot with values when present', async () => {
    const kernel = createKernel()
    const Root = defineComponent({
      setup() {
        provideKernel(kernel)
        return () =>
          h(
            Requires,
            { of: [Clock, Store] },
            {
              fallback: () => h('span', 'waiting'),
              default: ([clock, store]: [Clock, { name: string }]) => h('span', `${store.name}:${clock.now()}`),
            },
          )
      },
    })
    const root = mount(Root, { attachTo: document.body })
    expect(root.text()).toBe('waiting')

    kernel.load(clockPlugin)
    await nextTick()
    expect(root.text()).toBe('waiting') // one of two is not enough

    kernel.load(storePlugin)
    await nextTick()
    expect(root.text()).toBe('local:42')
  })

  it('unmounts children when a service disappears, remounts on return', async () => {
    const kernel = createKernel()
    kernel.load(clockPlugin)
    const mounted = vi.fn()
    const cleaned = vi.fn()
    const Child = defineComponent({
      props: { clock: { type: Object as () => Clock, required: true } },
      setup(props) {
        mounted()
        onUnmounted(cleaned)
        return () => h('span', `child ${props.clock.now()}`)
      },
    })
    const Root = defineComponent({
      setup() {
        provideKernel(kernel)
        return () =>
          h(
            Requires,
            { of: [Clock] },
            {
              fallback: () => h('span', 'gone'),
              default: ([clock]: [Clock]) => h(Child, { clock }),
            },
          )
      },
    })
    const wrapper = mount(Root, { attachTo: document.body })
    expect(wrapper.text()).toBe('child 42')
    const mountsBefore = mounted.mock.calls.length
    const cleansBefore = cleaned.mock.calls.length

    kernel.unload(clockPlugin)
    await nextTick()
    expect(wrapper.text()).toBe('gone')
    expect(cleaned.mock.calls.length).toBe(cleansBefore + 1)

    kernel.load(clockPlugin)
    await nextTick()
    expect(wrapper.text()).toBe('child 42')
    expect(mounted.mock.calls.length).toBeGreaterThan(mountsBefore)
  })

  it('resolves a token created separately from the one the provider used, by key', async () => {
    const kernel = createKernel()
    const B = defineService<Clock>('clock')
    const provider = definePlugin({
      name: 'clock-b',
      provides: [Clock],
      setup(scope) {
        scope.provide(Clock, { now: () => 7 })
      },
    })
    const Root = defineComponent({
      setup() {
        provideKernel(kernel)
        return () =>
          h(
            Requires,
            { of: [B] },
            {
              fallback: () => h('span', 'waiting'),
              default: ([clock]: [Clock]) => h('span', `now=${clock.now()}`),
            },
          )
      },
    })
    const wrapper = mount(Root, { attachTo: document.body })
    expect(wrapper.text()).toBe('waiting')
    kernel.load(provider)
    await nextTick()
    expect(wrapper.text()).toBe('now=7')
    kernel.unload(provider)
    await nextTick()
    expect(wrapper.text()).toBe('waiting')
  })

  it('does not re-render children for unrelated kernel changes', async () => {
    const kernel = createKernel()
    kernel.load(clockPlugin)
    let renders = 0
    const Child = defineComponent({
      setup() {
        return () => {
          renders++
          return null
        }
      },
    })
    const Root = defineComponent({
      setup() {
        provideKernel(kernel)
        return () => h(Requires, { of: [Clock] }, { default: () => h(Child) })
      },
    })
    mount(Root, { attachTo: document.body })
    const after = renders
    kernel.load(storePlugin)
    await nextTick()
    expect(renders).toBe(after)
  })
})

describe('usePlugin', () => {
  it('mount loads, unmount disposes, exactly one active instance', async () => {
    const kernel = createKernel()
    const setups = vi.fn()
    const disposals = vi.fn()
    const local = definePlugin({
      name: 'local',
      provides: [Clock],
      setup(scope) {
        setups()
        scope.provide(Clock, { now: () => 7 })
        scope.defer(disposals)
      },
    })
    const Editor = defineComponent({
      setup() {
        usePlugin(local)
        const clock = useService(Clock)
        return () => h('span', clock.value ? `clock ${clock.value.now()}` : 'none')
      },
    })
    const wrapper = mountWithKernel(kernel, Editor)
    await nextTick()
    expect(wrapper.text()).toBe('clock 7')
    expect(setups).toHaveBeenCalledTimes(1)
    expect(kernel.pluginState(local)).toBe('active')

    wrapper.unmount()
    expect(kernel.pluginState(local)).toBe('inactive')
    expect(disposals).toHaveBeenCalledTimes(1)
    expect(kernel.get(Clock)).toBeUndefined()
  })

  it('mount → unmount → mount (a Vue remount) ends with one active instance and one disposal of the first', async () => {
    const kernel = createKernel()
    const setups = vi.fn()
    const disposals = vi.fn()
    const local = definePlugin({
      name: 'remountable',
      setup(scope) {
        setups()
        scope.defer(disposals)
      },
    })
    const Editor = defineComponent({
      setup() {
        usePlugin(local)
        return () => null
      },
    })

    const first = mountWithKernel(kernel, Editor)
    await nextTick()
    first.unmount()
    expect(setups).toHaveBeenCalledTimes(1)
    expect(disposals).toHaveBeenCalledTimes(1)

    const second = mountWithKernel(kernel, Editor)
    await nextTick()
    expect(setups).toHaveBeenCalledTimes(2)
    expect(disposals).toHaveBeenCalledTimes(1)
    expect(kernel.pluginState(local)).toBe('active')

    second.unmount()
    expect(disposals).toHaveBeenCalledTimes(2)
  })
})

describe('reactivity sanity', () => {
  it('two components reading the same token render the same value after a flip', async () => {
    const kernel = createKernel()
    const A = defineComponent({
      setup() {
        const clock = useService(Clock)
        return () => h('span', { 'data-a': true }, clock.value ? 'yes' : 'no')
      },
    })
    const B = defineComponent({
      setup() {
        const clock = useService(Clock)
        return () => h('span', { 'data-b': true }, clock.value ? 'yes' : 'no')
      },
    })
    const Root = defineComponent({
      setup() {
        provideKernel(kernel)
        return () => h('div', [h(A), h(B)])
      },
    })
    mount(Root, { attachTo: document.body })
    kernel.load(clockPlugin)
    await nextTick()
    expect(document.querySelector('[data-a]')!.textContent).toBe('yes')
    expect(document.querySelector('[data-b]')!.textContent).toBe('yes')
  })
})
