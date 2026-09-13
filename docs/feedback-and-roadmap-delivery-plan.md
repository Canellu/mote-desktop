# Plan: Feedback and public roadmap delivery

Status: **private feedback implemented and deployed (2026-09-12). Public
roadmap not started.**

Last reviewed: **2026-09-12**.

What shipped on 2026-09-12: the `mote-api` Worker on `motedesktop.com/api/*`,
the `mote-feedback` D1 database, a `RATE_LIMIT` KV namespace, Rust
`submit-feedback` / `preview-feedback` commands with redaction, a real
four-phase feedback dialog, a Settings entry point, and a privacy-policy
section describing all of it. Phases P0 and P1 below are done; P2 onward are
not.

This is the build plan that resolves the open decisions left by the two existing
feedback plans. It does not restate their rules.

| Plan | Owns | This plan adds |
| ---- | ---- | -------------- |
| [Feedback, analytics, and legal](./feedback-analytics-and-legal-plan.md) | Privacy model, redaction, allowlists, retention, legal pages | The endpoint the feedback form posts to, and the record of what was built |
| [Feature voting, public roadmap, and release history](./feedback-roadmap-and-release-history-plan.md) | Product rules for requests, votes, statuses, moderation, release records | The chosen backend, schema, API, website surface, and delivery order |
| [Monetization and backend stack](./monetization-and-stack-plan.md) | Identity, commerce, entitlements, the eventual stateful backend | A backend decision scoped to the roadmap only, and the condition that would fold it into that backend |

## What was wrong before this

Two documents said feedback was implemented. It was not, and the failure mode
was worse than an absence:

- `src/features/feedback/FeedbackButton.tsx` trimmed the message, discarded it,
  closed the dialog, and called `toast.success("Thanks for your feedback")`. The
  comment read "UI-only until the hosted feedback endpoint is connected."
- `src/features/settings-screen/tabs/AboutSupportTab.tsx` had Support, Privacy
  and Terms links and a Copy diagnostics button. There was no `mailto:`, no
  prepared email, and no feedback send anywhere in the app.
- The only working channel was the `mailto:support@motedesktop.com` link on the
  website's `/support` page, which the app linked to but never named as the
  place feedback should go.

So the shipped app thanked a paying customer for feedback it threw away. Fixing
that was P0, and it is fixed: there is now no code path that reports success for
a message that was not delivered.

## Decision: Cloudflare D1 behind a Worker on the site's own domain

**Built on Cloudflare — D1 for storage, a standalone Worker for the API, KV for
rate limits, Turnstile for abuse control once a browser can write.** Not Convex,
not Supabase, not Canny.

One correction to the original shape of this plan, made during implementation:
the API is a **standalone Worker routed at `motedesktop.com/api/*`**, not Pages
Functions inside the site's project. Pages treats a Wrangler configuration file
as the source of truth and makes the matching dashboard fields read-only, and
the live site's DNS, redirect and robots configuration was hard-won. A Worker on
a route of the same zone is still same-origin with the site, deploys on its own
schedule, and cannot take the site down if it breaks. Everything else about the
decision below held.

The reasons are specific to this project rather than general:

- **The website is already on Cloudflare**, deployed to production on
  11 September 2026, and the discoverability work is built around Cloudflare's
  own DNS, WAF and analytics. Adding a Worker to the same account and zone
  means no new vendor, no new bill, and no change to how the site deploys.
- **The static guarantee is untouched.** `bun run build` ends with
  `scripts/verify-static-output.mjs` asserting prerendered HTML for every public
  route. A Worker on a separate route does not enter that build at all, so the
  assertion keeps passing and TanStack Start stays on its prerender target.
- **Turnstile is the hard part, and it is free and native here.** Anonymous
  voting is the piece that actually gets abused. Solving it inside the same
  platform that already fronts the domain is worth more than any ORM.
- **The data is tiny and exportable.** A few thousand rows of SQLite. The
  roadmap plan requires that requests, votes, moderation decisions and releases
  be exportable in a documented format; `wrangler d1 export` is that format.
- **The desktop app integrates with an HTTPS POST.** Rust posts JSON to
  `https://motedesktop.com/api/...`. No SDK, no client library, no WASM, and it
  satisfies the roadmap plan's rule that writes route through typed Rust/Tauri
  commands rather than an unrestricted client in the webview.

**When Convex wins instead:** if a Mote account system with server-held
entitlements is committed before the roadmap ships. At that point the roadmap
should be one more workload on the one backend that already knows who the user
is, and running it separately would be the mistake. The
[monetization plan](./monetization-and-stack-plan.md) still lists that provider
as undecided, so the roadmap should not be the thing that decides it. Revisit
this section when that decision is made; migrating a few thousand rows is a
day's work and should not hold the roadmap hostage.

**Why not an off-the-shelf roadmap SaaS** (Canny, Featurebase, Frill, Nolt,
Fider): they are genuinely cheaper to start. They are rejected because the
roadmap's long tail — one crawlable page per "can Mote do X" request — is
exactly the organic search surface the discoverability work was for, and it
belongs on `motedesktop.com` rather than on a vendor subdomain. A SaaS widget
also cannot be reached from inside the app's own feedback dialog without a
second, inconsistent UI.

### Free-tier headroom

Workers 100,000 requests/day; D1 5 GB storage and 5 million row reads per day;
KV 100,000 reads and 1,000 writes/day; Turnstile unlimited. At Mote's scale the
expected bill is zero. The KV write allowance is the tightest of these and it is
spent on rate-limit counters, two per submission; the roadmap read path will be
edge-cached, so traffic spikes should hit cache rather than D1.

## Architecture

```text
Mote Desktop (Tauri)
  └─ commands::feedback ──HTTPS POST──┐   validates, redacts, then posts;
     (the webview has no network path) │   the preview it shows is what is sent
                                       │
Browser on motedesktop.com ────────────┤   (roadmap only, not built yet)
  └─ fetch + Turnstile token           │
                                       ▼
                  Worker `mote-api`  —  motedesktop.com/api/*
                     ├─ validate + redact (backstop for the Rust pass)
                     ├─ Turnstile verify        (browser writes, P3)
                     ├─ KV rate limit           (hashed address, daily salt)
                     ├─ notify webhook          (best effort, never blocking)
                     ├─ cron 03:00 UTC          (contact-address retention)
                     └─ D1 `mote-feedback`
                          ├─ feedback                      (private, never rendered)
                          └─ requests / votes / releases   (public, not built yet)

Build time: scripts/fetch-roadmap-snapshot.ts reads D1 → JSON →
            prerendered /roadmap and /roadmap/<slug> pages → crawlable HTML
Runtime:    the same pages hydrate and refresh live vote counts from the API
```

The snapshot-plus-hydrate split is what makes the roadmap both crawlable and
live. A nightly Cloudflare Cron trigger calls the Pages deploy hook so new
approved requests get their own indexable page without a manual deploy.

## Data model

```sql
create table requests (
  id                 text primary key,          -- r_<ulid>
  slug               text not null unique,      -- title-derived, immutable once public
  title              text not null,             -- <= 120 chars
  body               text not null,             -- <= 4000 chars
  category           text not null,
  status             text not null default 'under_review',
  moderation_state   text not null default 'pending',
  vote_count         integer not null default 0,
  duplicate_of       text references requests(id),
  public_status_note text,
  target_version     text,
  shipped_version    text references releases(version),
  source             text not null,             -- 'app' | 'web'
  created_at         integer not null,
  updated_at         integer not null
);

create table votes (
  request_id     text not null references requests(id) on delete cascade,
  voter_key_hash text not null,                 -- HMAC(server secret, credential)
  created_at     integer not null,
  primary key (request_id, voter_key_hash)
);

create table feedback (                          -- private; never joined to votes
  id                 text primary key,           -- f_<ulid>, shown to the reporter
  category           text not null,              -- bug | feature | general
  message            text not null,              -- post-redaction
  contact_email      text,
  contact_preference text not null default 'none',
  diagnostics        text,                       -- allowlisted JSON, <= 32 KiB
  app_version        text,
  status             text not null default 'new',
  created_at         integer not null,
  purge_after        integer                     -- retention deadline, enforced by cron
);

create table releases (
  version     text primary key,                  -- 1.2.0
  channel     text not null,
  released_at integer not null,
  summary     text not null,
  notes_json  text not null                      -- highlights/improvements/fixes/known issues
);

create table release_requests (
  version    text not null references releases(version),
  request_id text not null references requests(id),
  primary key (version, request_id)
);

create table moderation_log (
  id         text primary key,
  request_id text not null references requests(id),
  action     text not null,
  note       text,
  created_at integer not null
);
```

`vote_count` is denormalised and written in the same D1 batch as the vote row,
with a weekly reconciliation job against `votes`. `requests` and `feedback` are
deliberately separate tables with no foreign key between them; nothing may join
a public request to a private report.

`releases` is populated from source-controlled release notes at deploy time, not
edited in the database, so the Git tag stays the source of truth as the roadmap
plan requires.

## API

All routes live in `worker/src/` in the website repository. Built routes are
marked; the rest arrive with the roadmap.

| Method | Route | Auth | Status | Notes |
| ------ | ----- | ---- | ------ | ----- |
| `GET` | `/api/health` | none | **built** | Liveness. |
| `POST` | `/api/feedback` | app token | **built** | Private. Returns the report ID. |
| `GET` | `/api/feedback/admin` | admin token | **built** | Recent reports as JSON, `?status=`, `?limit=` capped at 200. |
| `GET` | `/api/roadmap/requests` | none | P2 | `status`, `category`, `sort`, `cursor`. Edge-cached 60s. |
| `GET` | `/api/roadmap/requests/:slug` | none | P2 | Edge-cached 60s. |
| `POST` | `/api/roadmap/requests` | Turnstile or app token | P3 | Enters the moderation queue; not publicly visible. |
| `POST` / `DELETE` | `/api/roadmap/requests/:id/vote` | voter credential + Turnstile/app token | P3 | Idempotent toggle. |
| `GET` | `/api/releases` | none | P4 | Edge-cached 1h. |

There is no Turnstile widget yet, and deliberately so: P1 has no browser write
path at all, because the only feedback client is the desktop app. Provision it
with the web submission form in P3 rather than carrying unused configuration.

There are no CORS headers either. Nothing in a browser needs to call this yet,
and the roadmap pages that eventually will are same-origin.

Abuse control, in the order requests hit it:

1. Cloudflare WAF rate-limiting rules on `/api/*`. *Not yet configured — the
   Worker's own limits carry this for now.*
2. **Built.** KV counters keyed on `SHA-256(salt + day + CF-Connecting-IP)`,
   5/hour and 20/day. The address itself is never stored, and yesterday's keys
   become unlinkable once the salt window rolls.
3. **Built.** A 64 KiB body cap and the payload limits from the feedback plan,
   enforced before anything touches D1.
4. Turnstile verification for every browser write (P3).
5. Moderation queue — no submitted text is publicly visible before review (P3).
   Private feedback is never published, so P1 needs no queue.

**The app token is not a security boundary.** A token shipped in a binary is
extractable, and the plan should say so rather than pretend otherwise, in the
same terms the entitlement work already uses for local licensing. It raises the
cost of casual abuse; the rate limits and the moderation queue are what actually
hold.

## Voting identity

One column, two provenances, per the roadmap plan's account-free model:

- **In the app** — a random 32-byte credential generated only when the user
  first votes, stored in the OS keyring under service `com.motedesktop.mote`,
  account `roadmap-voter-key`, never in webview storage. Sent only on roadmap
  actions. Settings offers **Reset voting identity**.
- **On the website** — a random id in an `HttpOnly; Secure; SameSite=Lax`
  cookie, set only after a first successful Turnstile challenge on a vote.

The server stores `HMAC(server secret, credential)` and never the credential.
It is never used as an analytics identity, never attached to a feedback report,
and never linked to an entitlement.

**This is the site's first cookie.** The site is currently cookieless, and the
privacy policy and the discoverability record both say so. A vote cookie is
strictly necessary for a function the user explicitly requested, so it does not
require a consent banner, but the privacy policy must be updated in the same
release and the "cookieless" claim narrowed to "no tracking or analytics
cookies". Do not ship the vote button before that copy lands.

## Website surface

New routes in `mote-website`:

| Route | Prerendered | Contents |
| ----- | ----------- | -------- |
| `/roadmap` | Yes, from the build-time snapshot | Filter by category and status; sort by most requested, newest, recently updated; submit form |
| `/roadmap/<slug>` | Yes, one page per approved request | Title, body, category, status, public status note, vote count and button, link to the shipping release |
| `/changelog` | Yes | Full release history from source-controlled notes |

Build changes: `scripts/public-routes.json` gains `/roadmap` and `/changelog`
and is extended by a generated list of request slugs; `generate-sitemap.ts` and
`verify-static-output.mjs` consume the same generated list, so a request page
that fails to prerender fails the build rather than shipping blank.

Design work follows the existing site rules — semantic HTML, own the styling,
keyboard navigation, visible focus, reduced motion — and the roadmap pages get
the same SEO metadata treatment as the guide route.

## Desktop surface

1. **Built — the dialog is real.** `FeedbackDialog` is a controlled component
   with four phases: idle, sending, sent, error. The sent phase shows the report
   ID with a Copy button; the error phase shows the failure and relabels the
   button "Try again" while leaving the draft untouched. The dialog refuses to
   close mid-send, so a result is never orphaned.
2. **Built — `commands::feedback`.** `submit-feedback` and `preview-feedback`,
   applying validation and redaction before the request leaves the machine. The
   webview has no network path of its own, which is what lets the app promise
   the previewed text is the sent text, and what keeps a restrictive CSP
   achievable. `preview-feedback` exists for the payload preview the feedback
   plan requires; the dialog does not surface it yet.
3. **Built — the dialog was extracted from the title-bar button** so more than
   one surface can open it. `FeedbackButton` is the title-bar trigger;
   `FeedbackDialog` is the feature. This mattered: the button can be hidden
   through `feedbackPreferences.buttonMode`, and before the split that hid the
   only way to send feedback at all.
4. **Built — Settings → Help and legal** has a *Send feedback* row with its own
   dialog instance, so feedback survives a hidden title-bar button.
5. **P2 — the roadmap links**, once there is a roadmap to link to:
   - *Roadmap and feature requests* — `openUrl` to
     `https://motedesktop.com/roadmap?cid=app-settings`.
   - *What's new* — `https://motedesktop.com/changelog?cid=app-whatsnew`.
   - After a `feature`-category submission, the sent phase offers "See it on the
     roadmap" → `/roadmap?cid=app-feedback`. This is the link from the app out
     to the site that the roadmap needs to get its first users.
6. **`cid` values.** The website's `storeUrl` helper carries `web-*` campaign
   values for outbound Store links. App-inbound traffic needs its own marker;
   because Cloudflare Web Analytics is page-view only and cookieless, an
   `app-*` query value is how app-originated visits become visible at all.

The link is one-way for now. `<APP_SCHEME>` is still unassigned, so the website
cannot deep-link back into a specific request in the app; revisit when the
scheme is chosen.

## Delivery phases

### P0 — Stop the false success — **done**

Superseded by P1 rather than done separately: the success toast now only appears
for a report the server acknowledged with an ID. No fallback `mailto:` was
needed in the end because the real endpoint landed in the same pass.

Met: no code path reports success without a delivered message.

### P1 — Private feedback — **done, 2026-09-12**

Deployed: the `mote-api` Worker, `mote-feedback` D1 in region EEUR, the
`RATE_LIMIT` KV namespace, a daily retention cron, the Rust commands, the
four-phase dialog, the Settings entry point, and the privacy-policy section.
Turnstile was deliberately left out — see the API section.

Met, verified against production from the app's own dialog:

- A submitted report reaches D1 with an ID the reporter can quote to support,
  and the ID shown in the dialog is the ID in the row.
- A pasted bridge address and email came back from the database as `[ip]` and
  `[email]`, redacted by the Rust pass before the request left the machine.
- The captured environment is right: `app_version` 0.1.0, `platform`
  `windows x86_64`, `release_channel` `development`.
- An unauthenticated `POST` is refused with 401.
- A failed submission is visibly a failure, the draft survives it, and the
  button relabels to "Try again".
- The Copy button puts the reference on the clipboard.
- Redaction is unit-tested on both sides — 5 Rust tests, 14 TypeScript tests —
  including the negative cases, so ordinary bug prose is left readable.
- Verification rows were deleted afterwards; the table is empty.

One real bug was found only by clicking through the built app, which is the
argument for doing it: `HostedResponse` in `commands::feedback` had no
`#[serde(rename_all = "camelCase")]`, so it looked for `report_id` while the
Worker returns `reportId`. Every report was being stored correctly and then
reported to the user as a failure. Unit tests could not have caught it — the
two sides were only wrong *about each other*. Fixed and re-verified.

Notification is live. `@MoteDesktopFeedbackBot` was created through BotFather
on 2026-09-12, and `NOTIFY_FORMAT=telegram` with `NOTIFY_WEBHOOK_URL` and
`NOTIFY_TARGET` set as Worker secrets. A submitted report reaches the owner's
Telegram within seconds, carrying the report ID, category, source and version,
whether a reply was requested, and the redacted message. `/api/feedback/admin`
remains the way to read the backlog. Rotate the bot token with `/revoke` in
BotFather, then re-put `NOTIFY_WEBHOOK_URL`.

Still open on P1:

- The terms of use do not yet mention permission to use submitted feedback to
  improve the app, which `feedback-analytics-and-legal-plan.md` asks for.
- `preview-feedback` has no UI. The dialog warns that redaction happens but does
  not show the redacted text before sending.

### P2 — Public roadmap, read-only

Schema, seed the first requests by hand from support email, `/roadmap` and
`/roadmap/<slug>` prerendered, filters and sorting, nightly rebuild cron, app
links in Settings.

Acceptance: every approved request has a crawlable URL in the sitemap; the pages
render usefully with JavaScript disabled; an unreachable API degrades to the
build-time snapshot instead of an empty page.

### P3 — Submissions and voting

Submission form on web and in the app, duplicate search before submit, voting
identity, vote toggle, moderation queue and maintainer tooling, community
guidelines, abuse contact, deletion route.

Acceptance: one voter adds and removes exactly one vote; a duplicate merge
preserves a correct documented total; nothing submitted appears publicly before
moderation; the cookie change is live in the privacy policy.

### P4 — Release history

Source-controlled release notes, `/changelog`, `shipped_version` linkage,
in-app What's New shown once after upgrade, build-time validation that every
referenced request ID and version exists.

Acceptance: a **Shipped** request links to a real release; the version in
`package.json`, `Cargo.toml`, `tauri.conf.json`, the Git tag and the changelog
all agree.

## Open decisions

- Whether a maintainer moderation UI is built in P3 or deferred, with
  `wrangler d1 execute` as the interim workflow. Deferring is defensible for a
  solo maintainer at launch volume; revisit above roughly ten submissions a
  week.
- Whether comments on requests ever ship. Excluded here, as in the roadmap plan.
- Retention for rejected submissions and moderation logs.
- Whether the roadmap moves to the eventual account backend, per the switch
  condition above.
