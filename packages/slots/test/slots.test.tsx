import { StrictMode, useEffect, type ReactNode } from 'react'
import { act, render, screen } from '@testing-library/react'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { createKernel, defineCollection, definePlugin, defineService, type Kernel, type Scope } from '@yatoi/kernel'
import { KernelProvider, Requires } from '@yatoi/react'
import { Slot, contribute, type SlotRenderer, type SlotRendererProps } from '../src/index.js'

// ── host declares its contract ─────────────────────────────────────
interface Task {
  id: string
  title: string
}
declare module '../src/index.js' {
  interface Slots {
    'sidebar.item': { collapsed: boolean }
    'task.card': { task: Task }
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

function mount(kernel: Kernel, ui: ReactNode) {
  return render(
    <StrictMode>
      <KernelProvider kernel={kernel}>{ui}</KernelProvider>
    </StrictMode>,
  )
}

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
        expectTypeOf(Default).parameter(0).toEqualTypeOf<{ task: Task }>()
        return null
      })
      // @ts-expect-error unknown slot
      contribute(scope, 'nope', () => null)
      // @ts-expect-error wrong prop shape
      contribute(scope, 'sidebar.item', ({ task }: SlotRendererProps<'task.card'>) => null)
    })
    // @ts-expect-error missing required slot prop
    void (<Slot name="task.card" />)
    // @ts-expect-error unknown slot
    void (<Slot name="nope" />)
  })
})

describe('<Slot mode="list">', () => {
  it('renders append contributions in priority order, with slot props; fallback when empty', () => {
    const kernel = createKernel()
    mount(kernel, <Slot name="sidebar.item" collapsed={true} fallback={<i>empty</i>} />)
    expect(screen.getByText('empty')).toBeTruthy()

    act(() => {
      kernel.load(
        plugin('a', (scope) => {
          contribute(scope, 'sidebar.item', ({ collapsed }) => <li>a {collapsed ? 'c' : 'x'}</li>)
        }),
        plugin('b', (scope) => {
          contribute(scope, 'sidebar.item', () => <li>b</li>, { priority: 10 })
          contribute(scope, 'sidebar.item', () => <li>not-listed</li>, { mode: 'wrap' })
        }),
      )
    })
    const items = screen.getAllByRole('listitem').map((el) => el.textContent)
    expect(items).toEqual(['b', 'a c'])
  })

  it('a contribution disappears when its plugin unloads and returns on reload', () => {
    const kernel = createKernel()
    const p = plugin('a', (scope) => {
      contribute(scope, 'sidebar.item', () => <li>a</li>)
    })
    kernel.load(p)
    mount(kernel, <Slot name="sidebar.item" collapsed={false} fallback={<i>empty</i>} />)
    expect(screen.getByText('a')).toBeTruthy()
    act(() => kernel.unload(p))
    expect(screen.getByText('empty')).toBeTruthy()
    act(() => {
      kernel.load(p)
    })
    expect(screen.getByText('a')).toBeTruthy()
  })

  it('contributed components keep identity across host re-renders (no remount)', () => {
    const kernel = createKernel()
    const mounted = vi.fn()
    kernel.load(
      plugin('a', (scope) => {
        contribute(scope, 'sidebar.item', ({ collapsed }) => {
          useEffect(() => {
            mounted()
          }, [])
          return <li>{String(collapsed)}</li>
        })
      }),
    )
    const { rerender } = mount(kernel, <Slot name="sidebar.item" collapsed={false} />)
    const after = mounted.mock.calls.length
    rerender(
      <StrictMode>
        <KernelProvider kernel={kernel}>
          <Slot name="sidebar.item" collapsed={true} />
        </KernelProvider>
      </StrictMode>,
    )
    expect(screen.getByText('true')).toBeTruthy()
    expect(mounted.mock.calls.length).toBe(after)
  })
})

describe('<Slot mode="single">', () => {
  const task: Task = { id: '1', title: 'Write tests' }
  const DefaultCard = ({ task }: { task: Task }) => <span>card:{task.title}</span>

  it('renders the host default with no contributions', () => {
    const kernel = createKernel()
    mount(
      kernel,
      <Slot name="task.card" mode="single" task={task}>
        {DefaultCard}
      </Slot>,
    )
    expect(screen.getByText('card:Write tests')).toBeTruthy()
  })

  it('wrap calls through to Default; replace beats the default; highest priority is outermost', () => {
    const kernel = createKernel()
    mount(
      kernel,
      <Slot name="task.card" mode="single" task={task}>
        {DefaultCard}
      </Slot>,
    )
    act(() => {
      kernel.load(
        plugin('highlight', (scope) => {
          contribute(
            scope,
            'task.card',
            ({ task, Default }) => (
              <mark>
                <Default task={task} />
              </mark>
            ),
            { mode: 'wrap', priority: 1 },
          )
        }),
      )
    })
    expect(document.querySelector('mark')!.textContent).toBe('card:Write tests')

    act(() => {
      kernel.load(
        plugin('compact', (scope) => {
          contribute(scope, 'task.card', ({ task }) => <span>compact:{task.id}</span>, { mode: 'replace' })
        }),
      )
    })
    // replace (priority 0) sits below wrap (priority 1): wrap still applies, default is gone.
    expect(document.querySelector('mark')!.textContent).toBe('compact:1')
    expect(screen.queryByText('card:Write tests')).toBeNull()

    act(() => {
      kernel.load(
        plugin('outer', (scope) => {
          contribute(
            scope,
            'task.card',
            ({ task, Default }) => (
              <b>
                <Default task={task} />
              </b>
            ),
            { mode: 'wrap', priority: 5 },
          )
        }),
      )
    })
    expect(document.querySelector('b > mark')!.textContent).toBe('compact:1')
  })

  it('the default returns when the replacing plugin unloads', () => {
    const kernel = createKernel()
    const compact = plugin('compact', (scope) => {
      contribute(scope, 'task.card', () => <span>compact</span>, { mode: 'replace' })
    })
    kernel.load(compact)
    mount(
      kernel,
      <Slot name="task.card" mode="single" task={task}>
        {DefaultCard}
      </Slot>,
    )
    expect(screen.getByText('compact')).toBeTruthy()
    act(() => kernel.unload(compact))
    expect(screen.getByText('card:Write tests')).toBeTruthy()
  })
})

describe('cross-bundle interop', () => {
  it('a contribution made through a hand-built collection token (a second @yatoi/slots copy) shows up in <Slot>', () => {
    // `slot(name)` is just `defineCollection('slot:' + name)`; a plugin
    // bundled with its own copy of @yatoi/slots reaches the same
    // collection by building that key itself, with no shared object.
    const kernel = createKernel()
    const foreignToken = defineCollection<SlotRenderer<'sidebar.item'>>('slot:sidebar.item')
    const p = plugin('foreign', (scope) => {
      scope.contribute(foreignToken, () => <li>foreign</li>)
    })
    kernel.load(p)
    mount(kernel, <Slot name="sidebar.item" collapsed={false} fallback={<i>empty</i>} />)
    expect(screen.getByText('foreign')).toBeTruthy()
  })
})

describe('end to end: kernel → Requires → Slot', () => {
  it('a plugin depending on Clock contributes UI that disappears with the clock and comes back', () => {
    const kernel = createKernel()
    const widget = definePlugin({
      name: 'clock-widget',
      inject: [Clock],
      setup(scope) {
        contribute(scope, 'sidebar.item', ({ collapsed }) => (
          <li>{collapsed ? scope.get(Clock).now() : `time ${scope.get(Clock).now()}`}</li>
        ))
      },
    })
    kernel.load(widget, clockPlugin)
    mount(
      kernel,
      <Requires of={[Clock]} fallback={<i>no clock</i>}>
        {() => <Slot name="sidebar.item" collapsed={false} fallback={<i>no items</i>} />}
      </Requires>,
    )
    expect(screen.getByText('time 42')).toBeTruthy()

    act(() => kernel.unload(clockPlugin))
    expect(screen.getByText('no clock')).toBeTruthy()
    expect(kernel.pluginState(widget)).toBe('inactive')

    act(() => {
      kernel.load(clockPlugin)
    })
    expect(screen.getByText('time 42')).toBeTruthy()
  })
})
