import { useEffect, useState } from 'react'
import { KernelProvider, Requires, useContributions } from '@weft/react'
import { kernel } from './kernel.js'
import { Todos, type TodoStore } from './core/todos.js'
import { Views } from './core/views.js'
import { TodoList } from './TodoList.js'
import { Marketplace } from './Marketplace.js'

export function App() {
  return (
    <KernelProvider kernel={kernel}>
      {/* The React-native expression of cascade unload: if `Todos` ever
          went away this subtree would unmount and clean up, instead of
          rendering with `undefined`. In this app the store never unloads,
          but the shell never has to special-case that. */}
      <Requires of={[Todos]} fallback={<p className="loading">Loading…</p>}>
        {(todos) => <Shell todos={todos} />}
      </Requires>
    </KernelProvider>
  )
}

function Shell({ todos }: { todos: TodoStore }) {
  const [active, setActive] = useState('todos')
  // A kernel collection, not a slot: the shell needs the actual set of
  // view ids to build nav and route — `useContributions` works on any
  // `CollectionToken`, slot-backed or not.
  const views = useContributions(Views)

  // Exact now: a view is "dead" iff no contribution claims its id, for
  // any number of view plugins — not just an empty-collection guess.
  useEffect(() => {
    if (active === 'todos' || active === 'marketplace') return
    if (!views.some((c) => c.value.id === active)) setActive('todos')
  }, [active, views])

  const activeView = views.find((c) => c.value.id === active)

  return (
    <div className="app">
      <header className="app-header">
        <h1>weft todo</h1>
        <nav className="app-nav">
          <button
            type="button"
            className={active === 'todos' ? 'nav-btn active' : 'nav-btn'}
            onClick={() => setActive('todos')}
          >
            Todos
          </button>
          <button
            type="button"
            className={active === 'marketplace' ? 'nav-btn active' : 'nav-btn'}
            onClick={() => setActive('marketplace')}
          >
            Marketplace
          </button>
          {/* Inverted contribution: plugins push view descriptors in, the
              shell never imports Calendar to know it exists. */}
          {views.map((c) => (
            <button
              key={c.value.id}
              type="button"
              className={active === c.value.id ? 'nav-btn active' : 'nav-btn'}
              onClick={() => setActive(c.value.id)}
            >
              {c.value.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="app-main">
        {active === 'todos' && <TodoList todos={todos} />}
        {active === 'marketplace' && <Marketplace />}
        {active !== 'todos' && active !== 'marketplace' && (activeView ? <activeView.value.View /> : <TodoList todos={todos} />)}
      </main>
    </div>
  )
}
