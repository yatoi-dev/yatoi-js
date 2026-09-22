import { describe, expect, it } from 'vitest'
import * as shim from '../src/index.js'
import * as slots from '@yatoi/react/slots'

describe('@yatoi/react-slots compatibility shim', () => {
  it('re-exports the ./slots runtime values by identity', () => {
    expect(shim.Slot).toBe(slots.Slot)
    expect(shim.contribute).toBe(slots.contribute)
    expect(shim.slot).toBe(slots.slot)
  })
})
