import { useState } from 'react'
import { definePlugin } from '@yatoi/kernel'
import { contribute, type SlotRendererProps } from '@yatoi/slots'
import { Todos, Views, useTodos, type Todo, type TodoStore } from '../../contract/index.js'
import css from './calendar.css?inline'

/**
 * The core `Todo` type never mentions `dueDate` — this plugin owns the
 * field entirely, reading and writing it through the store's untyped
 * index signature. Uninstalling this plugin removes the field and the
 * calendar view from the UI, but the store (which never imported this
 * file) keeps the data on disk. Reinstalling reads it right back.
 */
type DueDate = string | undefined

function readDueDate(todo: Todo): DueDate {
  const value = todo['dueDate']
  return typeof value === 'string' ? value : undefined
}

// Renderers close over `todos` from `setup`, which is how a kernel-scoped
// plugin without React's own DI reaches a service — the `Scope` object is
// only alive during setup, so the closure is the handle that survives.
function makeDueDateField(todos: TodoStore) {
  return function DueDateField({ todo }: SlotRendererProps<'todo.item.extra'>) {
    return (
      <input
        type="date"
        className="due-date-field"
        aria-label={`Due date for ${todo.title}`}
        value={readDueDate(todo) ?? ''}
        onChange={(e) => todos.patch(todo.id, { dueDate: e.target.value || undefined })}
      />
    )
  }
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

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

function makeCalendarView(todos: TodoStore) {
  return function CalendarView() {
    const list = useTodos(todos)
    const [month, setMonth] = useState(() => startOfMonth(new Date()))

    const byDay = new Map<string, Todo[]>()
    for (const todo of list) {
      const due = readDueDate(todo)
      if (!due) continue
      const bucket = byDay.get(due)
      if (bucket) bucket.push(todo)
      else byDay.set(due, [todo])
    }

    const today = toKey(new Date())
    const cells = monthCells(month)

    return (
      <div className="calendar-view">
        <div className="calendar-header">
          <button type="button" onClick={() => setMonth((m) => addMonths(m, -1))} aria-label="Previous month">
            ‹
          </button>
          <h2>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
          <button type="button" onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="Next month">
            ›
          </button>
        </div>
        <div className="calendar-grid">
          {WEEKDAYS.map((w) => (
            <div key={w} className="calendar-weekday">
              {w}
            </div>
          ))}
          {cells.map((day) => {
            const key = toKey(day)
            const inMonth = day.getMonth() === month.getMonth()
            const items = byDay.get(key) ?? []
            return (
              <div
                key={key}
                className={[
                  'calendar-cell',
                  inMonth ? '' : 'calendar-cell-outside',
                  key === today ? 'calendar-cell-today' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span className="calendar-date">{day.getDate()}</span>
                {items.map((todo) => (
                  <span key={todo.id} className={todo.done ? 'calendar-todo done' : 'calendar-todo'}>
                    {todo.title}
                  </span>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    )
  }
}

export default definePlugin({
  name: 'calendar',
  inject: [Todos],
  setup(scope) {
    // Styles ship with the plugin, as a reversible effect: this plugin
    // isn't just contributing UI into surfaces the host owns, it also owns
    // its own CSS. Appending the <style> element and deferring its removal
    // means uninstalling takes the styles with it the same way it takes
    // the due-date field and the Calendar tab with it — no separate
    // cleanup path to forget.
    const style = document.createElement('style')
    style.textContent = css
    document.head.append(style)
    scope.defer(() => style.remove())

    const todos = scope.get(Todos)
    // A genuine slot: UI injected into a row this plugin doesn't own.
    contribute(scope, 'todo.item.extra', makeDueDateField(todos))
    // Not a slot — the shell needs the id/label as data (for nav and
    // routing), not just something to render, so this goes straight on
    // the `Views` collection instead of through `/slots`.
    scope.contribute(Views, { id: 'calendar', label: 'Calendar', View: makeCalendarView(todos) })
  },
})
