// Same purpose and same caveat as ./react.ts: 'react/jsx-runtime' is
// CommonJS at runtime, so `export * from 'react/jsx-runtime'` builds into
// an opaque namespace re-export rather than the real `export { jsx, jsxs,
// Fragment }` bindings a plugin bundle's JSX-transformed code needs. Import
// the namespace and re-export the (small, stable) named surface explicitly.
import * as JsxRuntime from 'react/jsx-runtime'

export const { jsx, jsxs, Fragment } = JsxRuntime
