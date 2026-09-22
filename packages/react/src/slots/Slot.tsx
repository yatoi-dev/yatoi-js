import { createElement, useMemo, type ComponentType, type ReactNode } from 'react'
import type { CollectionToken, Contribution } from '@yatoi/kernel'
import { useContributions } from '../useContributions.js'
import { slot } from '@yatoi/slots'
import type { SlotName, SlotProps, SlotRenderer } from './types.js'

type SlotOwnProps<N extends SlotName> = {
  /** Declared slot to render. */
  name: N
  /**
   * - `list` (default): render every `append` contribution, priority order.
   * - `single`: render one thing — the host default with `replace`/`wrap`
   *   contributions folded over it, highest priority outermost.
   */
  mode?: 'list' | 'single'
  /**
   * The host default for `single` mode, as a component. Contributions in
   * `wrap` mode receive it (or the next contribution down) as `Default`.
   */
  children?: ComponentType<SlotProps<N>>
  /** Rendered in `list` mode when there are no contributions. */
  fallback?: ReactNode
}

/** Props accepted by {@link Slot}, including the host-declared slot props. */
export type SlotComponentProps<N extends SlotName> = SlotOwnProps<N> & SlotProps<N>

/**
 * Renders a contribution point. Props beyond `name`/`mode`/`children`/
 * `fallback` are the slot's own props and are forwarded to every renderer.
 * Type-checked against the host's `Slots` augmentation.
 */
export const Slot: <N extends SlotName>(props: SlotComponentProps<N>) => ReactNode = SlotImpl as never

// ── implementation, deliberately untyped ─────────────────────────────
// Inside this package `Slots` is empty, so `SlotName` is `never`; the
// implementation works on loose shapes and the export above restores the
// generic signature for consumers.

type AnyRenderer = ComponentType<Record<string, unknown>>
type LooseProps = {
  name: string
  mode?: 'list' | 'single'
  children?: AnyRenderer
  fallback?: ReactNode
} & Record<string, unknown>

const Nothing: AnyRenderer = () => null

function SlotImpl(props: LooseProps): ReactNode {
  const { name, mode = 'list', children, fallback = null, ...slotProps } = props
  // Same boundary cast as `contribute.ts`: the neutral package hands back
  // CollectionToken<unknown>, and this is where React meaning is assigned.
  const token = slot(name as SlotName) as CollectionToken<SlotRenderer<SlotName>>
  const contributions = useContributions(token) as readonly Contribution<AnyRenderer>[]

  // Composed once per (contributions, default) — both are referentially
  // stable until they actually change, so contributed components keep their
  // identity across re-renders and don't remount.
  const Composed = useMemo(
    () => (mode === 'single' ? composeSingle(contributions, children ?? Nothing) : null),
    [mode, contributions, children],
  )

  if (Composed) return createElement(Composed, slotProps)

  const items = contributions.filter((c) => c.mode === 'append')
  if (items.length === 0) return <>{fallback}</>
  return (
    <>
      {items.map((c, i) =>
        createElement(c.value, { ...slotProps, Default: Nothing, key: `${c.owner}:${i}` }),
      )}
    </>
  )
}

/**
 * Fold contributions over the host default, lowest priority first so the
 * highest ends up outermost. `replace` swaps the current renderer;
 * `wrap` layers on top and can call through via `Default`. `append`
 * contributions are for list mode and are skipped here.
 */
function composeSingle(contributions: readonly Contribution<AnyRenderer>[], base: AnyRenderer): AnyRenderer {
  let current = base
  for (let i = contributions.length - 1; i >= 0; i--) {
    const c = contributions[i]!
    if (c.mode !== 'replace' && c.mode !== 'wrap') continue
    const Default = current
    const render = c.value
    const Layer: AnyRenderer = (p) => createElement(render, { ...p, Default })
    Layer.displayName = `Slot(${c.owner}:${c.mode})`
    current = Layer
  }
  return current
}
