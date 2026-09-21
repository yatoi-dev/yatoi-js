import { createApp } from 'vue'
import { yatoi } from '@yatoi/vue'
// The contract's Slots augmentation is pulled in transitively by any
// import from it below (App.vue, TodoList.vue) — see
// examples/todo-vue/src/contract/index.ts.
import { bootstrap } from './bootstrap.js'
import { kernel } from './kernel.js'
import App from './App.vue'
import './styles.css'

bootstrap()

// `app.use(yatoi, { kernel })` installs the kernel above the whole
// component tree, including `App` itself — see App.vue's comment for why
// that matters.
createApp(App).use(yatoi, { kernel }).mount('#app')
