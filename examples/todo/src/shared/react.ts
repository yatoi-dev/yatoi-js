// Re-exports the host's own React instance under the bare specifier
// 'react', so the import map in vite.config.ts can point a remote plugin
// bundle's `import 'react'` at this file instead of at a second copy. See
// the `reactImportMap` plugin in vite.config.ts for the full story.
//
// Deliberately NOT `export * from 'react'`. Two independent problems with
// that, both load-bearing enough to write down:
//
// 1. @types/react still declares itself with a legacy `export = React`
//    (node_modules/@types/react/index.d.ts), which TypeScript refuses to
//    target with `export *` at all (TS2498).
// 2. Even past that: 'react' itself is CommonJS, not ESM. Rollup can
//    inline `module.exports.useState = ...`-style properties when *this
//    same build* statically imports a named binding (it rewrites each call
//    site directly) — but it can't do that for a re-export whose consumer
//    is a *separate* build loaded later, at runtime, by URL. Built this
//    way, `export * from 'react'` compiles to a single opaque namespace
//    export with a mangled name, not real `export { useState, ... }`
//    bindings — which is exactly what a plugin bundle's
//    `import { useState } from 'react'` needs to find. Confirmed by
//    inspecting dist/shared/react.js during development: the naive version
//    exported two minified bindings, no `useState` in sight.
//
// So: import the namespace, then re-export specific names explicitly.
// That forces Rollup to emit real, individually named ESM exports on this
// chunk — the public React API surface as of 19.x.
import React from 'react'

export default React

export const {
  Children,
  Component,
  Fragment,
  Profiler,
  PureComponent,
  StrictMode,
  Suspense,
  cloneElement,
  createContext,
  createElement,
  createRef,
  forwardRef,
  isValidElement,
  lazy,
  memo,
  startTransition,
  use,
  useActionState,
  useCallback,
  useContext,
  useDebugValue,
  useDeferredValue,
  useEffect,
  useId,
  useImperativeHandle,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useOptimistic,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  version,
} = React
