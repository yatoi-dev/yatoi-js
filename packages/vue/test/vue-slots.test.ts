import { defineComponent, h, nextTick, onMounted, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { createKernel, defineCollection, definePlugin, defineService, type Kernel, type Scope } from '@yatoi/kernel'
import { Requires, provideKernel } from '@yatoi/vue'
import { Slot, contribute, type SlotRenderer, type SlotRendererProps } from '../src/slots/index.js'

// ── host declares its contract ─────────────────────────────────────
interface Task {
  id: string
  title: string
}
declare module '@yatoi/slots' {
  interface Slots {
    'sidebar.item': { collapsed: boolean }
    'task.card': { task: Task }
    a: { label: string }
    b: { label: string }
  }
}

const Clock = defineService<{ now(): number }>('clock')
const clockPlugin = definePlugin({
  name: 'clock',
  provides: [Clock],
  setup(scope) {
    scope.provide(Clock, { now: () => 42 })
  },
})

const plugin = (name: string, setup: (scope: Scope<readonly []>) => void) => definePlugin({ name, setup })

describe('typing', () => {
  it('props are checked on both sides', () => {
    plugin('typed', (scope) => {
      contribute(scope, 'sidebar.item', ({ collapsed }) => {
        expectTypeOf(collapsed).toEqualTypeOf<boolean>()
        return null
      })
      contribute(scope, 'task.card', ({ task, Default }) => {
        expectTypeOf(task).toEqualTypeOf<Task>()
        expectTypeOf(Default).toBeCallableWith({ task }, {} as never)
        return null
      })
      // @ts-expect-error unknown slot
      contribute(scope, 'nope', () => null)
      // @ts-expect-error wrong prop shape
      contribute(scope, 'sidebar.item', ({ task }: SlotRendererProps<'task.card'>) => null)
    })
    // @ts-expect-error missing required slot prop
    void h(Slot, { name: 'task.card' })
    // @ts-expect-error unknown slot
    void h(Slot, { name: 'nope' })
  })
})

describe('<Slot mode="list">', () => {
  it('renders append contributions in priority order, with slot props; fallback when empty', async () => {
    const kernel = createKernel()
    const Root = defineComponent({
      setup() {
        provideKernel(kernel)
        return () =>
          h(Slot, { name: 'sidebar.item', collapsed: true }, { fallback: () => h('i', 'empty') })
      },
    })
    const w = mount(Root, { attachTo: document.body })
    expect(w.text()).toBe('empty')

    kernel.load(
      plugin('a', (scope) => {
        contribute(scope, 'sidebar.item', ({ collapsed }) => h('li', `a ${collapsed ? 'c' : 'x'}`))
      }),
      plugin('b', (scope) => {
        contribute(scope, 'sidebar.item', () => h('li', 'b'), { priority: 10 })
        contribute(scope, 'sidebar.item', () => h('li', 'not-listed'), { mode: 'wrap' })
      }),
    )
    await nextTick()
    const items = w.findAll('li').map((el) => el.text())
    expect(items).toEqual(['b', 'a c'])
  })

  it('a contribution disappears when its plugin unloads and returns on reload', async () => {
    const kernel = createKernel()
    const p = plugin('a', (scope) => {
      contribute(scope, 'sidebar.item', () => h('li', 'a'))
    })
    kernel.load(p)
    const Root = defineComponent({
      setup() {
        provideKernel(kernel)
        return () =>
          h(Slot, { name: 'sidebar.item', collapsed: false }, { fallback: () => h('i', 'empty') })
      },
    })
    const w = mount(Root, { attachTo: document.body })
    expect(w.text()).toBe('a')
    kernel.unload(p)
    await nextTick()
    expect(w.text()).toBe('empty')
    kernel.load(p)
    await nextTick()
    expect(w.text()).toBe('a')
  })

  it('contributed components keep identity across host re-renders (no remount)', async () => {
    const kernel = createKernel()
    const mounted = vi.fn()
    // A functional component can't call lifecycle hooks itself, so wrap
    // the contribution in a tiny stateful component instead — the point
    // under test is whether *it* remounts. Defined once, outside the
    // renderer closure: a fresh `defineComponent({...})` per call would
    // be a different component type on every render and remount by
    // construction, which is a test bug, not something Slot should mask.
    const Item = defineComponent({
      props: { collapsed: { type: Boolean, required: true } },
      setup(props) {
        onMounted(mounted)
        return () => h('li', String(props.collapsed))
      },
    })
    kernel.load(
      plugin('a', (scope) => {
        contribute(scope, 'sidebar.item', ({ collapsed }) => h(Item, { collapsed }))
      }),
    )
    const collapsed = ref(false)
    const Root = defineComponent({
      setup() {
        provideKernel(kernel)
        return () => h(Slot, { name: 'sidebar.item', collapsed: collapsed.value })
      },
    })
    const w = mount(Root, { attachTo: document.body })
    await nextTick()
    const after = mounted.mock.calls.length

    // Host re-render (props change) with the collection and default
    // unchanged must not remount the contributed component.
    collapsed.value = true
    await nextTick()
    expect(w.text()).toBe('true')
    expect(mounted.mock.calls.length).toBe(after)
  })
})

// V2 (spec §13.6 "reactive name"): "if the framework lets the slot name
// change after mount, the rendering construct MUST follow it: contributions
// of the new slot, not the one it mounted with."
describe('<Slot> reactive name', () => {
  it('follows a change to `name` after mount', async () => {
    const kernel = createKernel()
    kernel.load(
      plugin('a-contributor', (scope) => {
        contribute(scope, 'a', () => h('span', 'from-a'))
      }),
    )
    kernel.load(
      plugin('b-contributor', (scope) => {
        contribute(scope, 'b', () => h('span', 'from-b'))
      }),
    )

    const Wrapper = defineComponent({
      props: { name: { type: String, required: true } },
      setup(props) {
        provideKernel(kernel)
        return () => h(Slot, { name: props.name as 'a' | 'b', label: 'x' })
      },
    })
    const w = mount(Wrapper, { props: { name: 'a' }, attachTo: document.body })
    await nextTick()
    expect(w.text()).toBe('from-a')

    await w.setProps({ name: 'b' })
    await nextTick()
    expect(w.text()).toBe('from-b')

    // Proves the subscription itself followed `name`, not just the read:
    // a fresh contribution to the *new* slot must show up too.
    kernel.load(
      plugin('b-contributor-2', (scope) => {
        contribute(scope, 'b', () => h('span', 'from-b-2'), { priority: 10 })
      }),
    )
    await nextTick()
    expect(w.text()).toBe('from-b-2from-b')
  })
})

describe('<Slot mode="single">', () => {
  const task: Task = { id: '1', title: 'Write tests' }
  const DefaultCard = (slotProps: { task: Task }) => h('span', `card:${slotProps.task.title}`)

  function mountSingle(kernel: Kernel) {
    const Root = defineComponent({
      setup() {
        provideKernel(kernel)
        return () =>
          h(
            Slot,
            { name: 'task.card', mode: 'single', task },
            { default: (p: { task: Task }) => DefaultCard(p) },
          )
      },
    })
    return mount(Root, { attachTo: document.body })
  }

  it('renders the host default with no contributions', () => {
    const kernel = createKernel()
    const w = mountSingle(kernel)
    expect(w.text()).toBe('card:Write tests')
  })

  it('wrap calls through to Default; replace beats the default; highest priority is outermost', async () => {
    const kernel = createKernel()
    const w = mountSingle(kernel)

    kernel.load(
      plugin('highlight', (scope) => {
        contribute(
          scope,
          'task.card',
          ({ task, Default }) => h('mark', [h(Default, { task })]),
          { mode: 'wrap', priority: 1 },
        )
      }),
    )
    await nextTick()
    expect(w.find('mark').text()).toBe('card:Write tests')

    kernel.load(
      plugin('compact', (scope) => {
        contribute(scope, 'task.card', ({ task }) => h('span', `compact:${task.id}`), { mode: 'replace' })
      }),
    )
    await nextTick()
    expect(w.find('mark').text()).toBe('compact:1')
    expect(w.text()).not.toContain('card:Write tests')

    kernel.load(
      plugin('outer', (scope) => {
        contribute(
          scope,
          'task.card',
          ({ task, Default }) => h('b', [h(Default, { task })]),
          { mode: 'wrap', priority: 5 },
        )
      }),
    )
    await nextTick()
    expect(w.find('b > mark').text()).toBe('compact:1')
  })

  it('the default returns when the replacing plugin unloads', async () => {
    const kernel = createKernel()
    const compact = plugin('compact', (scope) => {
      contribute(scope, 'task.card', () => h('span', 'compact'), { mode: 'replace' })
    })
    kernel.load(compact)
    const w = mountSingle(kernel)
    expect(w.text()).toBe('compact')
    kernel.unload(compact)
    await nextTick()
    expect(w.text()).toBe('card:Write tests')
  })
})

describe('cross-bundle interop', () => {
  it('a contribution made through a hand-built collection token (a second @yatoi/vue-slots copy) shows up in <Slot>', () => {
    const kernel = createKernel()
    const foreignToken = defineCollection<SlotRenderer<'sidebar.item'>>('slot:sidebar.item')
    const p = plugin('foreign', (scope) => {
      scope.contribute(foreignToken, () => h('li', 'foreign'))
    })
    kernel.load(p)
    const Root = defineComponent({
      setup() {
        provideKernel(kernel)
        return () =>
          h(Slot, { name: 'sidebar.item', collapsed: false }, { fallback: () => h('i', 'empty') })
      },
    })
    const w = mount(Root, { attachTo: document.body })
    expect(w.text()).toBe('foreign')
  })
})

describe('end to end: kernel → Requires → Slot', () => {
  it('a plugin depending on Clock contributes UI that disappears with the clock and comes back', async () => {
    const kernel = createKernel()
    const widget = definePlugin({
      name: 'clock-widget',
      inject: [Clock],
      setup(scope) {
        contribute(scope, 'sidebar.item', ({ collapsed }) =>
          h('li', collapsed ? String(scope.get(Clock).now()) : `time ${scope.get(Clock).now()}`),
        )
      },
    })
    kernel.load(widget, clockPlugin)
    const Root = defineComponent({
      setup() {
        provideKernel(kernel)
        return () =>
          h(
            Requires,
            { of: [Clock] },
            {
              fallback: () => h('i', 'no clock'),
              default: () =>
                h(Slot, { name: 'sidebar.item', collapsed: false }, { fallback: () => h('i', 'no items') }),
            },
          )
      },
    })
    const w = mount(Root, { attachTo: document.body })
    expect(w.text()).toBe('time 42')

    kernel.unload(clockPlugin)
    await nextTick()
    expect(w.text()).toBe('no clock')
    expect(kernel.pluginState(widget)).toBe('inactive')

    kernel.load(clockPlugin)
    await nextTick()
    expect(w.text()).toBe('time 42')
  })
})
