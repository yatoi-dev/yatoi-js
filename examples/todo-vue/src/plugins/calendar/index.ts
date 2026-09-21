import { h, type Component, type FunctionalComponent } from 'vue'
import { definePlugin } from '@yatoi/kernel'
import { contribute, type SlotRenderer } from '@yatoi/vue-slots'
import { Todos, Views, type TodoStore } from '../../contract/index.js'
import DueDateField from './DueDateField.vue'
import CalendarView from './CalendarView.vue'
import css from './calendar.css?inline'

/**
 * The factory approach (see this example's README, "Passing todos into
 * contributed components" — the trade-off against a composable that calls
 * `useService(Todos)` itself). `DueDateField.vue`/`CalendarView.vue` are
 * ordinary SFCs with a typed `todos: TodoStore` prop; these factories
 * close over the `todos` the plugin resolved in `setup()` and return a
 * *functional* component that supplies that prop via `h()`, so from the
 * outside a factory's result matches the shape `contribute()`/`Views`
 * expects with no prop left for a caller to fill in.
 */
function makeDueDateField(todos: TodoStore): SlotRenderer<'todo.item.extra'> {
  const DueDateFieldRenderer: SlotRenderer<'todo.item.extra'> = (props) =>
    h(DueDateField, { todo: props.todo, todos })
  return DueDateFieldRenderer
}

function makeCalendarView(todos: TodoStore): Component {
  const CalendarViewRenderer: FunctionalComponent = () => h(CalendarView, { todos })
  return CalendarViewRenderer
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
    // the `Views` collection instead of through `/vue-slots`.
    scope.contribute(Views, { id: 'calendar', label: 'Calendar', View: makeCalendarView(todos) })
  },
})
