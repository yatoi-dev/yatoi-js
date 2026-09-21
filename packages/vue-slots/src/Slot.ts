import { computed, defineComponent, h, type FunctionalComponent, type PropType, type VNode } from 'vue'
import type { CollectionToken, Contribution } from '@yatoi/kernel'
import { useContributions } from '@yatoi/vue'
import { slot } from '@yatoi/slots'
import type { SlotName, SlotProps, SlotRenderer } from './types.js'

export interface SlotOwnProps<N extends SlotName> {
  name: N
  /**
   * - `list` (default): render every `append` contribution, priority order.
   * - `single`: render one thing — the host default with `replace`/`wrap`
   *   contributions folded over it, highest priority outermost.
   */
  mode?: 'list' | 'single'
}

export type SlotComponentProps<N extends SlotName> = SlotOwnProps<N> & SlotProps<N>

// ── implementation, deliberately untyped ─────────────────────────────
// Inside this package `Slots` is empty, so `SlotName` is `never`; the
// implementation works on loose shapes and the typed export below
// restores the generic signature for consumers — same trick as
// `@yatoi/slots`'s `Slot.tsx`.

type AnyRenderer = FunctionalComponent<Record<string, unknown>>

const Nothing: AnyRenderer = () => null

type LooseSlots = {
  /**
   * The host default, for `single` mode, as plain slot content bound to
   * the slot's own props (`v-slot="{ task }"`). Wrapped internally into a
   * functional component so it can be passed down as `Default` — React's
   * `<Slot>` takes this as a `children` component reference directly;
   * Vue has no way to pass a component as a child value the way JSX
   * does, so the default slot is the mechanism instead.
   */
  default?: (props: Record<string, unknown>) => VNode[] | VNode | null
  /** Rendered in `list` mode when there are no contributions. */
  fallback?: () => VNode[] | VNode | null
}

/**
 * `name`/`mode` are the component's only declared props; the slot's
 * *own* props (e.g. `task` for `task.card`) are passed as plain attrs
 * (`:task="task"`) and read via `attrs` (`inheritAttrs: false`) rather
 * than as typed component props — Vue, unlike React/JSX, has no way to
 * spread an arbitrary typed prop bag onto a component's declared prop set
 * without knowing its keys statically, so attrs is the mechanism, and
 * it's the reason this component can't be a plain `<script setup>` SFC
 * with a typed `defineProps` either.
 */
const SlotImpl = defineComponent({
  name: 'Slot',
  props: {
    name: { type: String, required: true },
    mode: { type: String as PropType<'list' | 'single'>, default: 'list' },
  },
  inheritAttrs: false,
  setup(props, { attrs, slots: rawSlots }) {
    const slots = rawSlots as LooseSlots
    // Same boundary cast as `contribute.ts`: the neutral package hands back
    // CollectionToken<unknown>, and this is where Vue meaning is assigned.
    const token = slot(props.name as SlotName) as CollectionToken<SlotRenderer<SlotName>>
    const contributions = useContributions(token)

    // The default slot, wrapped so it can be passed around as `Default` —
    // a plain functional component that, when invoked, calls the scoped
    // slot function with whatever props it's given.
    const DefaultComponent: AnyRenderer = (slotProps) => slots.default?.(slotProps) ?? null

    // Composed once per (contributions, default) — `contributions` is a
    // ref that only changes reference when the collection actually
    // changes (useContributions / kernel.list's stability), and
    // `DefaultComponent` is a stable closure created once per component
    // instance — so contributed components keep their identity across
    // host re-renders and are not remounted spuriously.
    const Composed = computed<AnyRenderer | null>(() => {
      if (props.mode !== 'single') return null
      return composeSingle(contributions.value as readonly Contribution<AnyRenderer>[], DefaultComponent)
    })

    return (): VNode | VNode[] | null => {
      const slotProps = attrs as Record<string, unknown>

      if (props.mode === 'single') {
        const Composite = Composed.value!
        return h(Composite, slotProps)
      }

      const items = contributions.value.filter((c) => c.mode === 'append')
      if (items.length === 0) return slots.fallback?.() ?? null
      return items.map((c, i) =>
        h(c.value as AnyRenderer, { ...slotProps, Default: Nothing, key: `${c.owner}:${i}` }),
      )
    }
  },
})

/**
 * Renders a contribution point. Props beyond `name`/`mode` are the slot's
 * own props and are forwarded to every renderer. Type-checked against the
 * host's `Slots` augmentation.
 */
export const Slot: <N extends SlotName>(props: SlotComponentProps<N>) => VNode = SlotImpl as never

/**
 * Fold contributions over the host default, lowest priority first so the
 * highest ends up outermost. `replace` swaps the current renderer;
 * `wrap` layers on top and can call through via `Default`. `append`
 * contributions are for list mode and are skipped here. Same algorithm as
 * `@yatoi/slots`'s `composeSingle` — kept as a private copy rather than a
 * shared import, since sharing it would mean a framework-free package for
 * just this one function (see the report on whether that's worth doing).
 */
function composeSingle(contributions: readonly Contribution<AnyRenderer>[], base: AnyRenderer): AnyRenderer {
  let current = base
  for (let i = contributions.length - 1; i >= 0; i--) {
    const c = contributions[i]!
    if (c.mode !== 'replace' && c.mode !== 'wrap') continue
    const Default = current
    const render = c.value
    const Layer: AnyRenderer = (p) => h(render, { ...p, Default })
    current = Layer
  }
  return current
}
