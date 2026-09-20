import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// The contract's Slots augmentation is pulled in transitively by any
// import from it below (App.tsx, TodoList.tsx) — see
// examples/todo/src/contract/index.ts.
import { bootstrap } from './bootstrap.js'
import { App } from './App.js'
import './styles.css'

bootstrap()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
