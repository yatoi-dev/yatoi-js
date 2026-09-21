# Proposals

Design detail for problems that change the protocol — the step between
"someone filed an issue" and "design.md records a decision". One file per
problem, numbered in the order they were opened.

A proposal is *protocol-level* if solving it would change
[spec.md](../spec.md) or would need solving in every implementation
(yatoi-js, yatoi-dart, …). Anything else — devtools, publishing, an
example — is an ordinary issue in the repo it belongs to.

| # | Title | Status |
|---|---|---|
| [0001](0001-namespace-isolation.md) | Namespace isolation — per-scope resolution of a token | draft |
| [0002](0002-token-versioning.md) | Token versioning across breaking changes | draft |
| [0003](0003-declarative-contributions.md) | Declarative contributions — UI as data the host renders | draft |
| [0004](0004-contribution-identity-and-render-isolation.md) | Contribution identity and render-time isolation | draft |

**Statuses:** `draft` (being written or argued about) → `accepted` (the
design is settled; implementation issues opened per repo) → `implemented`
(every implementation's row in the status table is filled), or
`rejected` (kept, with the reason, so it isn't re-proposed).

**Lifecycle:** open a PR adding `NNNN-short-name.md` from the
[template](0000-template.md). Discussion happens on the PR. On
acceptance: update the spec in the same PR or a following one, record
the decision in design.md, add the roadmap entry, and open one tracking
issue per implementation repo, linked from the proposal's status table.
That table is the answer to "does the Dart version solve this too".

Proposals move with the spec to `yatoi-dev/spec` once a second
implementation cites them.
