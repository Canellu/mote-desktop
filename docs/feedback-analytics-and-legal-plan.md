# Plan: Feedback, Privacy-Safe Analytics, and Legal Pages

Status: **in-app feedback implemented and deployed on 2026-09-12; automatic
telemetry still proposed**.

The record was wrong until 2026-09-11, when this plan still claimed email
feedback existed: the dialog discarded the message and showed a success toast,
and no prepared-email action was ever built. It now posts to a hosted endpoint
and returns a report ID. What was built, and what of this plan it does and does
not yet satisfy, is recorded in
[feedback-and-roadmap-delivery-plan.md](./feedback-and-roadmap-delivery-plan.md).
This plan continues to own the privacy rules that implementation applies.

Last reviewed: **2026-08-14**. Re-check privacy, Store, and vendor requirements
before implementation and before each release.

The product name is **Mote Desktop** and the publisher display name is **Anton
Vo**. Legal and Store material may still use `<STORE_PRODUCT_ID>` until Partner
Center assigns the final public identifier.

## Goal

Give the developer useful product analytics, anonymous crash reports, and an
easy in-app feedback channel without collecting personal information
automatically or collecting Hue household data. A reporter may optionally
provide an email address solely to receive a reply or updates about the feedback
they submitted.

The system should answer questions such as:

- Which app features are used most often?
- Where do users abandon setup flows?
- Which releases, platforms, or features fail most frequently?
- How well do PC Sync, Sync Box, widgets, and Hue commands perform?
- What bugs and feature requests do users voluntarily report?

The first release uses a persistent, user-initiated action that prepares an
editable email to `support@motedesktop.com`. It includes optional, allowlisted
app information and sends nothing automatically. The PostHog Cloud EU design
below is retained for a possible later hosted analytics, error, and feedback
phase; it is not part of the first release.

## Privacy Model

### No personal data in automatic collection

Automatic analytics and crash reporting must not collect or transmit:

- Names, email addresses, account details, or contact information.
- Stable user, installation, device, bridge, or household identifiers.
- IP addresses as stored analytics properties; disable PostHog IP capture.
- Hue application keys, credentials, request headers, or request bodies.
- Bridge IPs, Hue UUIDs, room names, light names, scene names, or device names.
- Network, monitor, audio-device, Windows-account, or user-file-path names.
- Screenshots, screen recordings, captured PC Sync frames, audio, clipboard
  contents, or session replay.
- Exact colors, brightness values, schedules, or other household behavior.
- Full URLs, route parameters, arbitrary logs, or raw backend error messages.

PostHog person profiles, autocapture, generic page-view capture, session replay,
heatmaps, console capture, and network-body capture remain disabled. App screen
views are sent only as explicit allowlisted names such as `home`, `settings`, or
`pc_sync`; resource IDs and search parameters are never included.

Feedback is necessarily free text, so a user could enter personal information
despite the app not asking for it. The form must say, "Do not include personal
information, credentials, bridge addresses, or Hue names in your message. If
you want a reply, use the optional email field." Before submission, redact
likely email addresses from the message body, phone numbers, IP addresses,
UUIDs, tokens, and Windows file paths. Do not redact a valid address entered in
the dedicated optional email field. The preview must show the exact final text,
email/contact choice, and diagnostics that will be sent.

### Default-on anonymous collection

After a first-run disclosure, enable **Share anonymous app analytics and crash
reports** by default. Users can turn it off during that disclosure or at any
time in Settings. Closing the disclosure without choosing sends nothing and
shows it again later.

Suggested disclosure:

> Help improve Mote Desktop
>
> The app shares anonymous feature-usage and crash information so bugs can be
> found and fixed. Reports do not include your Hue names, bridge address,
> credentials, screenshots, or a persistent device identifier. You can turn
> this off now or later in Settings.

Actions:

- **Continue** — anonymous collection remains enabled.
- **Turn off sharing** — automatic analytics and crashes are disabled.
- **Learn more** — opens the Privacy Policy.

Do not describe `Continue` as legal consent. It acknowledges the disclosure.
Before release, obtain a privacy review confirming that the final allowlisted
payload is genuinely anonymous. If any default field is determined to be
personal information, change the Microsoft Store build to explicit opt-in;
Microsoft Store policy requires opt-in before personal information is sent to
a third party.

### Event identity

Every analytics or crash event receives a fresh random event ID. Never reuse it
across events or sessions. Set PostHog person-profile processing and GeoIP
processing off for every event.

This deliberately prevents unique-user counts, retention analysis, and
cross-session journey tracking. Those features require a persistent
pseudonymous identifier, which is outside this plan's no-personal-information
scope.

## Analytics Events

Create a closed, versioned analytics taxonomy. Prefer enums, booleans, duration
buckets, and count buckets over arbitrary strings or exact values.

### Lifecycle and navigation

- App started, updated, foregrounded, backgrounded, and exited normally.
- App version, release channel, Windows major version, CPU architecture, and
  app language.
- Sanitized screen opened and settings tab opened.
- Startup, route-transition, and initial-resource-load duration buckets.

Do not attempt to calculate unique users or session retention. A short-lived
in-memory session ID may be used only for local aggregation and must not be
transmitted.

### Setup and Hue features

- Setup step entered, completed, retried, skipped, or failed.
- Bridge discovery and pairing outcomes with normalized failure categories.
- Coarse bridge/light/room counts such as `0`, `1`, `2-5`, `6-10`, and `11+`
  only where the metric has a defined product decision attached to it.
- Feature-use events for light controls, grouped controls, scenes, effects,
  device discovery, rooms/zones, entertainment areas, widgets, and settings.
- Control-property category such as power, brightness, color, temperature, or
  effect, without target IDs or submitted values.
- Hue command success, failure, retry, and latency bucket.

### PC Sync and Sync Box

- PC Sync mode, setup result, start/stop result, duration bucket, and normalized
  stop reason.
- HDR/capture/audio capability booleans and coarse light/channel-count buckets.
- FPS, frame-time, dropped-frame, CPU-use, and command-latency buckets.
- Capture, audio, DTLS, and streaming failures as normalized error categories.
- Sync Box setup progress, compatibility category, connection outcome, mode,
  and start/stop result.

Never include captured pixels/audio, source application names, HDMI source
names, monitor/audio-device names, Sync Box identifiers, or network addresses.

### Reliability

- Sanitized React exceptions, component stacks, and unhandled rejections.
- Sanitized Rust panic module/location and backtrace where available.
- Feature, error category, app release, recovery result, and recurrence count
  within the current in-memory session.
- Unsafe or unrecognized errors degrade to category-only reports rather than
  sending raw messages.

Upload frontend source maps to PostHog during CI using an administrative secret,
then exclude source maps and the secret from distributed packages.

## Feedback Experience

Add Settings -> Help & Feedback with:

- **Report a bug**, **Suggest a feature**, and **General feedback** categories.
- Required description and optional reproduction/expected-result fields.
- No name or account fields.
- An optional email field, empty by default.
- A contact choice of **No email**, **Reply to this feedback**, or **Keep me
  updated about this feedback**. An email address is required only for the last
  two choices.
- An optional diagnostic attachment with an expandable preview of the exact
  allowlisted payload.
- A generated report ID shown after successful submission.
- Privacy, Terms, Support, and Microsoft Store review links.

Add **Report this problem** to the existing full-screen error state. Prefill it
with sanitized crash information, but require the user to review and submit the
report.

Manual feedback remains available when automatic analytics are disabled. It is
sent only after the user presses Submit. On network failure, keep it in memory
and offer Retry or Copy; never persist or silently submit it later.

The email address is attached only to that feedback report and its random
report ID. Never use it as a PostHog person identity, analytics distinct ID, or
cross-report identifier. Do not add it to marketing, newsletters, general
product announcements, or unrelated research. In v1, replies and requested
status updates are sent manually from `<SUPPORT_EMAIL>`. Every update must state
which report it concerns and provide a one-step way to stop updates and request
deletion.

Retain a feedback email until the report is resolved plus 90 days, or for a
maximum of 12 months without report activity, whichever occurs first. Delete it
earlier when the reporter withdraws the update request or asks for deletion.
The feedback text may be retained without the email according to the documented
feedback-retention policy.

Input limits:

- Title: 120 characters.
- Description: 4,000 characters.
- Reproduction and expected-result fields: 2,000 characters each.
- Email: 254 characters, syntactically validated and normalized without
  attempting to identify or enrich the reporter.
- Diagnostic payload: 32 KiB after serialization.

Screenshot and arbitrary file uploads are deferred. They require a separately
secured upload service, malware/content handling, retention controls, and a
stronger privacy disclosure.

## Technical Architecture

### Rust ingestion boundary

Use the Rust/Tauri layer as the only PostHog ingestion path. Frontend components
call typed Tauri commands and cannot submit arbitrary event names or properties.

Add shared concepts equivalent to:

- `AnalyticsPreference`: `anonymous` or `off`, plus notice version.
- `AnalyticsEventName`: closed enum of supported events.
- `AnalyticsEvent`: event-specific, allowlisted properties.
- `AnonymousCrashReport`: sanitized code and environment fields.
- `DiagnosticSnapshot`: exact previewable technical details.
- `FeedbackContactPreference`: `none`, `reply`, or `status_updates`.
- `FeedbackReport`: category, sanitized text, optional email/contact preference,
  optional diagnostics, and report ID.
- `FeedbackSubmissionResult`: accepted report ID or normalized error.

Add Tauri commands for:

- Reading/updating the analytics preference.
- Recording a validated analytics event.
- Submitting a sanitized crash.
- Generating the diagnostic preview.
- Reading and clearing bounded local diagnostics.
- Submitting manual feedback.

The Rust validator must reject unknown events or fields, unexpected strings,
oversized values, UUID-like values, IP-like values, URLs, credentials, and file
paths. A syntactically valid email is allowed only in the dedicated feedback
contact field when its contact preference is not `none`; it must never be
accepted in analytics or crash events. Apply a second server-side PostHog
transformation/allowlist where available.

### Local diagnostics

Keep only structured, pre-sanitized diagnostic entries. Store at most 200
entries or seven days, whichever is smaller. Persist only the minimum last-crash
record needed to offer reporting after restart. Provide **Clear local
diagnostics** in Settings.

### PostHog and app security

- Use a dedicated PostHog Cloud EU production project.
- Disable IP capture, person profiles, autocapture, replay, heatmaps, console
  capture, and network-body capture at project and client levels.
- Treat the project token as public; keep personal/admin keys in CI only.
- Set billing overage to zero and configure spike alerts, rate limits, duplicate
  grouping, bot filtering, and exception suppression.
- Add client cooldowns, duplicate-submit protection, a honeypot, minimum
  interaction time, and payload limits to the feedback form.
- Replace the current null Tauri CSP with a restrictive policy allowing only
  packaged assets, required Tauri IPC, approved legal links, and PostHog EU
  ingestion.
- If public-token spam becomes material, add a Cloudflare Worker with Turnstile
  as a later hardening phase.

## Microsoft Store

Add a separate **Rate the app in Microsoft Store** action using:

```text
ms-windows-store://review/?ProductId=<STORE_PRODUCT_ID>
```

Show it only in a configured Microsoft Store build. Keep public ratings separate
from private feedback, never divert negative sentiment away from the Store, and
do not imply that private feedback affects a public rating.

Monitor and respond to reviews through Partner Center. Provide stable Privacy
and Support URLs in the Store listing.

## Legal and Public Pages

Host static, cookie-free HTTPS pages for **Mote Desktop**, published by **Anton
Vo**.

### Privacy Policy

Cover:

- The exact anonymous analytics, crash, diagnostic, and feedback fields.
- The fact that collection begins only after the first-run disclosure is shown
  and acknowledged, and how it can be disabled.
- The absence of stable identifiers, accounts, IP storage, screenshots, replay,
  and Hue household data in automatic collection.
- The optional feedback email, the user's selected reply/update purpose, its
  report-only use, retention period, withdrawal mechanism, deletion procedure,
  and disclosure to PostHog Cloud EU.
- The risk that users may voluntarily type personal information into feedback,
  the warning shown, and the automatic redaction performed.
- PostHog Cloud EU as processor and `<LEGAL_ENTITY_NAME>` as controller.
- Purposes, retention, security, international transfers, user rights, and the
  privacy-request procedure.
- Why anonymous events cannot be retrieved by user identity: no identity or
  reusable identifier exists.
- Policy version, effective date, and change history.

### Terms of Use

Cover:

- **Mote Desktop** and publisher **Anton Vo**.
- Application license and acceptable use.
- Service availability and change/discontinuation terms.
- Philips Hue/Signify non-affiliation and trademark notice.
- User responsibility for their Hue system and local network.
- Permission to use submitted feedback to improve the app.
- Warranty, liability, and governing-law placeholders for legal review.

Use Microsoft's Standard Application License Terms where applicable. Do not
force users to "accept analytics" through the Terms. If custom Terms require
click-through acceptance, store it independently from the analytics preference.

### Support Page

Cover troubleshooting, anonymous and optional-contact feedback instructions,
report-ID references, update opt-out and deletion instructions, privacy
requests, Store-review guidance, expected response times, and `<SUPPORT_EMAIL>`
as a publisher contact.

Have the worldwide Privacy Policy and Terms reviewed professionally before
release. The app has no age gate and does not intentionally collect dates of
birth or target children.

## Testing and Acceptance

- Verify no event is transmitted before the first-run disclosure is
  acknowledged.
- Verify anonymous sharing defaults on afterward and can be disabled
  immediately or later in Settings.
- Confirm each event uses a fresh ID and cannot be joined into user history.
- Inspect real automatic analytics/crash payloads for credentials, UUIDs, IPs,
  names, URLs, file paths, raw errors, free text, and persistent identifiers;
  verify feedback text and optional email appear only in the explicitly
  submitted feedback payload.
- Unit-test the allowlist/redactor against Hue responses, IPv4/IPv6 addresses,
  tokens, UUIDs, email addresses, phone numbers, Windows paths, and malicious
  strings.
- Test React crashes, unhandled promises, Tauri failures, Rust panics,
  next-launch crash recovery, and source-mapped production stacks.
- Verify unknown errors degrade to category-only reports.
- Test feedback with analytics disabled, diagnostic preview, redaction, offline
  failure, retry, duplicate submission, payload limits, all three contact
  choices, email validation, and proof that an email never appears in analytics
  or unrelated reports.
- Test reply/update withdrawal, report-linked deletion, and the 90-day/12-month
  email-retention rules.
- Confirm session replay, autocapture, heatmaps, screenshots, attachments,
  console capture, network bodies, and person profiles remain disabled.
- Verify the restrictive CSP, Store review link, legal links, quota alerts,
  frontend build, Rust tests, and Windows Tauri production build.
- Before Store submission, complete a privacy review confirming that the
  default payload is anonymous; otherwise switch default collection to opt-in.

## Suggested Phasing

1. Create the PostHog EU project, event taxonomy, privacy data inventory, and
   legal-page drafts.
2. Implement the Rust validation/ingestion boundary and anonymous event/crash
   pipeline.
3. Add the first-run disclosure, Settings controls, and explicit frontend
   instrumentation.
4. Replace email feedback with hosted submission only if its operational value
   justifies the additional privacy, validation, abuse-prevention, and retention
   work.
5. Add source-map upload, dashboards, alerts, Store links, and public legal
   pages.
6. Perform payload inspection, privacy/legal review, Store certification, and a
   staged release with zero billing overage.

## Assumptions

- The app name is **Mote Desktop** and the publisher display name is **Anton Vo**.
- No user accounts are collected. Email is optional, report-scoped, and used
  only when a reporter asks for a reply or updates about that report.
- Analytics prioritize broad app and feature understanding without persistent
  user tracking.
- Anonymous analytics and crash reports are default-on after disclosure, with
  a permanent opt-out.
- PostHog Cloud EU remains the candidate for a future hosted analytics, crash,
  and feedback phase; it is not used by the first release.
- Screenshots, attachments, session replay, and cross-session user analytics are
  outside v1 scope.
- This is an implementation plan, not legal advice; final public documents need
  professional review.
