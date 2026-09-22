# Working with `@yatoi/react-slots`

## Use this package when

- React plugins contribute typed renderers to host-declared slots.
- Contributions should compose by append, replace, or wrap mode.
- Unloading a plugin must remove its UI without manual unregister calls.

## Do / Don't

- **Don't** declare `Slots` in this package. **Do** augment `@yatoi/slots` once in a host contract module.
- **Don't** call `contribute` during React render. **Do** call it from plugin `setup`.
- **Don't** load plugins during render. **Do** load in bootstrap, handlers, effects, or `usePlugin`.
- **Don't** write `useService(Token)!` inside a renderer. **Do** gate required UI with `<Requires>` or close over an injected setup-time service.
- **Don't** create contributed component identities on every host render. **Do** define renderers in plugin setup or at module scope.
- **Don't** add a hidden Suspense policy to `<Slot>`. **Do** place the desired `<Suspense>` boundary in the host or contribution.

## Lifecycle in six lines

```text
inactive: registered but waiting for dependencies, or unloaded
starting: setup may already contribute while awaiting
active: contributed renderers are visible to <Slot>
disposing: contributions disappear synchronously; cleanup may continue
inactive → starting → active → disposing → inactive; failed is sticky
state(token): services gate plugins; slot collections update subscribed renders
```

## Review checklist

- Is the host's `Slots` augmentation imported by host and plugins?
- Does each contribution use a declared slot name and correct props?
- Is `contribute` called only from a live plugin scope?
- Does `wrap` call or intentionally replace its `Default`?
- Is required service access gated or closed over safely?
- Is lazy UI covered by an intentional Suspense boundary?

## Where the rules come from

- [Protocol specification](https://github.com/yatoi-dev/yatoi-js/blob/main/docs/spec.md) — normative behavior.
- [Pitfalls](https://github.com/yatoi-dev/yatoi-js/blob/main/docs/pitfalls.md) — mistakes and recovery patterns.
