# Beyond UI

Yatoi's kernel is not a UI primitive. It is a capability graph whose
nodes have lifetimes. A plugin declares which capabilities it needs with
`inject`, publishes services with `provide`, adds many-valued capabilities
with `contribute`, and records cleanup with `defer`. The graph treats
absence as a real state: when a service disappears, its dependents do not
keep running with a stale reference or wait to fail on their next call.
Their scopes dispose immediately, their effects reverse, and that removal
cascades through the graph.

React and Vue make this visible because components mount and unmount, but
the kernel itself has no DOM and no framework types. The same primitive
fits any long-running host whose available operations change at runtime.
The host decides when to load and unload plugins and reads services or
collections at the boundary of each unit of work. The kernel owns the
dependency and cleanup semantics in between.

## Agent runtimes

An agent's tool list, prompt sections, middleware, credentials, model
providers, and subordinate agents are capabilities with different
lifetimes. In the [agent-host example](../examples/agent-host/README.md),
a calendar skill injects a Google credential. Revoking the credential
unloads the skill before the next turn, closes its client, and removes its
tools and prompt contribution. There is no separate tool-unregistration
protocol: the next turn reads the `Tools` collection and gets the shorter
list.

The same example adapts a simulated MCP connection. Its transport is a
service; the connection plugin contributes the remote server's tools only
while that service exists. A dropped transport therefore uses the same
cascade as a revoked credential. Delegation uses the scope tree rather
than a second session manager: the `delegate` tool loads a child plugin
for one nested turn, and unloading the parent disposes the child's session
and temporary tools even if the turn is paused.

This does not replace an agent framework. Planning, memory, model calls,
and durable execution can live inside plugins or the host. The kernel
answers the narrower lifecycle question: which capabilities exist now,
what depends on them, and what must be undone when one disappears?

## Long-running servers and capability revocation

A server has the same shape when routes, jobs, and middleware depend on
resources that may be rotated or revoked. The
[server example](../examples/server/README.md) uses plain `node:http`.
Configuration provides the input for an asynchronously opened database;
the database activates API routes and a cleanup job. Unloading it closes
the old connection and synchronously removes both dependents. The next
request sees no matching route, and the next scheduler tick sees no job.

The host deliberately reads `Routes` for every request and `Jobs` for
every tick. Caching either collection at startup would create a second
registration lifecycle that could drift from the kernel. Fresh reads
make absence visible at the protocol boundary, where the host can choose
an honest response: 404 because no route currently exists, or middleware
that turns a `loading` database state into 503.

Configuration reload is unload plus load. A new configuration object
causes only its dependency subtree to restart; unrelated request logging
stays active. Feature flags need no special kernel support either: a
plugin can inspect injected configuration and simply contribute nothing
when a feature is disabled.

Kernel mutation belongs between requests, jobs, or turns—not halfway
through handling one. The host chooses those boundaries; the kernel makes
each resulting graph transition synchronous to observers even when setup
or cleanup has asynchronous work behind it.

## Also fits

The same model can fit development-tool plugin hosts, peripheral discovery
where devices appear and disappear, and game or application mod ecosystems
whose capabilities can be enabled and revoked. Those domains still need
their own contracts and hosts; yatoi supplies only the common lifecycle
and dependency mechanism.

## Out of scope

Yatoi is not trying to provide:

- DI-container ergonomics such as decorators, reflection, or auto-wiring;
- sandboxing or security isolation for untrusted plugins;
- durable workflow execution, retries, or persisted process state;
- module loading, bundling, or remote-code delivery;
- application state management.

Those systems can sit beside or inside a yatoi plugin. The kernel's job is
smaller: make capability presence explicit and make removal complete.
