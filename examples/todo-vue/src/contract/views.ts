import { defineCollection } from '@yatoi/kernel'
import type { Component } from 'vue'

/**
 * A kernel collection, not a slot — the shell needs the *set of view ids*
 * to route and build nav from, not just something to render blindly. The
 * kernel stores these opaquely (it never knows `View` is a Vue component);
 * the host is what gives them meaning, same as `/vue-slots` does for
 * renderers.
 */
export interface ViewDescriptor {
  id: string
  label: string
  View: Component
}

export const Views = defineCollection<ViewDescriptor>('views')
