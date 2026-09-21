import { defineCollection } from '@yatoi/kernel'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { slot, type SlotProps } from '../src/index.js'

declare module '../src/index.js' {
  interface Slots {
    'a.b': { n: number }
  }
}

describe('slot()', () => {
  it('memoizes: same name returns the same token', () => {
    expect(slot('a.b')).toBe(slot('a.b'))
  })

  it('keys as slot:<name>', () => {
    expect(slot('a.b').key).toBe('slot:a.b')
  })

  it('is the same collection a hand-built key would reach (spec §2.5)', () => {
    expect(slot('a.b').key).toBe(defineCollection('slot:a.b').key)
  })

  it('types SlotProps from the Slots augmentation', () => {
    expectTypeOf<SlotProps<'a.b'>>().toEqualTypeOf<{ n: number }>()
    // @ts-expect-error 'nope' was never declared on Slots
    slot('nope')
  })
})
