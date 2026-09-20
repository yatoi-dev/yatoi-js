// The kernel compiles with lib ES2022 and no ambient @types, so `console`
// is not declared. Declare the two methods we use rather than pulling in
// DOM or Node types — both hosts provide these at runtime.
declare const console: {
  warn(...data: unknown[]): void
  error(...data: unknown[]): void
}
