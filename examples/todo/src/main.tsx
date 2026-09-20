import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './slots.js' // registers the app's Slots augmentation before anything renders
import { bootstrap } from './bootstrap.js'
import { App } from './App.js'
import './styles.css'

bootstrap()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
