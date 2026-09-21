<!--
  Wrapped by `index.ts`'s `makeCalendarView(todos)` factory the same way
  `DueDateField.vue` is wrapped — `Views`' `View` field is a plain
  `Component` with no props at all, so there's no parameter slot to hand
  it `todos` through directly; the factory closure is what carries it.
-->
<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Todo, TodoStore } from '../../contract/index.js'
import { useTodos } from '../../contract/index.js'

const props = defineProps<{
  todos: TodoStore
}>()

const list = useTodos(props.todos)

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function readDueDate(todo: Todo): string | undefined {
  const value = todo['dueDate']
  return typeof value === 'string' ? value : undefined
}

function toKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1)
}

/** Cells for a 6-row month grid, padded with the trailing/leading days. */
function monthCells(month: Date): Date[] {
  const first = startOfMonth(month)
  const gridStart = new Date(first)
  gridStart.setDate(first.getDate() - first.getDay())
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + i)
    return d
  })
}

const month = ref(startOfMonth(new Date()))
function prevMonth(): void {
  month.value = addMonths(month.value, -1)
}
function nextMonth(): void {
  month.value = addMonths(month.value, 1)
}

const monthLabel = computed(() => month.value.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }))

const byDay = computed(() => {
  const map = new Map<string, Todo[]>()
  for (const todo of list.value) {
    const due = readDueDate(todo)
    if (!due) continue
    const bucket = map.get(due)
    if (bucket) bucket.push(todo)
    else map.set(due, [todo])
  }
  return map
})

const today = toKey(new Date())
const cells = computed(() => monthCells(month.value))

function cellClass(day: Date): string {
  const key = toKey(day)
  const inMonth = day.getMonth() === month.value.getMonth()
  return ['calendar-cell', inMonth ? '' : 'calendar-cell-outside', key === today ? 'calendar-cell-today' : '']
    .filter(Boolean)
    .join(' ')
}
</script>

<template>
  <div class="calendar-view">
    <div class="calendar-header">
      <button type="button" aria-label="Previous month" @click="prevMonth">‹</button>
      <h2>{{ monthLabel }}</h2>
      <button type="button" aria-label="Next month" @click="nextMonth">›</button>
    </div>
    <div class="calendar-grid">
      <div v-for="w in WEEKDAYS" :key="w" class="calendar-weekday">{{ w }}</div>
      <div v-for="day in cells" :key="toKey(day)" :class="cellClass(day)">
        <span class="calendar-date">{{ day.getDate() }}</span>
        <span
          v-for="todo in byDay.get(toKey(day)) ?? []"
          :key="todo.id"
          :class="todo.done ? 'calendar-todo done' : 'calendar-todo'"
        >
          {{ todo.title }}
        </span>
      </div>
    </div>
  </div>
</template>
