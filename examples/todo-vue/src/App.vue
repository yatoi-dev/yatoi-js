<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { Requires, useContributions } from '@yatoi/vue'
import { Todos, Views } from './contract/index.js'
import TodoList from './TodoList.vue'
import Marketplace from './Marketplace.vue'

// The kernel is provided by `<KernelProvider>` in main.ts, one level
// above this component — not here. `App` is itself a *consumer*
// (`useContributions`, `<Requires>` below), and Vue's `provide()`/
// `inject()` only reaches descendant components, never the instance that
// called `provide()`; a component can't supply its own dependency. See
// this example's README for the trade-off against wrapping every
// root-level piece individually.
const active = ref('todos')
// A kernel collection, not a slot: the shell needs the actual set of
// view ids to build nav and route — `useContributions` works on any
// `CollectionToken`, slot-backed or not.
const views = useContributions(Views)

// Exact now: a view is "dead" iff no contribution claims its id, for
// any number of view plugins — not just an empty-collection guess.
watchEffect(() => {
  if (active.value === 'todos' || active.value === 'marketplace') return
  if (!views.value.some((c) => c.value.id === active.value)) active.value = 'todos'
})

const activeView = computed(() => views.value.find((c) => c.value.id === active.value))
</script>

<template>
  <!-- The default slot is spelled as an explicit `<template #default="[todos]">`
       rather than the `v-slot="[todos]"` shorthand on `<Requires>` itself —
       see this example's README, "<Requires> and v-slot array destructuring":
       the shorthand form, combined with the sibling `<template #fallback>`
       below, crashes Vue's production codegen (`Cannot read properties of
       undefined (reading 'type')` in @vue/compiler-core). This explicit form
       is the workaround, not a style preference. -->
  <Requires :of="[Todos]">
    <template #default="[todos]">
    <div class="app">
      <header class="app-header">
        <h1>yatoi todo (vue)</h1>
        <nav class="app-nav">
          <button
            type="button"
            :class="active === 'todos' ? 'nav-btn active' : 'nav-btn'"
            @click="active = 'todos'"
          >
            Todos
          </button>
          <button
            type="button"
            :class="active === 'marketplace' ? 'nav-btn active' : 'nav-btn'"
            @click="active = 'marketplace'"
          >
            Marketplace
          </button>
          <!-- Inverted contribution: plugins push view descriptors in, the
               shell never imports Calendar to know it exists. -->
          <button
            v-for="c in views"
            :key="c.value.id"
            type="button"
            :class="active === c.value.id ? 'nav-btn active' : 'nav-btn'"
            @click="active = c.value.id"
          >
            {{ c.value.label }}
          </button>
        </nav>
      </header>
      <main class="app-main">
        <TodoList v-if="active === 'todos'" :todos="todos" />
        <Marketplace v-else-if="active === 'marketplace'" />
        <component :is="activeView.value.View" v-else-if="activeView" />
        <TodoList v-else :todos="todos" />
      </main>
    </div>
    </template>
    <template #fallback>
      <p class="loading">Loading…</p>
    </template>
  </Requires>
</template>
