<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { Requires, useContributionValues } from '@yatoi/vue'
import { Todos, Views } from './contract/index.js'
import TodoList from './TodoList.vue'
import Marketplace from './Marketplace.vue'

// The kernel is provided by `app.use(yatoi, { kernel })` in main.ts —
// not here. `App` is itself a consumer (`useContributionValues`,
// `<Requires>` below), and a component can't provide to itself; see
// main.ts.
const active = ref('todos')
// A kernel collection, not a slot: the shell needs the actual set of
// view ids to build nav and route — `useContributionValues` works on any
// `CollectionToken`, slot-backed or not.
const views = useContributionValues(Views)

// Exact now: a view is "dead" iff no contribution claims its id, for
// any number of view plugins — not just an empty-collection guess.
watchEffect(() => {
  if (active.value === 'todos' || active.value === 'marketplace') return
  if (!views.value.some((v) => v.id === active.value)) active.value = 'todos'
})

const activeView = computed(() => views.value.find((v) => v.id === active.value))
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
            v-for="v in views"
            :key="v.id"
            type="button"
            :class="active === v.id ? 'nav-btn active' : 'nav-btn'"
            @click="active = v.id"
          >
            {{ v.label }}
          </button>
        </nav>
      </header>
      <main class="app-main">
        <TodoList v-if="active === 'todos'" :todos="todos" />
        <Marketplace v-else-if="active === 'marketplace'" />
        <component :is="activeView.View" v-else-if="activeView" />
        <TodoList v-else :todos="todos" />
      </main>
    </div>
    </template>
    <template #fallback>
      <p class="loading">Loading…</p>
    </template>
  </Requires>
</template>
