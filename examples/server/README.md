# yatoi server example

A long-running server is another capability host. Routes and scheduled
jobs exist only while the services they inject exist; remove a database
connection and the API and cleanup job disappear before the next request
or scheduler tick. This is plain `node:http`: no React, no DOM, no web
framework, and no real database.

## Run it

```bash
pnpm --filter yatoi-example-server start
```

The process binds an ephemeral local port, prints its route table, reloads
configuration after two seconds, prints the changed table, and exits
cleanly. Tests run with `pnpm test -- --project server`.

## What this shows

The server is assembled from capabilities rather than a route table built
once at startup. `Config` activates the database; `DbConnection` activates
the API and job. Routes, jobs, and middleware are collections, so their
presence follows their contributing plugin's scope. Unloading a provider
withdraws those effects synchronously and cascades dependent plugins out.

Kernel mutations happen during bootstrap, tests, and the demo's simulated
reload timer—never in the middle of handling a request. Each request gets
a coherent snapshot of the graph at its boundary.

## Contract

- `Config` — `{ dbUrl, features }`, supplied as deterministic input.
- `DbConnection` — a fake query capability with observable close state.
- `Routes` — method/path/handler records.
- `Jobs` — named work with a manual interval contract.
- `Middleware` — wrappers folded around request handling by priority.

## Plugins

**config** provides exactly the object passed to its factory. Swapping
configuration is therefore ordinary unload plus load, not mutation of a
global object.

**database** injects `Config`, opens on the next microtask, provides
`DbConnection`, and defers closing it. During that microtask
`kernel.state(DbConnection)` is `loading`; its dependents have not
contributed anything yet.

**todos-api** injects the database and contributes `GET /todos` and
`POST /todos`. Its scope owns both routes, so a database cascade removes
them together.

**nightly-cleanup** injects the same database and contributes one job.
The host scheduler owns when jobs run; the plugin only declares work that
exists during its lifetime.

**request-log** has no dependencies and contributes middleware. A config
or database cascade does not touch it, demonstrating that unload is
scoped to actual dependency edges rather than restarting the whole host.

**db-starting-guard** also has no dependencies. It reads
`kernel.state(DbConnection)` at the request boundary and returns 503 for
`/todos` while the database provider is starting.

**feature-export** injects `Config` and contributes `GET /export` only
when `features` contains `export`. Returning from `setup` without
contributing is the simplest feature-flag pattern: the plugin remains
active, but has no route effect for that configuration.

## Why there is no route table

`handle()` reads `kernel.list(Routes)` for every request. That read is the
route table. Caching it at startup would create a second lifecycle system
and require explicit registration and unregistration. Reading the kernel
fresh makes a cascade immediately visible at the next request.

## Config reload is unload plus load

The demo unloads one config plugin instance and loads another. The old
database closes, its routes and job disappear, then a fresh database and
dependents activate from the new object. Enabling `export` makes its route
appear without calling the export plugin or editing a central router.

## Loading versus absent at the HTTP boundary

A route whose provider is still loading is not in `Routes`, so the honest
default is 404. This example opts into 503 for `/todos` through
[`db-starting-guard.ts`](src/plugins/db-starting-guard.ts), a middleware
policy layered above route lookup rather than a change to the kernel.

Absence remains first-class: the host may translate it into whichever
protocol response fits its boundary.
