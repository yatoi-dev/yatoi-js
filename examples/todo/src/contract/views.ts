import { defineCollection } from '@yatoi/kernel'
import type { ComponentType } from 'react'

/**
 * A kernel collection, not a slot — the shell needs the *set of view ids*
 * to route and build nav from, not just something to render blindly. The
 * kernel stores these opaquely (it never knows `View` is a component); the
 * host is what gives them meaning, same as `/slots` does for renderers.
 */
export interface ViewDescriptor {
  id: string
  label: string
  View: ComponentType
}

export const Views = defineCollection<ViewDescriptor>('views')
