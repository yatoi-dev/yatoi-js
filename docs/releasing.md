# Releasing to npm

The repository contains examples, tests, design documents, and local tooling,
but npm does not publish the repository root. Each public package is packed
from its own directory and has an explicit `files` allowlist. Its tarball
contains only compiled JavaScript, declarations, its README, agent instructions,
`LICENSE`, and `package.json`.

## Versioning

Patches are per package; minors and majors move all six together.

- A **patch** fixes behaviour inside the current contract. It bumps only
  the packages named in its changeset — a kernel fix ships as
  `@yatoi/kernel@0.1.1` while the bindings stay where they are. Each
  package's patch number is its own history; they are not kept equal.
- A **minor** (or, after 1.0, a major) is a new contract: a change to
  [the spec](spec.md) or to any public API. Every package moves to the
  same `x.y.0` together, whether or not its own code changed, so one
  number names one compatible set. A package with nothing else to say
  gets a changelog line saying it was aligned with the new contract.
- While the major is 0, a minor may break; a patch never does.

Internal package references use `workspace:^`, published as caret ranges
(`^0.1.0`). For a 0.x major, caret admits patches and excludes minors —
so the version scheme and the dependency ranges say the same thing.
`updateInternalDependencies` is `patch` in `.changeset/config.json`. When
two dependent packages receive patches together, this advances the
dependent package's minimum compatible version. It does not pull an
otherwise unchanged dependent into a release; Changesets applies the
setting only to packages already included in that release.

The lockstep rule is not a Changesets mode (`fixed` would lock patches
too; `linked` makes a package that skipped releases jump to catch up). It
is enforced by `scripts/check-changesets.mjs`, which fails
`pnpm version-packages` and CI if any pending minor/major changeset omits
a package or bumps one below the release level. It also delegates to
Changesets' status check so a package change with no changeset fails CI.

## One-time npm setup

1. Create or claim the `@yatoi` npm organization and give the release owner
   permission to publish all six packages.
2. Require two-factor authentication for publishing.
3. Confirm that these names are available on the public registry:
   `@yatoi/kernel`, `@yatoi/react`, `@yatoi/slots`, `@yatoi/react-slots`,
   `@yatoi/vue`, and `@yatoi/vue-slots`.
4. Authenticate with the public registry. Some development machines point
   `~/.npmrc` at a private registry; use
   `npm_config_registry=https://registry.npmjs.org/` for npm identity and
   availability checks on those machines.

`publishConfig` pins every package to the public npm registry and public
access, but it does not grant permission or replace npm authentication.

## Record a package change

For every user-visible package change, add a changeset in the same pull
request:

```bash
pnpm changeset
```

Choose the semantic-version impact and explain the behavior developers will
notice. For a patch, name only the packages that changed. For a minor or
major, name all six at that level (see Versioning above); the guard will
tell you if you forget one. Changes limited to examples, internal
documentation, tests, or build tooling do not need a changeset.

## Prepare a release

Apply pending changesets and update the lockfile:

```bash
pnpm version-packages
pnpm install
```

Review the generated changelogs, version changes, and updated internal
dependency ranges. On a patch release, unrelated packages keep their
versions; on a minor or major, all six land on the same `x.y.0`.
Then run the complete preflight:

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm pack:check
```

`pack:check` performs a clean package build, creates all six tarballs in a
temporary directory, and fails if a tarball contains source maps, TypeScript
build metadata, tests, examples, or unresolved `workspace:` dependencies.
It deletes the temporary tarballs when finished.

Commit the reviewed version and changelog changes before publishing. Tag the
release only after publication succeeds.

## Publish

Publishing changes external state. Run this only from the exact reviewed
release commit while authenticated as an npm publisher:

```bash
pnpm release
```

For the first release, the manifests already carry `0.1.0` and
`CHANGELOG.md` holds the release notes. Do not run `pnpm version-packages`
first: it would consume the pending changesets and bump every package to
`0.1.1` before anything exists on npm. Instead, delete the pending
changeset files (their content is already in the `0.1.0` changelog
entry), then publish. Changesets accumulate from the first published
version onward.

The repository intentionally does not contain an automatic publish workflow
yet. Configure npm trusted publishing for this GitHub repository first, then
add a release workflow with an OIDC identity and npm provenance. Until that
external trust relationship exists, CI validates tarballs but cannot safely
publish them.

After publishing, install the packages in a new empty project and run one
kernel example plus one example for each framework binding included in the
release. Finally, verify the npm package pages, README rendering, dependency
ranges, and `latest` dist-tag.
