/**
 * Every render here is under <StrictMode> on a concurrent root — the brief
 * says if the bridge doesn't survive double-invoke, the design is wrong.
 */
import { StrictMode, useEffect, startTransition, type ReactNode } from 'react'
import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createKernel, definePlugin, defineService, type Kernel } from '@yatoi/kernel'
import {
  KernelProvider,
  Requires,
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

function mount(kernel: Kernel, ui: ReactNode) {
  return render(
    <StrictMode>
      <KernelProvider kernel={kernel}>{ui}</KernelProvider>
    </StrictMode>,
  )
}

describe('KernelProvider / useKernel', () => {
  it('throws a clear error outside a provider', () => {
    const Probe = () => {
      useKernel()
      return null
    }
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow(/no <KernelProvider>/)
    err.mockRestore()
  })
})

describe('useService', () => {
  it('re-renders on provide and unprovide, handing out the exact provided reference', () => {
    const kernel = createKernel()
    const seen: (Clock | undefined)[] = []
    const Probe = () => {
      const clock = useService(Clock)
      seen.push(clock)
      return <span>{clock ? `now=${clock.now()}` : 'no clock'}</span>
    }
    mount(kernel, <Probe />)
    expect(screen.getByText('no clock')).toBeTruthy()

    act(() => {
      kernel.load(clockPlugin)
    })
    expect(screen.getByText('now=42')).toBeTruthy()
    expect(seen.at(-1)).toBe(kernel.get(Clock))

    act(() => {
      kernel.unload(clockPlugin)
    })
    expect(screen.getByText('no clock')).toBeTruthy()
  })

  it('does not re-render for unrelated kernel changes', () => {
    const kernel = createKernel()
    kernel.load(clockPlugin)
    let renders = 0
    const Probe = () => {
      useService(Clock)
      renders++
      return null
    }
    mount(kernel, <Probe />)
    const afterMount = renders
    act(() => {
      kernel.load(storePlugin)
    })
    expect(renders).toBe(afterMount)
  })
})

describe('useServiceState', () => {
  it('returns stable objects per status and reflects loading during async setup', async () => {
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
    const Probe = () => {
      const s = useServiceState(Clock)
      states.push(s.status)
      objects.push(s)
      return <span>{s.status}</span>
    }
    mount(kernel, <Probe />)
    expect(screen.getByText('absent')).toBeTruthy()
    act(() => {
      kernel.load(slow)
    })
    expect(screen.getByText('loading')).toBeTruthy()
    await act(async () => {
      resolve()
      await kernel.settle()
    })
    expect(screen.getByText('present')).toBeTruthy()
    // Same status across StrictMode's double render → same object.
    const loadingObjs = new Set(objects.filter((o) => (o as { status: string }).status === 'loading'))
    expect(loadingObjs.size).toBe(1)
  })
})

describe('<Requires>', () => {
  it('renders fallback while absent, children with non-null services when present', () => {
    const kernel = createKernel()
    mount(
      kernel,
      <Requires of={[Clock, Store]} fallback={<span>waiting</span>}>
        {(clock, store) => (
          <span>
            {store.name}:{clock.now()}
          </span>
        )}
      </Requires>,
    )
    expect(screen.getByText('waiting')).toBeTruthy()
    act(() => {
      kernel.load(clockPlugin)
    })
    expect(screen.getByText('waiting')).toBeTruthy() // one of two is not enough
    act(() => {
      kernel.load(storePlugin)
    })
    expect(screen.getByText('local:42')).toBeTruthy()
  })

  it('unmounts children (running their effect cleanups) when a service disappears, remounts on return', () => {
    const kernel = createKernel()
    kernel.load(clockPlugin)
    const mounted = vi.fn()
    const cleaned = vi.fn()
    const Child = ({ clock }: { clock: Clock }) => {
      useEffect(() => {
        mounted()
        return () => cleaned()
      }, [])
      return <span>child {clock.now()}</span>
    }
    mount(
      kernel,
      <Requires of={[Clock]} fallback={<span>gone</span>}>
        {(clock) => <Child clock={clock} />}
      </Requires>,
    )
    expect(screen.getByText('child 42')).toBeTruthy()
    // StrictMode mounts effects twice on purpose; count relative from here.
    const mountsBefore = mounted.mock.calls.length
    const cleansBefore = cleaned.mock.calls.length

    act(() => {
      kernel.unload(clockPlugin)
    })
    expect(screen.getByText('gone')).toBeTruthy()
    expect(cleaned.mock.calls.length).toBe(cleansBefore + 1)

    act(() => {
      kernel.load(clockPlugin)
    })
    expect(screen.getByText('child 42')).toBeTruthy()
    expect(mounted.mock.calls.length).toBeGreaterThan(mountsBefore)
  })

  it('resolves a token created separately from the one the provider used, by key', () => {
    // Simulates a cross-bundle plugin: B is its own object, same key as A.
    const kernel = createKernel()
    const B = defineService<Clock>('clock')
    const provider = definePlugin({
      name: 'clock-b',
      provides: [Clock],
      setup(scope) {
        scope.provide(Clock, { now: () => 7 })
      },
    })
    mount(
      kernel,
      <Requires of={[B]} fallback={<span>waiting</span>}>
        {(clock) => <span>now={clock.now()}</span>}
      </Requires>,
    )
    expect(screen.getByText('waiting')).toBeTruthy()
    act(() => {
      kernel.load(provider)
    })
    expect(screen.getByText('now=7')).toBeTruthy()
    act(() => {
      kernel.unload(provider)
    })
    expect(screen.getByText('waiting')).toBeTruthy()
  })

  it('does not re-render children for unrelated kernel changes', () => {
    const kernel = createKernel()
    kernel.load(clockPlugin)
    let renders = 0
    const Child = () => {
      renders++
      return null
    }
    mount(kernel, <Requires of={[Clock]}>{() => <Child />}</Requires>)
    const after = renders
    act(() => {
      kernel.load(storePlugin)
    })
    expect(renders).toBe(after)
  })
})

describe('usePlugin', () => {
  it('under StrictMode, load → unload → load leaves exactly one active instance; unmount unloads', () => {
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
    const Editor = () => {
      usePlugin(local)
      const clock = useService(Clock)
      return <span>{clock ? `clock ${clock.now()}` : 'none'}</span>
    }
    const { unmount } = mount(kernel, <Editor />)
    expect(screen.getByText('clock 7')).toBeTruthy()
    expect(setups).toHaveBeenCalledTimes(2) // StrictMode double-invoke: load, unload, load
    expect(disposals).toHaveBeenCalledTimes(1)
    expect(kernel.pluginState(local)).toBe('active')

    unmount()
    expect(kernel.pluginState(local)).toBe('inactive')
    expect(disposals).toHaveBeenCalledTimes(2)
    expect(kernel.get(Clock)).toBeUndefined()
  })
})

describe('concurrent rendering', () => {
  it('a service flip inside startTransition does not tear between two readers', async () => {
    const kernel = createKernel()
    const pairs: [string, string][] = []
    const A = () => <span data-a>{useService(Clock) ? 'yes' : 'no'}</span>
    const B = () => <span data-b>{useService(Clock) ? 'yes' : 'no'}</span>
    const Observer = () => {
      const a = useService(Clock) ? 'yes' : 'no'
      const b = useService(Clock) ? 'yes' : 'no'
      pairs.push([a, b])
      return null
    }
    mount(
      kernel,
      <>
        <A />
        <B />
        <Observer />
      </>,
    )
    await act(async () => {
      startTransition(() => {
        kernel.load(clockPlugin)
      })
    })
    for (const [a, b] of pairs) expect(a).toBe(b)
    expect(document.querySelector('[data-a]')!.textContent).toBe('yes')
    expect(document.querySelector('[data-b]')!.textContent).toBe('yes')
  })
})
