import { useState, type FormEvent } from 'react'
import { Slot } from '@yatoyi/slots'
import type { TodoStore } from './core/todos.js'
import { useTodos } from './core/useTodos.js'

export function TodoList({ todos }: { todos: TodoStore }) {
  const items = useTodos(todos)
  const [title, setTitle] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    todos.add(title)
    setTitle('')
  }

  return (
    <div className="todo-list">
      <form className="todo-add" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Add a todo…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="New todo title"
        />
        <button type="submit">Add</button>
      </form>

      {items.length === 0 && <p className="empty">No todos yet.</p>}

      <ul>
        {items.map((todo) => (
          <li key={todo.id} className={todo.done ? 'todo-row done' : 'todo-row'}>
            <input
              type="checkbox"
              checked={todo.done}
              onChange={() => todos.toggle(todo.id)}
              aria-label={`Mark "${todo.title}" ${todo.done ? 'not done' : 'done'}`}
            />
            <span className="todo-title">{todo.title}</span>
            {/* Contribution point: the calendar plugin drops a due-date
                field in here when installed, and nothing else about this
                component knows it exists. */}
            <Slot name="todo.item.extra" todo={todo} />
            <button type="button" className="todo-delete" onClick={() => todos.remove(todo.id)} aria-label={`Delete "${todo.title}"`}>
              ✕
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
