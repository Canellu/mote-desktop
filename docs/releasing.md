# Release process

This document defines the repository-owned version and release-note rules. The
Microsoft Store workflow and certification gates remain in
[microsoft-store-release-plan.md](./microsoft-store-release-plan.md).

## Versioning

Use semantic versions in the form `MAJOR.MINOR.PATCH`:

- Increment **MAJOR** for an intentionally incompatible change to supported
  configuration, stored state, integrations, or user workflows that requires a
  migration or explicit user action.
- Increment **MINOR** for backward-compatible features and substantial
  improvements.
- Increment **PATCH** for backward-compatible fixes, security updates, and small
  refinements.

Pre-release suffixes such as `-beta.1` may be used only for non-stable channels.
Do not reuse any version after its installer or Store submission is published.

The following files must contain the same version:

- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

Run `bun run version:check` after changing a version. Production frontend builds
also run this check automatically.

## Release notes

Maintain user-facing notes in the root `CHANGELOG.md`. Move completed entries
from **Unreleased** into a new version heading formatted as:

```markdown
## [1.2.3] - YYYY-MM-DD

### Highlights

### Improvements

### Fixes

### Known issues

### Migration notes
```

Omit empty sections. Write from the user's perspective, identify affected
features, and never include secrets, private issue data, or Hue household data.
When the public roadmap exists, append stable request references to shipped
items.

## Release sequence

1. Freeze the intended changes and update `CHANGELOG.md`.
2. Set the same version in all three manifests.
3. Run `bun run version:check`, lint, typecheck, tests, and the production build.
4. Build, sign, and validate the Store installer using the Store release plan.
5. Publish the release notes and immutable versioned installer URL.
6. Create an annotated Git tag matching the version, for example:
   `git tag -a v1.2.3 -m "Release 1.2.3"`.
7. Verify the tag, manifests, release notes, update manifest, and installer path
   all use the same version before submitting or publishing.
8. In Partner Center, open Manage package flights on the app overview and
   delete or update every live flight. A flight ranks above the non-flighted
   submission, so its testers keep the flight's older package and never see
   the release.

Never move or replace a published release tag. Correct a published release with
a new patch version.
