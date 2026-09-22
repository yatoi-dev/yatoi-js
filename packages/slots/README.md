# `@yatoi/slots`

[![npm](https://img.shields.io/npm/v/@yatoi/slots.svg)](https://www.npmjs.com/package/@yatoi/slots)
[![license](https://img.shields.io/npm/l/@yatoi/slots.svg)](https://github.com/yatoi-dev/yatoi-js/blob/main/LICENSE)

The framework-neutral slot contract for `@yatoi/kernel`. It provides the
augmentable `Slots` interface and the typed `slot()` token factory; rendering
belongs to a framework binding such as `@yatoi/react-slots` or
`@yatoi/vue-slots`.

## Install

```bash
npm install @yatoi/kernel @yatoi/slots
```

Declare the host's contribution points once:

```ts
export {}

declare module '@yatoi/slots' {
  interface Slots {
    'task.badge': { taskId: string }
  }
}
```

That same declaration is consumed by both UI bindings. Underneath, every
slot is an ordinary kernel collection, so contributions disappear
automatically when their owning plugin unloads.

See the [slot guide](https://github.com/yatoi-dev/yatoi-js/blob/main/docs/guide.md#declare-a-slot-host-side).

MIT
