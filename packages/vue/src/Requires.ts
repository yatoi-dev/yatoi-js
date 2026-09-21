import { defineComponent, onScopeDispose, shallowRef, type PropType, type VNode } from 'vue'
import type { AnyServiceToken, ServiceType } from '@yatoi/kernel'
import { useKernel } from './context.js'

type Values<Tokens extends readonly AnyServiceToken[]> = {
  [K in keyof Tokens]: ServiceType<Tokens[K]>
}

export interface RequiresProps<Tokens extends readonly AnyServiceToken[]> {
  /** Services this subtree cannot exist without. */
  of: Tokens
}

// ── implementation, deliberately untyped ─────────────────────────────
// Same trick as `@yatoi/vue-slots`'s `Slot.ts` (itself matching React's
// `Slot.tsx`): a real generic component needs an SFC's `<script setup
// generic>` macro, off the table without `vue-tsc`. `RequiresImpl` works
// on a loose `readonly AnyServiceToken[]`; the export below restores a
// generic call-site signature.

const RequiresImpl = defineComponent({
  name: 'Requires',
  props: {
    of: { type: Array as unknown as PropType<readonly AnyServiceToken[]>, required: true },
  },
  setup(props, { slots }) {
    const kernel = useKernel()
    let cache: readonly unknown[] | null = null

    const read = (): readonly unknown[] | null => {
      const next: unknown[] = []
      for (const token of props.of) {
        const value = kernel.get(token)
        if (value === undefined) {
          cache = null
          return null
        }
        next.push(value)
      }
      // Same tuple reference while every value is identical — keeps the
      // default slot from re-rendering on unrelated kernel changes.
      const prev = cache
      if (prev && prev.length === next.length && prev.every((v, i) => v === next[i])) return prev
      cache = next
      return next
    }

    const values = shallowRef<readonly unknown[] | null>(read())
    const unsubscribe = kernel.subscribe(() => {
      const next = read()
      if (next !== values.value) values.value = next
    })
    onScopeDispose(unsubscribe)

    return (): VNode[] | VNode | null | undefined => {
      const v = values.value
      if (v === null) return (slots.fallback?.() as VNode[] | undefined) ?? null
      return (slots.default?.(v) as VNode[] | undefined) ?? null
    }
  },
})

/**
 * The Vue expression of cascade unload — the binding-level analogue of
 * React's `<Requires>`. When any required service goes away, the default
 * slot's content is torn down (its subtree's own `onUnmounted` hooks run)
 * instead of re-rendering with `undefined` three components deep; it
 * mounts fresh when all required services return.
 *
 * The default slot is called with the values as a *single array
 * argument* (not spread as separate arguments — Vue scoped slots only
 * ever bind one), so `v-slot="[clock, store]"` destructures it
 * positionally in templates (array destructuring is valid anywhere a
 * function parameter pattern is, and `v-slot="pattern"` compiles to
 * one); programmatic/`h()` callers get `(values: Values<Tokens>) => ...`.
 */
export const Requires: <Tokens extends readonly AnyServiceToken[]>(props: RequiresProps<Tokens>) => VNode =
  RequiresImpl as never
