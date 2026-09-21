# 0003 — Declarative contributions: UI as data the host renders

**Status:** draft · **Opened:** 2026-09-21 · **Issue:** —

## Problem

A slot contribution today is **code**: a renderer the host calls
([spec §13.6](../spec.md)). That is the right default where plugin code
can reach the device — the web, React Native with a runtime loader, a
WebView shell. It has no answer where it can't:

- **Ahead-of-time compiled platforms.** Flutter/Dart has no interpreter;
  a Dart plugin is compiled into the app or it doesn't exist. Dynamism
  after install can only be data.
- **Agents.** An agent that wants to add a view or a menu item at runtime
  can emit a *description* of one instantly and safely; emitting *code*
  means a build step, a trust decision, and a delivery mechanism.
- **Before code loads.** The design brief already requires that a shell
  render a menu item contributed by a plugin whose code hasn't loaded
  (manifest/activation split, VS Code contribution points). Today the
  manifest carries only identity; there is no protocol shape for a
  contribution that is *only* data.

The kernel already stores opaque values (§11, §13.7); nothing stops a
collection of descriptors. What's missing is the *shape* — so that hosts,
plugins, agents and every implementation agree on it — and the host-side
rule for turning a descriptor into UI.

## Motivating scenarios

1. **Flutter agent view.** In the Dart app, an agent adds a "Weekly
   review" view: title, a list bound to `todos` filtered by a predicate,
   a button that runs a named command. No new Dart code ships; the host
   renders the description.
2. **Manifest-carried menu item.** The marketplace lists a not-yet-loaded
   plugin whose manifest says it contributes `sidebar.item` with label
   "Calendar" and command `calendar.open`. The item renders immediately;
   activating the command loads the plugin (lazy activation, VS Code
   style).
3. **Cross-runtime plugin.** One plugin ships a JS renderer for the web
   host and a declarative fallback; the Dart host renders the fallback.
   Same manifest, same slot name, same command ids.
4. **Server-driven UI.** The host's backend contributes descriptors over
   the wire; the kernel treats them exactly like a local plugin's
   contributions, including removal when the backend withdraws them.

## Design sketch

Two additions, both layers above the kernel:

**A descriptor vocabulary.** A small, versioned JSON schema for UI a host
can render without plugin code: containers, text, list-bound-to-a-service,
button-runs-a-command, input-bound-to-a-field. Deliberately far short of
a full UI language — the point is *commonly contributed things*, not
arbitrary layouts. Each descriptor names the slot it targets and carries
`priority`/`mode` like any contribution.

**A commands collection.** Interactivity in a descriptor is a *command
id*, not a closure. Plugins (or the host) contribute `{ id, run }` to a
`commands` collection; a descriptor's button says `command: 'calendar.open'`.
This is what lets a manifest-only contribution (scenario 2) be
interactive before code loads: the command's activation is what loads
the plugin.

**Host side.** A `<DeclarativeSlot>` / `DeclarativeSlot` widget that lists
a slot's contributions, renders code contributions as today, and
interprets descriptor contributions through a per-platform renderer
table. Unknown descriptor types render nothing and report, so a newer
plugin degrades rather than crashes an older host.

**Manifest.** Manifest entries MAY carry `contributions: Descriptor[]`,
activated by the host at manifest-load time as a synthetic plugin whose
scope lives as long as the entry is listed (or installed — open
question 3).

What stays unchanged: the kernel entirely. Descriptors are opaque values
in ordinary collections; commands are an ordinary collection. This is
§11 used as designed.

## Spec impact

- §11 — none normative; perhaps a note that values need not be
  executable.
- §13.6 — add the declarative rendering rule and the "unknown type renders
  nothing" requirement.
- §14 — manifests MAY carry contributions; define when they are
  activated and withdrawn.
- New §: the descriptor schema and the commands collection — or, better,
  a separate schema document the spec references, so it can version
  independently.

## Alternatives and workarounds

- **Do nothing; web-shell on mobile.** Ship the web app in a WebView host
  (the Obsidian route); plugin code runs in WebKit, everything works as
  today. Correct for a product that's fine with web UI on mobile.
- **React Native with a runtime loader** (Re.Pack). Code contributions
  everywhere; no declarative layer needed. Constrained by store policy
  framing (extensions of *this* app, not a store for apps) and a
  non-default toolchain.
- **Server-driven UI framework of choice** bolted on beside yatoi. Works,
  but the descriptors don't participate in cascade — nothing removes the
  server's contributions when their plugin unloads. The whole value of
  doing it as contributions is that they do.
- **Full UI-as-JSON language.** Rejected as scope: this proposal is
  about contributed *items*, not building apps out of JSON.

## Open questions

1. **Schema scope.** Which descriptor types are in v1? Proposal: text,
   list (bound to a service + field path), button (command), and a
   vertical container. Nothing else until a scenario needs it.
2. **Binding expressions.** How does a list descriptor say "todos where
   `dueDate` is this week"? A tiny predicate language, or only
   host-defined named queries (`query: 'todos.thisWeek'`)? Named queries
   are safer and simpler; start there.
3. **Manifest contribution lifetime.** Live while listed, or only while
   installed? VS Code renders contribution points for installed
   extensions only.
4. **Where the schema lives.** With the spec (moves to `yatoi-dev/spec`),
   since every implementation must render it.
5. **Relation to 0001.** Descriptors are contributions, so namespace
   isolation applies to them for free — verify once 0001 settles.

## Implementation status

| Implementation | Status | Tracking |
|---|---|---|
| yatoi-js | — | |
| yatoi-dart | — | |
