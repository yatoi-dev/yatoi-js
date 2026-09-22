# Working with `@yatoi/react`

## Use this package when

- A React 18 or 19 tree must observe yatoi services and collections.
- A subtree should mount only while required capabilities exist.
- A plugin's lifetime should follow a component's committed lifetime.

## Do / Don't

- **Don't** load or unload plugins during render. **Do** mutate in bootstrap, event handlers, effects, or `usePlugin`.
- **Don't** write `useService(Token)!`. **Do** wrap dependent UI in `<Requires of={[Token]}>`.
- **Don't** create plugin objects inside components. **Do** define them at module scope or create a distinct object for each intended instance.
- **Don't** create the application kernel during render. **Do** create it outside the tree and pass it to `<KernelProvider>`.
- **Don't** cache `useContributions()` outside React. **Do** let the hook subscribe to the kernel snapshot.
- **Don't** bundle a second React copy into remote plugins. **Do** externalize and share the host's React and JSX runtime.

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

- Is one stable kernel provided above every yatoi hook and component?
- Are all kernel mutations outside render?
- Does required UI use `<Requires>` instead of a non-null assertion?
- Are plugin objects stable across renders?
- Will StrictMode load → unload → load leave one active instance?
- Are remote plugins sharing the host's React runtime?

## Where the rules come from

- [Protocol specification](https://github.com/yatoi-dev/yatoi-js/blob/main/docs/spec.md) — normative behavior.
- [Pitfalls](https://github.com/yatoi-dev/yatoi-js/blob/main/docs/pitfalls.md) — mistakes and recovery patterns.
