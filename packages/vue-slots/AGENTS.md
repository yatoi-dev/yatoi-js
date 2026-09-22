# Working with `@yatoi/vue-slots`

## Use this package when

- Vue plugins contribute typed components to host-declared slots.
- Contributions should compose by append, replace, or wrap mode.
- Unloading a plugin must remove its UI without manual unregister calls.

## Do / Don't

- **Don't** declare `Slots` in this package. **Do** augment `@yatoi/slots` once in a host contract module.
- **Don't** call `contribute` during render or from a component `setup()` body. **Do** call it from plugin `setup`.
- **Don't** load plugins during render. **Do** load in bootstrap, handlers, lifecycle hooks, or `usePlugin`.
- **Don't** assert `useService(Token).value!` inside a renderer. **Do** gate required UI with `<Requires>` or close over an injected setup-time service.
- **Don't** forget that the host default is a Vue slot. **Do** pass it through `Default` when a `wrap` contribution should preserve lower layers.
- **Don't** duplicate the slot contract for Vue. **Do** share the neutral host contract with every binding.

## Lifecycle in six lines

```text
inactive: registered but waiting for dependencies, or unloaded
starting: setup may already contribute while awaiting
active: contributed components are visible to <Slot>
disposing: contributions disappear synchronously; cleanup may continue
inactive → starting → active → disposing → inactive; failed is sticky
state(token): services gate plugins; slot collections update subscribed renders
```

## Review checklist

- Is the host's `Slots` augmentation imported by host and plugins?
- Does each contribution use a declared slot name and correct props?
- Is `contribute` called only from a live plugin scope?
- Does `wrap` render or intentionally replace its `Default`?
- Is required service access gated or closed over safely?
- Will unmount/remount remove and restore exactly one contribution?

## Where the rules come from

- [Protocol specification](https://github.com/yatoi-dev/yatoi-js/blob/main/docs/spec.md) — normative behavior.
- [Pitfalls](https://github.com/yatoi-dev/yatoi-js/blob/main/docs/pitfalls.md) — mistakes and recovery patterns.
