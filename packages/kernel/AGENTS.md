# Working with `@yatoi/kernel`

## Use this package when

- Capabilities must appear and disappear while an application is running.
- Plugin effects must unwind automatically and dependency removal must cascade.
- A Node, browser, React, or Vue host needs the same framework-neutral lifecycle.

## Do / Don't

- **Don't** call `kernel.load` or `kernel.unload` during React render or a Vue `setup()` body. **Do** mutate in bootstrap, an event handler, or a framework effect.
- **Don't** call `useService(Token)!`. **Do** gate dependent UI with the binding's `<Requires of={[Token]}>`.
- **Don't** hold a service reference across an `await` in `setup` without checking the scope. **Do** check `scope.active` before publishing or retaining late effects.
- **Don't** define the same token in multiple modules. **Do** export it from one contract module and import the symbol.
- **Don't** cache `kernel.list()` results as a permanent registry. **Do** read the collection at each request, turn, render, or scheduler tick.
- **Don't** manually unregister provided values or contributions. **Do** attach cleanup with `scope.defer`; scope disposal removes registry effects.

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

- Are all tokens imported from one contract module?
- Are `inject` and `provides` complete and readable from the plugin definition?
- Does every external effect have a `scope.defer` cleanup?
- Does async setup check `scope.active` after each `await`?
- Do request, turn, and scheduler boundaries read `state()` or `list()` fresh?
- Are kernel mutations outside render and request/turn handling?
- Does removal of a provider safely dispose every dependent?

## Where the rules come from

- [Protocol specification](https://github.com/yatoi-dev/yatoi-js/blob/main/docs/spec.md) — normative behavior.
- [Pitfalls](https://github.com/yatoi-dev/yatoi-js/blob/main/docs/pitfalls.md) — mistakes and recovery patterns.
