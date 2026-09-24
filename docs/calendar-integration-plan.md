# Local Calendar Integration

Status: **v1 shipped in 0.6.0 as calendar subscriptions**. The OAuth providers, CalDAV, and the calendar views below remain
proposed.

## As built

- Calendars are iCalendar addresses: Google's secret iCal address, an Outlook
  published calendar, an iCloud public calendar, or any `https:`/`webcal:`
  `.ics` link. That covers the three providers without registering OAuth
  clients, which need the publisher's accounts and Google's verification.
- The address is a secret and lives in the keyring (`calendar-feed:<id>`);
  `calendar.json` holds names, ids, and rules. Feeds are fetched with
  certificate checks on start and every 15 minutes (five after a failure),
  with ETag and Last-Modified. Event contents are never written to disk, so
  SQLite and cache encryption were not needed.
- `calendar/ics.rs` reads VEVENT, RRULE (daily to yearly, INTERVAL, COUNT,
  UNTIL, BYDAY with ordinals, BYMONTHDAY, BYMONTH, BYSETPOS), EXDATE, moved and
  cancelled instances, DURATION, all-day and floating times, and VTIMEZONE
  blocks, expanding in the event's wall-clock time. A zone a feed does not
  describe falls back to local time.
- A rule picks calendars, title words to include and exclude, busy only, and
  all-day events; starts up to an hour before and ends up to an hour after;
  and sets a color, a white, a scene, a dim level, or off, with restore
  optional. It holds its look for the whole window as the `Calendar(rule)`
  holder, so a restart during an event takes the lights back without a
  trigger ledger. Rules rank in list order inside the calendar's place in the
  priority list.
- Rules are edited in Automations; connected calendars live in Settings →
  Connections → Calendars. The rule editor shows the week's
  matching events and a live preview.
- Not built: Google and Microsoft OAuth, CalDAV, Agenda/Week/Month views,
  display settings, tray pause controls, and notifications.

Shared runtime prerequisite: [automation-runtime-plan.md](./automation-runtime-plan.md).

## Summary

Build a read-only, serverless calendar client for Google Calendar, Microsoft
Outlook/Microsoft 365, CalDAV—including iCloud—and iCalendar subscription
URLs.

- Support multiple accounts across providers.
- Add `/calendar` with Agenda, Week, and Month views.
- Run event-relative Hue automations locally while the app is open or in
  the tray.
- Support Windows, macOS, and Linux.
- Store credentials in the OS credential vault and calendar state in a local
  SQLite database.
- Never require an application backend, webhook service, or Hue Bridge
  schedules.

## Product and UX

### Calendar experience

- Add Calendar to the Home header and a Calendar tab under Settings →
  Connections.
- Display read-only event details: title, time, calendar, location, organizer,
  response, meeting link, and description.
- Open meeting links and provider event pages in the system browser.
- Let users connect multiple Google, Microsoft, CalDAV, and iCalendar
  accounts/subscriptions.
- Provide calendar visibility toggles, connection health, last sync time,
  reauthentication, manual sync, and disconnect actions.
- Disconnecting wipes credentials and cached events; dependent rules remain
  disabled with a repair warning.

### Display settings

Use system defaults initially, with overrides for:

- Date format: system, DMY, MDY, or YMD.
- Time format: system, 12-hour, or 24-hour.
- Week start: system, Monday, Sunday, or Saturday.
- Display timezone: system or an IANA timezone.
- Default view: Agenda, Week, or Month.
- Working days and working-hour range.
- Week numbers.
- Declined-event visibility.

Keep provider calendar colors in v1. Custom colors, secondary timezones, event
creation, editing, RSVP, and reminders are out of scope.

### Automation rules

Provide an Automations section and a rule editor:

1. **When:** select calendars and filter events by busy/free status, attendee
   response, all-day status, and case-insensitive title include/exclude text.
2. **Actions:** add ordered steps relative to event start or end, from seven
   days before through seven days after.
3. **Review:** choose restore behavior, entertainment conflict policy,
   priority, notifications, and inspect upcoming matching events.

Each step supports:

- Activating a Hue scene.
- Setting power, brightness, XY color, color temperature, and transition
  duration on rooms, zones, or individual lights.
- No signaling/pulse effects in v1.

Optional restoration captures affected lights immediately before the first
action and restores them at or after event end. Restoration is off by default.

Rules have user-controlled priority. Higher-priority active rules win
overlapping targets. The engine maintains a per-light baseline and active-rule
layers so nested rules cannot corrupt restoration state.

Entertainment handling is selected per rule:

- Skip conflicting lights—default; scenes with any conflict are skipped
  because they are indivisible.
- Skip the entire step.
- Stop entertainment controlled by the app, then run. Externally owned
  sync sessions cannot be interrupted and fall back to skipping.

### Runtime behavior

- Automations require the app to be open or hidden in the tray.
- Enabling the first rule explains this requirement and offers to enable
  autostart and minimize-to-tray behavior.
- Add tray controls for opening Calendar, viewing the next cue, pausing for one
  hour/until tomorrow, resuming, and quitting.
- On sleep, restart, reconnect, or delayed execution, apply only the latest
  state that remains relevant:
  - Before or during an event, run the latest due step.
  - End actions receive a 15-minute late window.
  - Restoration runs whenever a persisted owned snapshot remains.
  - Never replay a sequence of stale cues.
- On explicit quit, perform bounded best-effort restoration and persist any
  failed restoration for startup recovery.
- Calendar display remains available without a Hue Bridge; rules report the
  bridge requirement.

## Architecture and Interfaces

### Platform foundation

- Replace the Windows-only registry implementation with the cross-platform
  [Tauri autostart plugin](https://v2.tauri.app/plugin/autostart/), preserving
  the existing app-settings interface and `--autostart` hidden-launch behavior.
- Enable native keyring backends for Windows Credential Manager, macOS
  Keychain, and a persistent Linux Secret Service implementation. Do not fall
  back to plaintext storage.
- Add the
  [Tauri notification plugin](https://v2.tauri.app/plugin/notification/).
  Request permission only when automation notices are enabled.
- Detect sleep/resume portably through periodic
  monotonic-versus-wall-clock reconciliation rather than platform-specific
  window events.

### Local persistence and privacy

Add `calendar.db` in the application config directory using bundled SQLite
with transactional schema migrations.

Store normalized tables for:

- Accounts and calendar sources.
- Expanded event instances and fetched time ranges.
- Provider sync cursors, ETags, and delta links.
- Versioned rule JSON and priority.
- Trigger ledger, automation ownership journal, activity history, and display
  settings.

Store OAuth refresh tokens, CalDAV passwords, private subscription URLs, and a
generated cache-encryption key in the OS keyring. Encrypt event titles,
descriptions, locations, attendees, organizers, and meeting URLs in SQLite;
retain only timing and routing fields needed for indexes. Never log event
contents, tokens, passwords, or subscription query strings.

### Provider adapters

Create a common backend adapter returning normalized accounts, calendars, and
event instances.

- **Google:** desktop OAuth through the system browser, PKCE/state, and a
  random `127.0.0.1` callback listener. Use read-only Calendar scope,
  CalendarList, and incremental event sync tokens. Handle pagination and `410
Gone` by rebuilding the affected range. Google explicitly supports loopback
  callbacks for desktop apps and incremental synchronization.
  [OAuth](https://developers.google.com/identity/protocols/oauth2/native-app),
  [sync](https://developers.google.com/workspace/calendar/api/guides/sync).
- **Microsoft:** `/common` public-client authorization-code flow with PKCE and
  delegated `Calendars.Read`, `Calendars.Read.Shared`, and `offline_access`.
  Use `/me/calendars` and per-calendar `calendarView/delta` ranges.
  [OAuth](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow),
  [calendar delta](https://learn.microsoft.com/en-us/graph/api/event-delta?view=graph-rest-1.0).
- **CalDAV:** HTTPS-only discovery using RFC 6764 SRV and
  `/.well-known/caldav`, followed by principal, calendar-home, and calendar
  collection discovery. Support Basic/app-password authentication,
  sync-collection tokens where advertised, and ETag/time-range fallback.
  iCloud uses its supported third-party authorization or an app-specific
  password.
  [CalDAV discovery](https://www.rfc-editor.org/info/rfc6764/),
  [CalDAV](https://www.rfc-editor.org/rfc/rfc4791.html),
  [WebDAV sync](https://datatracker.ietf.org/doc/html/rfc6578),
  [Apple guidance](https://support.apple.com/en-us/121539).
- **iCalendar subscription:** accept `webcal://` and HTTPS `.ics` URLs,
  converting `webcal` to HTTPS. Use conditional requests with
  ETag/Last-Modified and respect cache headers.

Use a shared RFC 5545 parser and recurrence expander for CalDAV and
subscriptions, including recurrence exceptions, cancellations, floating
times, IANA zones, embedded `VTIMEZONE`, DST boundaries, and all-day exclusive
end dates.
[iCalendar specification](https://www.rfc-editor.org/info/rfc5545/).

Maintain a standard cache window of 30 days past and 365 days future, with
on-demand range fetching for navigation outside it. Rebase fixed-window delta
cursors before their horizon expires.

Poll Google, Microsoft, and CalDAV every five minutes; poll subscriptions every
fifteen minutes unless cache headers request a longer interval. Also sync on
startup, resume, manual refresh, and reauthentication. Apply exponential
backoff with jitter and a 30-minute ceiling. Push webhooks are excluded because
they require a public endpoint.

### Scheduler and Hue execution

Add managed `CalendarService` and `CalendarAutomationEngine` backend state.

- Build exact local deadlines from cached events; provider polling frequency
  does not determine trigger precision.
- Recompute deadlines after every sync, rule edit, timezone change, resume, or
  clock change.
- Use a trigger fingerprint of rule, event instance, step, and computed due
  time for idempotency. Moving an event creates a new schedule; cancellation
  removes pending work.
- Persist snapshots and ownership before the first Hue write.
- Consume the snapshot, ownership, conflict, recovery, tray, and notification
  capabilities from the shared automation runtime.
- Resolve rooms and zones to v2 light UUIDs. Use `grouped_light` only when the
  complete group can be addressed; use paced per-light writes after partial
  conflict filtering.
- Use Hue API v2 scenes and state writes, including command-local transitions.
- Apply supported properties to mixed-capability targets and report skipped
  color/temperature properties.
- A manual in-app Hue write revokes calendar ownership for affected lights.
  External SSE changes that diverge from the engine’s expected write mark
  those lights as externally modified and exclude them from automatic
  restoration until a later calendar step reacquires them.
- Retry bridge failures only while the latest step remains relevant; expose
  failures through activity history and optional native notifications.

### Public frontend/backend interfaces

Add shared TypeScript/Rust representations for:

- `CalendarProvider`, `CalendarAccount`, `CalendarSource`, and `CalendarEvent`.
- `CalendarDisplaySettings`.
- `CalendarRule`, `CalendarRuleFilter`, `CalendarRuleStep`,
  `CalendarHueAction`, `CalendarRuleRestore`, and
  `EntertainmentConflictPolicy`.
- `CalendarRuntimeStatus`, `CalendarSyncStatus`, and
  `CalendarAutomationActivity`.

Add Tauri commands:

- `get-calendar-state`, `get-calendar-events`, `sync-calendars`, and
  `sync-calendar-range`.
- `start-calendar-oauth`, `cancel-calendar-oauth`,
  `connect-caldav-account`, `connect-ics-subscription`,
  `reauthorize-calendar-account`, and `disconnect-calendar-account`.
- `update-calendar-source`, `set-calendar-display-settings`.
- `save-calendar-rule`, `delete-calendar-rule`, `reorder-calendar-rules`,
  `set-calendar-rule-enabled`, `preview-calendar-action`, and
  `set-calendar-automation-pause`.

Emit:

- `calendar-data-changed`.
- `calendar-sync-status`.
- `calendar-oauth-finished`.
- `calendar-runtime-status`.
- `calendar-automation-activity`.

The frontend uses a dedicated Zustand store and refreshes authoritative backend
state after these events.

## Delivery Sequence

1. **Cross-platform foundation:** portable autostart, keyring backends,
   notifications, hidden tray launch, and platform build checks.
2. **Calendar backend:** SQLite migrations, encrypted cache, OAuth loopback
   flow, provider adapters, CalDAV/ICS normalization, polling, and sync-status
   commands.
3. **Functional calendar UI:** account management, source visibility,
   Agenda/Week/Month views, event drawer, date/time settings, and external
   meeting links.
4. **Automation backend:** fake-clock scheduler, trigger ledger, Hue
   resolution/actions, priority layering, restoration journal, conflict
   policies, sleep/restart recovery, and tray state.
5. **Functional automation UI:** rule list, priority ordering, editor, match
   preview, action preview, pause controls, status, and activity history.
6. **Visual pass:** calendar density, responsive layouts, drag/reorder polish,
   transitions, empty/error states, and reduced-motion behavior. Keep this
   separate from backend scheduler work.

## Test and Acceptance Plan

- OAuth tests: PKCE/state validation, loopback-only binding, timeout/cancel,
  refresh rotation, revoked consent, concurrent attempts, and redacted errors.
- Provider fixtures: pagination, delta tokens, deleted events, expired cursors,
  rate limits, shared calendars, recurring exceptions, moved events,
  cancellations, declined invitations, private events, and provider-specific
  timezone formats.
- CalDAV/ICS tests: discovery redirects, TLS rejection, principal/home
  discovery, sync-token and ETag fallback, iCloud app-password flow, cache
  headers, malformed feeds, recurrence exceptions, embedded timezones, and DST
  transitions.
- Scheduler tests with a fake clock: negative/positive offsets, exact-once
  execution, edits after a cue, priority overlaps, scene conflicts,
  pause/resume, sleep, restart, clock/timezone changes, stale cache, and
  current-state catch-up.
- Hue tests: room/zone UUID resolution, grouped versus per-light writes,
  transition units, mixed capabilities, bridge outage/reconnect, entertainment
  policies, external overrides, layered snapshots, and crash-safe restoration.
- UI tests: Agenda/Week/Month rendering, locale formats, all-day events,
  cross-midnight events, working-hour shading, source filtering, account
  errors, rule match previews, keyboard access, and reduced motion.
- Security checks: no secrets in SQLite/logs, encrypted sensitive payloads,
  credential deletion, HTTPS-only subscriptions/CalDAV, sanitized
  descriptions, and validated external URLs.
- Run targeted Rust tests, `bun run build`, and packaged Tauri builds on
  Windows, macOS, and Linux.

Acceptance requires multiple simultaneous accounts, read-only calendar display,
accurate tray-based actions while awake, deterministic sleep/restart recovery,
no duplicate cues, safe restoration, and no network traffic except calendar
providers, OAuth endpoints, subscription hosts, and the local Hue Bridge.

## Assumptions

- Provider OAuth client registrations are owned by the publisher and distributed
  as public native-client configuration; no confidential server secret is
  introduced.
- Google production release still requires its consent-screen verification and
  public privacy/home pages, but those may be static pages and are not an
  application backend.
- Linux requires a functioning Secret Service/keyring; calendar account
  connection is disabled with a clear error if secure storage is unavailable.
- No cross-device rule synchronization, mobile client, event modification,
  provider reminders, webhook service, or legacy Hue Bridge scheduling is
  included.
- Preserve completed PC Sync behavior and regression tests while the shared
  runtime extracts reusable snapshot behavior.
