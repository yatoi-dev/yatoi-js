# Changesets

Every user-visible package change needs a changeset:

```bash
pnpm changeset
```

Patches are per package: select only the packages whose behaviour changed.
Minors and majors are a new contract and move all four packages together:
select every package at that level (`pnpm check:changesets` enforces it).
Examples and internal documentation do not need changesets unless they
accompany a package change.

See [the release guide](../docs/releasing.md) for the complete process.
