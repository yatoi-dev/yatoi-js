<script setup lang="ts">
import { ref } from 'vue'
import { Slot } from '@yatoi/vue/slots'
import type { TodoStore } from './core/todos.js'
import { useTodos } from './contract/index.js'

const props = defineProps<{ todos: TodoStore }>()

const items = useTodos(props.todos)
const title = ref('')

function handleSubmit(): void {
  props.todos.add(title.value)
  title.value = ''
}
</script>

<template>
  <div class="todo-list">
    <form class="todo-add" @submit.prevent="handleSubmit">
      <input v-model="title" type="text" placeholder="Add a todo…" aria-label="New todo title" />
      <button type="submit">Add</button>
    </form>

    <p v-if="items.length === 0" class="empty">No todos yet.</p>

    <ul>
      <li v-for="todo in items" :key="todo.id" :class="todo.done ? 'todo-row done' : 'todo-row'">
        <input
          type="checkbox"
          :checked="todo.done"
          :aria-label="`Mark &quot;${todo.title}&quot; ${todo.done ? 'not done' : 'done'}`"
          @change="props.todos.toggle(todo.id)"
        />
        <span class="todo-title">{{ todo.title }}</span>
        <!-- Contribution point: the calendar plugin drops a due-date
             field in here when installed, and nothing else about this
             component knows it exists. `:todo="todo"` is a plain attr —
             TypeScript can't check this binding; see this example's
             README, "<Slot> props as attrs". -->
        <Slot name="todo.item.extra" :todo="todo" />
        <button
          type="button"
          class="todo-delete"
          :aria-label="`Delete &quot;${todo.title}&quot;`"
          @click="props.todos.remove(todo.id)"
        >
          ✕
        </button>
      </li>
    </ul>
  </div>
</template>
