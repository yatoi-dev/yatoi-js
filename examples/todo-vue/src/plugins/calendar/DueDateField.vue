<!--
  A real SFC — this example allows them (see this example's README: the
  *library* couldn't ship `.vue` files, an app can). It isn't rendered
  directly by `contribute()`: `index.ts` wraps it in a small functional
  component that closes over `todos` (the factory approach — see the
  README's "Passing todos into contributed components" for the
  alternative and the trade-off) and forwards `todo`/`todos` as props.
-->
<script setup lang="ts">
import type { Todo, TodoStore } from '../../contract/index.js'

const props = defineProps<{
  todo: Todo
  todos: TodoStore
}>()

function readDueDate(todo: Todo): string {
  const value = todo['dueDate']
  return typeof value === 'string' ? value : ''
}

function onInput(e: Event): void {
  const value = (e.target as HTMLInputElement).value
  props.todos.patch(props.todo.id, { dueDate: value || undefined })
}
</script>

<template>
  <input
    type="date"
    class="due-date-field"
    :aria-label="`Due date for ${todo.title}`"
    :value="readDueDate(todo)"
    @input="onInput"
  />
</template>
