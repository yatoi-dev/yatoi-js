# Working with `@yatoi/vue`

## Use this package when

- A Vue 3 tree must observe yatoi services and collections.
- A subtree should exist only while required capabilities are present.
- A plugin's lifetime should follow a component mount and unmount.

## Do / Don't

- **Don't** load or unload plugins during render or directly in a `setup()` body. **Do** mutate in bootstrap, event handlers, lifecycle hooks, or `usePlugin`.
- **Don't** assert `useService(Token).value!`. **Do** gate dependent UI with `<Requires :of="[Token]">`.
- **Don't** create plugin objects inside component setup. **Do** define stable plugin objects at module scope.
- **Don't** provide the app kernel from the root component and consume it there. **Do** install `yatoi` with `app.use(yatoi, { kernel })`.
- **Don't** retain service refs after their component scope ends. **Do** use the read-only refs returned by the composables.
- **Don't** cache collection arrays separately. **Do** use `useContributions` or `useContributionValues`.
- **Don't** declare slot names in more than one place. **Do** augment `@yatoi/slots` once in a shared contract module.
- **Don't** contribute UI outside plugin setup. **Do** import `contribute` from `@yatoi/vue/slots` and let the scope own its removal.
- **Don't** recreate contributed component types in setup. **Do** keep renderer identities stable and close over injected services.

## Lifecycle in six lines

```text
inactive: registered but waiting for dependencies, or unloaded
starting: setup is running or awaiting
active: setup completed and the scope is live
disposing: disposers ran; at least one awaitable is pending
inactive → starting → active → disposing → inactive; failed is sticky
state(token): present with a value, loading during real progress, otherwise absent
```

## Review checklist

- Is the app kernel installed above every consumer?
- Are kernel mutations outside render and direct setup execution?
- Does required UI use `<Requires>` rather than a non-null assertion?
- Are plugin objects stable across component remounts?
- Are subscriptions owned by the current Vue effect scope?
- Does unmount/remount leave exactly one active plugin instance?
- Are slot names declared once and slot contributions owned by a plugin scope?

## Where the rules come from

- [Protocol specification](https://github.com/yatoi-dev/yatoi-js/blob/main/docs/spec.md) — normative behavior.
- [Pitfalls](https://github.com/yatoi-dev/yatoi-js/blob/main/docs/pitfalls.md) — mistakes and recovery patterns.
