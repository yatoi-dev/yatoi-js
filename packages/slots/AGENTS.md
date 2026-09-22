# Working with `@yatoi/slots`

## Use this package when

- A host needs named, typed contribution points independent of a UI framework.
- React and Vue bindings must share one slot contract.
- Slot contributions must disappear with their owning plugin scopes.

## Do / Don't

- **Don't** augment separate framework packages. **Do** declare `Slots` once in `@yatoi/slots`.
- **Don't** leave the augmentation file outside the TypeScript program. **Do** import the host contract from host and plugin entry points.
- **Don't** construct `slot:<name>` keys yourself. **Do** call `slot(name)` with a declared name.
- **Don't** define a slot contract in multiple places. **Do** export one host-owned contract module.
- **Don't** cache the result of `kernel.list(slot(name))`. **Do** read it at each unit-of-work boundary or use a framework binding.
- **Don't** put React or Vue types in this package's contract. **Do** keep slot props framework-neutral.

## Lifecycle in six lines

```text
inactive: registered but waiting for dependencies, or unloaded
starting: setup is running or awaiting
active: setup completed and the scope is live
disposing: slot contributions are removed with their scope
inactive → starting → active → disposing → inactive; failed is sticky
state(token): services are present/loading/absent; slots use live collections
```

## Review checklist

- Is `Slots` augmented exactly once in a host contract module?
- Is that contract included in every relevant TypeScript program?
- Are all slot names accepted by `SlotName` without casts?
- Are slot props portable across the intended bindings?
- Are contributions owned by plugin scopes rather than a manual registry?
- Are slot collections read fresh or through a subscribed binding?

## Where the rules come from

- [Protocol specification](https://github.com/yatoi-dev/yatoi-js/blob/main/docs/spec.md) — normative behavior.
- [Pitfalls](https://github.com/yatoi-dev/yatoi-js/blob/main/docs/pitfalls.md) — mistakes and recovery patterns.
