import { kernel } from './kernel.js'
import { todosPlugin } from './core/todos.js'
import { restoreInstalled } from './marketplace/useMarketplace.js'

/**
 * Runs once, outside React, before the first render (see AGENTS.md "Never
 * mutate the kernel during render"). The store is loaded synchronously so
 * `<Requires of={[Todos]}>` never has to show its fallback on first paint;
 * previously-installed marketplace plugins load asynchronously after.
 */
export function bootstrap(): void {
  kernel.load(todosPlugin)
  void restoreInstalled()
}
