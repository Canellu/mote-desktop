# Plan: Feature Voting, Public Roadmap, and Release History

Status: **future / not started**. This is a post-launch product feature. It is
not a blocker for the first Microsoft Store release except for the release
versioning and release-note foundation called out in
[microsoft-store-release-plan.md](./microsoft-store-release-plan.md).

Last reviewed: **2026-08-12**.

## Goal

Give users one place to suggest improvements, support existing requests, see
what is being considered or built, and understand which app version delivered
each completed item.

This plan extends, but does not replace,
[feedback-analytics-and-legal-plan.md](./feedback-analytics-and-legal-plan.md).
That plan continues to own private bug reports, private general feedback,
diagnostics, optional contact email, analytics, and their privacy rules. This
plan owns public feature requests, votes, roadmap state, and release history.

## User experience

Add **Settings -> Help & Feedback** with three distinct surfaces:

- **Send feedback** for private bug reports, feature suggestions, and general
  feedback as defined by the existing feedback plan.
- **Roadmap** for public feature requests, voting, filtering, and status.
- **What's New** for the current release and the complete release history.

The Roadmap surface provides:

- Search before submission so users can find and vote for an existing request.
- A request title, concise description, category, status, vote count, creation
  date, and optional target release.
- Filters for category and status, with separate views for most requested,
  newest, and recently updated.
- One vote per eligible voter, with a clear toggle to remove a vote.
- Links from duplicate requests to the canonical request.
- A changelog link when a request reaches **Shipped**.
- Reporting for spam or unsafe content without exposing reporter identity.

Do not publish private feedback text, diagnostic data, email addresses, Hue
names, resource identifiers, bridge addresses, or other household information
to the roadmap.

## Categories and statuses

Initial request categories:

- Lighting and scenes
- Rooms, zones, and devices
- PC Sync
- HDMI Sync Box
- Automations and scheduling
- Widgets and desktop experience
- Accessibility
- Other

Use a closed status set with user-facing definitions:

- **Under review** - received but not committed.
- **Planned** - accepted for future work without a guaranteed date.
- **In progress** - active implementation work exists.
- **Shipped** - available in a named released version.
- **Not planned** - declined or closed, with a short public reason.

Keep target versions optional. Do not promise dates unless a release is actually
scheduled. Vote totals inform prioritization but do not determine it.

## Release history and version rules

Use semantic versions in the form `MAJOR.MINOR.PATCH`. Keep the version in
`package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`
synchronized until a single generated source of truth is introduced.

Maintain source-controlled release records with:

- Version, release date, channel, short summary, and optional minimum supported
  version.
- Sections for highlights, improvements, fixes, known issues, and breaking or
  migration notes where applicable.
- Stable request IDs for roadmap items shipped in that release.
- A stable public URL used by Store submissions and support responses.

Every published release receives an immutable Git tag such as `v1.2.0`, an
immutable signed installer URL, and matching release notes. Never rewrite a
published release record, tag, version, or installer; issue a new patch version
for corrections.

The app should show **What's New in vX.Y.Z** once after a successful upgrade.
Store the last acknowledged version locally, allow dismissal, and keep the same
content available later under Help & Feedback. A failed or downgraded update
must not incorrectly mark a newer release as acknowledged.

## Data model

Conceptual server records:

```text
FeatureRequest
  id, title, description, category, status, voteCount
  createdAt, updatedAt, targetVersion?, shippedVersion?
  duplicateOf?, publicStatusNote?, moderationState

Vote
  requestId, voterKeyHash, createdAt

Release
  version, channel, releasedAt, summary
  highlights[], improvements[], fixes[], knownIssues[]
  shippedRequestIds[]
```

Vote counts are derived server-side. Clients cannot submit or directly modify
counts, statuses, target versions, shipped versions, or release records.

## Voting identity and privacy

Reliable voting requires a narrowly scoped persistent identifier. This is
separate from anonymous analytics and must never become a PostHog identity or
be joined with feedback reports, Hue data, diagnostics, or app usage.

Recommended account-free model for the first voting release:

- Generate a random voting credential only when the user first chooses to vote.
- Store it in the operating-system credential store, not webview local storage.
- Send it only during explicit roadmap actions.
- Store only a server-side keyed hash as `voterKeyHash`.
- Explain the purpose before the first vote and provide **Reset voting
  identity** and deletion instructions.
- Do not promise that reset/reinstallation cannot permit another vote; voting is
  advisory rather than a security or entitlement boundary.

If app accounts exist before this feature ships, use the authenticated account
ID through the backend authorization layer instead. Do not collect an email
address solely to vote. Revisit the Privacy Policy and data-retention schedule
before enabling either model.

## Architecture

- Treat the hosted roadmap backend as the system of record. PostHog is not a
  public roadmap database.
- Reuse the authenticated Convex direction from
  [monetization-and-stack-plan.md](./monetization-and-stack-plan.md) if that
  backend exists by implementation time; otherwise select and document a small
  equivalent service after reviewing current cost, privacy, moderation, backup,
  and export requirements.
- Route desktop writes through typed Rust/Tauri commands. Do not expose an
  unrestricted backend mutation client in the webview.
- Allow unauthenticated read-only roadmap and release-history access, with
  caching and a useful offline state.
- Keep status changes, duplicate merges, moderation, and release publication
  behind a separate authenticated maintainer workflow.
- Rate-limit submissions and votes, reject oversized content, sanitize rendered
  text, and retain an auditable moderation history.
- Export requests, votes, moderation decisions, and releases in a documented
  format so the product is not locked to one provider.

## Moderation and product rules

- New requests enter a moderation queue before public display.
- Maintainers may edit titles for clarity, apply categories, merge duplicates,
  and remove spam or unsafe content without changing the request's meaning.
- Status changes include a short dated public note.
- Removing a request does not silently transfer its votes except during a
  documented duplicate merge.
- Security reports, personal-data incidents, account issues, and support cases
  are redirected to private support rather than published.
- Publish community guidelines and an abuse-contact route before accepting
  public text.

## Delivery phases

1. **Release foundation (first Store release)**
   - Synchronize and validate application versions.
   - Create source-controlled release notes and immutable release tags.
   - Show the installed version and a release-notes link in Settings/About.
     The release-notes row is currently omitted because release notes are not
     available yet; restore it once the public release-notes page is live.
2. **Read-only history (post-launch)**
   - Add the in-app What's New and release-history views.
   - Show the current release once after upgrades.
3. **Public roadmap**
   - Add hosted request records, read-only status views, search, filters, and
     maintainer moderation/status tooling.
4. **Requests and voting**
   - Add submissions, duplicate handling, the chosen voting identity, abuse
     controls, privacy disclosures, deletion, and vote removal.
5. **Release integration**
   - Link shipped requests to releases and automate validation that referenced
     request IDs and versions exist.

## Acceptance criteria

- Users can distinguish private feedback from public feature requests before
  submitting any text.
- Public requests expose no private feedback, optional email, diagnostic, Hue,
  network, or household data.
- A voter can add and remove one vote and understand how the voting credential
  is used.
- Duplicate merges preserve a documented, correct vote total.
- Only maintainers can change status, moderation state, target version, shipped
  version, or release content.
- Every **Shipped** request references an existing release record, and every
  published release uses the same version in manifests, tag, installer URL, and
  release notes.
- What's New appears once after upgrade and remains accessible afterward.
- Offline, unavailable-service, rate-limit, deleted-request, and stale-cache
  states are tested and understandable.
- Privacy, retention, moderation, backup/export, accessibility, and security
  reviews pass before public submissions or voting are enabled.

## Open decisions

- Whether voting launches before or after app accounts.
- Hosted roadmap service and public web URL.
- Who moderates requests and the expected response cadence.
- Retention period for rejected submissions, vote records, and moderation logs.
- Whether users can comment; comments are excluded from the initial scope.
