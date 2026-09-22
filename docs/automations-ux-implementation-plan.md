# Automations UX implementation plan

Status: **Implemented through Phase 7 on 2026-09-19.**
Prepared: **2026-09-19**.

Implementation ledger: draft/save contracts and validation; controlled reusable
fields; configured overview; singleton, Presence, and Calendar creation wizards;
direct edit pages; shared calendar management; focus return navigation; scoped
loading/error recovery; focus restoration; responsive light/dark polish. Automated
frontend checks pass. Browser-gallery visual checks cover the overview and type
chooser at the minimum desktop width in both themes. Real Hue bridge writes,
keyring access, microphone/lock detection, phone discovery, calendar fetching,
and physical-light preview/restoration still require a Tauri hardware pass.

**Superseded in part (2026-09-19): Automations is its own screen.** It moved
out of Settings to `/automations`, opened from the Home header beside Focus,
Sync and Settings, with the wizard at `/automations/new`; the old
`/settings?tab=automations` redirects there. The components moved to
`src/features/automations/components/`, the legacy `AutomationsTab` editor
was removed, and the overview no longer links to Focus: Focus is something
the person starts, not an automation, and has its own header button. The
decisions below about Settings, the Open Focus link, and the wizard route are
historical; everything else stands.

Later the same day: calendar connections moved to Settings → Connections →
Calendars (a rule still connects one inline), so the overview's "More" list is
just Priority, shown with its current order. Edit pages use
`AutomationEditorLayout`: a sticky rail with the automation as one sentence
(`summaries.ts`, shared with the overview cards), the on/off switch, a section
list showing each section's value and the one in view, preview, and Save; a
floating Save bar replaces it in narrow windows. Picker rooms fold to one row
naming their selection.

## 1. Read this first

Implement a configured-automation overview, an **Add automation** type chooser,
short guided creation, and direct editing afterward. Preserve Mote's current
visual language and automation engines. This is a frontend workflow change,
not a new automation framework.

The intended user can create their first useful automation without understanding
priority, runtime ownership, or bridge resource types. A returning user can see
what is configured, whether it is enabled, and what it is waiting for.

Execute the phases below **sequentially, one phase per task/prompt**. Do not ask a
smaller model to implement this document in one turn. Each phase ends at its
acceptance gate; record completed work and remaining failures before continuing.
Do not mix store/persistence work with animation or CSS polish in one task.

The working tree already contains substantial unrelated and unreleased changes.
Read `git status --short` and relevant diffs before editing. Preserve them. Do not
reset, clean, stash, regenerate unrelated files, or commit everything together.
Line numbers in this plan are orientation only: locate current symbols with
`graft` before opening source. Current source wins over stale documentation.

## 2. Fixed product decisions

These decisions are the implementation brief; the builder should not reopen them.

- Keep Automations inside Settings for this change.
- Keep the existing fonts, themes, tokens, icons, cards, controls, and window shell.
- Show configured automations on the overview. Put unconfigured types in Add automation.
- On-air, PC lock, and Presence are **singletons**. Do not create arrays of these
  rules, add duplicate instances, or invent user-defined names for them.
- Calendar supports multiple named rules. Show **one overview card per rule**.
- Calendar feeds are shared connections, managed separately from individual rules.
- Focus remains its existing dedicated experience. Provide an **Open Focus** link
  in a small related-tools section, not an enabled/disabled automation card.
- PC Sync remains in Sync. Retain it in priority management but not the type chooser.
- Creation uses steps; subsequent editing uses a single page with sections and
  explicit **Save changes / Cancel** controls.
- Preserve all existing capabilities, Pro restrictions, bridge ownership,
  restoration rules, calendar matching semantics, and phone detection semantics.
- No scheduling engine, generic IF/THEN builder, new Hue endpoints, new dependency,
  drag-to-arrange card system, or backend schema migration is part of this plan.
- No new raster assets are needed.

## 3. Current implementation and reuse map

| File / symbol                                                                                         | Current responsibility                                                            | Planned treatment                                                                 |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `src/features/settings-screen/tabs/AutomationsTab.tsx` / `AutomationsTab`, `AutomationSettingsEditor` | Loads stores; overview; on-air/away fields; extra presence/calendar/focus entries | Reduce to orchestration; extract existing fields instead of duplicating them      |
| `src/features/automations/model.ts`                                                                   | Singleton settings, resource IDs, runtime status, priority                        | Preserve transport types; put UI-only types in a separate file                    |
| `src/features/automations/store.ts` / `saveAutomationSettings`                                        | Queued optimistic saving and rollback                                             | Add a reliable per-save success result without removing queue/revision protection |
| `src/features/automations/useOpenAutomation.ts`                                                       | Existing detail search state, labels, navigation variants                         | Preserve legacy detail URLs; adapt navigation deliberately                        |
| `src/features/automations/useAutomationPreview.ts`                                                    | Queued preview with renewal and cleanup                                           | Reuse with draft settings; never persist a draft to make preview work             |
| `src/features/automations/useLightGroups.ts`                                                          | Light/room/zone and scene options                                                 | Reuse as the resource source                                                      |
| `src/features/automations/presence.ts`                                                                | Presence store, save, scan, probe, test                                           | Keep commands; inject draft callbacks into UI fields                              |
| `src/features/automations/calendar.ts`                                                                | Calendar store, feeds, rule factory, matches, preview                             | Keep rule/feed semantics; use `newCalendarRule` once per creation session         |
| `src/features/settings-screen/components/PresenceEditor.tsx`                                          | Phone management and arrival/departure configuration                              | Extract reusable draft-controlled sections                                        |
| `src/features/settings-screen/components/CalendarEditor.tsx`                                          | Feed list and rule form                                                           | Separate connections UI from reusable rule fields                                 |
| `src/features/settings-screen/components/AutomationPriority.tsx`                                      | Global source ordering                                                            | Reuse behind Manage priority; retain all six sources                              |
| `src/features/settings-screen/components/WidgetWizard.tsx`                                            | Existing wizard presentation and controls                                         | Reference its shell/footer conventions; do not copy widget business logic         |
| `src/features/settings-screen/SettingsScreen.tsx`                                                     | Settings title, back button, scroll ownership                                     | Keep overview/detail headings synchronized                                        |
| `src/router.tsx`, `src/routes/RootLayout.tsx`, `src/components/AppHeader.tsx`                         | Routes and global navigation                                                      | Add wizard integration and correct back behavior                                  |
| `src/features/dev-gallery/AutomationsDemo.tsx`, `CalendarDemo.tsx`, `PresenceDemo.tsx`                | Browser-safe examples                                                             | Extend to exercise the actual new components through fake adapters                |
| `tests/automations-store.test.ts`                                                                     | Existing save queue regression tests                                              | Extend for save outcomes; keep existing regression coverage                       |

Important source findings:

1. Routing currently uses **hash history**, despite older AGENTS prose mentioning
   memory history. Follow `src/router.tsx`.
2. `saveAutomationSettings` currently catches errors and resolves `Promise<void>`.
   Awaiting it does **not** prove a save succeeded.
3. `savePresence` and `saveCalendar` return booleans; current editors call them
   directly for many changes. Wrapping those editors in a wizard is insufficient:
   fields must become draft-controlled first.
4. `addCalendarFeed` persists a connection immediately and stores its URL through
   the existing backend/keyring path. It is not a draft-only operation.
5. Runtime status does not expose a general `pausedFor` field for every automation.
   Do not fabricate ownership/conflict explanations from the priority list.

## 4. Overview specification

Header: **Automations**. Description: **Let your lights respond to your day.**
Primary action: **Add automation**.

Use a single-column list of compact cards in the Settings content width. Each card
contains an icon or existing compact outcome swatch, title, readable summary,
status text, a real Switch for enablement, and an Edit affordance. Keep the switch
and edit control separate accessible targets; do not nest them inside one button.
Allow descriptions to wrap rather than truncating the essential action.

Example on-air summary:
**When my microphone or camera is in use, Office light 1 turns red at 80%.**
Below: **Enabled · Waiting for microphone or camera use**.
Do not promise that every microphone use is a call.

Calendar cards use the rule's existing name. Singletons retain their standard names.
Display order: On-air, PC lock, Presence, then calendar rules in their saved order.
Display order is not global execution priority; no card reordering in this release.

Below the list, provide secondary actions:

- **Manage calendars** — shared feeds, errors, refresh, add/remove.
- **Manage priority** — existing global ordering in a separate detail surface.
- **Open Focus** — existing `/focus` route.

Empty state: **Make your lights respond automatically.**
Supporting text: **Choose what happens during calls, when you lock your PC, when
you leave home, or around calendar events.** Primary action: **Add automation**.
Do not show disabled cards for every unused type.

Loading must not flash the empty state. A failure to load Presence or Calendar
must not hide successfully loaded on-air/PC-lock entries. Show a scoped error and
retry action, not an empty-state assumption.

### What counts as configured

Do not add a persisted `configured` flag or a parallel localStorage registry.
Derive visibility from existing data, independently of current validity:

- On-air/PC lock: enabled, bridgeId present, a legacy `target`, nonempty `targets`,
  or a scene reference means configured.
- Presence: enabled, bridgeId present, any saved device, arrival scene, or any
  departure target means configured.
- Calendar: every saved rule is configured, including disabled or invalid rules.
- Connected feeds without rules are shown through Manage calendars and a small
  “Calendar connected — add a rule” prompt, not as an invented automation.

Missing/deleted resources and configurations belonging to another bridge must
remain visible and repairable. Never hide a broken saved automation because its
references no longer resolve. Partially configured legacy entries can show
**Finish setup**. Entirely default untouched singletons stay in the chooser.

### Status and enablement

Keep configuration validity, enabled preference, and live activity separate.
Pure presentation helpers should consume real settings/status inputs.

| Condition                                          | Presentation / action                                           |
| -------------------------------------------------- | --------------------------------------------------------------- |
| Resource data still loading                        | Checking lights; no false missing-resource error                |
| Missing required configuration or deleted resource | Needs setup / Needs attention; explain missing item; Edit works |
| Bound to another bridge                            | Set up on another bridge; do not silently rebind                |
| Disabled and valid                                 | Off; switch can enable if entitled                              |
| Enabled but Pro unavailable                        | Requires Mote Pro; do not silently overwrite saved preference   |
| Enabled with reported runtime error                | Needs attention; show sanitized existing error text             |
| Enabled and real active signal                     | On air now / rule active / existing truthful activity text      |
| Enabled and inactive                               | Waiting for the corresponding trigger                           |
| Status unavailable                                 | Status unavailable; never claim Running                         |

Turning an enabled automation off must remain possible when it is invalid or
entitlements have changed. A failing switch write rolls back and reports failure.
Presence occupancy is Home/Away/Unknown, not proof that a lighting action is
currently running. Calendar active-match information is not proof that it owns
every target light. Use existing truthful wording.

General “Paused by another automation” status is deferred until the backend
provides authoritative ownership data. Preserve the existing PC Sync notice.

## 5. Creation flows

Add automation opens a dedicated wizard route, with the type chooser as its first
view. Four choices, each with icon, title, one sentence, and a concrete example:

| Type               | Description                                                               | If already configured        |
| ------------------ | ------------------------------------------------------------------------- | ---------------------------- |
| On-air light       | Change lights while your microphone or camera is in use                   | Edit existing / Finish setup |
| When this PC locks | Turn lights off, dim them, or use a scene when you lock this PC           | Edit existing / Finish setup |
| Presence           | Turn lights off when everyone leaves and set a scene when someone returns | Edit existing / Finish setup |
| Calendar event     | Change lights around selected calendar events                             | Always allows another rule   |

Do not put arbitrary numeric steps in the type chooser. After choosing a type,
show named progress, Back, Continue, and Cancel. Reuse the existing shell pattern.
Keep a concise draft summary visible without a large decorative outcome panel.

### On-air: three steps

1. **When**: microphone or camera (default), microphone only, camera only.
   App exceptions remain a collapsed optional section. Preserve saved app IDs.
2. **Lights & look**: choose direct targets or a scene. For direct targets show
   color/white and brightness; for scene mode use the existing scene picker.
   Preview is here and off by default.
3. **Review**: trigger, selected resources/action, exceptions if any, and
   “Lights return to their previous state when microphone/camera use ends.”
   Edit links jump back to their section without losing other fields.

### PC lock: two steps

1. **Lights & action**: targets/action or scene; “Also when this PC sleeps”; restore
   on return. Preserve current defaults. Keep return behavior in a clearly labeled
   subsection, including the existing caveat about lights changed while away.
2. **Review**: lock/sleep trigger, action, and return behavior. Do not create a
   separate trigger step containing one obvious option.

### Presence: three steps

1. **Phones**: reuse discovery and manual entry. Phone additions/removals and
   enabled flags change only the draft. Scan/probe commands may run explicitly.
2. **Leaving & returning**: departure targets and optional arrival scene. At least
   one action and one enabled phone are required. Keep the current ten-minute
   departure and arrival detection semantics; do not add new timing controls.
3. **Review**: phones, actions, detection delay, and the existing requirement that
   Mote remains running. Do not change Windows startup/tray preferences silently.

Presence “Try it” has existing command-specific semantics. Label it as a real
light change. Do not claim it automatically restores like leased on-air preview.

### Calendar event: three steps

1. **Events**: select connected feeds (empty `feedIds` continues to mean all
   calendars), name the rule, and choose matching conditions. Use existing
   defaults and event-match results. Put exclusions/all-day options under More
   options if needed. If there are no feeds, show the existing add-feed form first.
2. **Lights & timing**: existing look/targets/scene, lead/trail minutes, restoration,
   and explicit preview. Do not reinterpret existing all-day or matching behavior.
3. **Review**: which events, action, timing, restoration, and available next-match
   information. No matches is informational, not automatically invalid.

Connecting a feed is an explicit separate operation: button **Connect calendar**,
success copy **Calendar connected. It stays connected if you cancel this rule.**
Cancel never auto-deletes a shared connection. Manage calendars permits deliberate
removal using existing behavior. Clear raw URL form state after success and on
exit; do not place it in route state, logs, browser storage, fixtures, or summaries.

### Completion

- For Pro users: primary **Create & enable**, secondary **Save disabled**.
- For Free users: primary **Save automation** (disabled), with existing Pro setup
  messaging and upgrade action. Never attempt prohibited enable/preview commands.
- Validity is checked before saving, including current bridge/resources and
  entitlements. Show errors at their section and focus the first invalid field.
- Await an explicit successful save result before navigating or showing success.
- While saving: show Saving…, prevent duplicate submissions and edits.
- Failure: stay on review with all draft values, an error, and a working retry.
- Success: return to overview, focus the saved card, and announce success once.

## 6. Draft, preview, and persistence contract

Use component/session state for unsaved drafts. Do not autosave field changes.
Initialize a draft once from saved settings or the existing default factory.
Live status events may update status display but must not reset the draft.

Suggested UI-only discriminated union in `src/features/automations/editor-model.ts`:

```ts
type AutomationDraft =
  | { kind: "onAir"; value: OnAirSettings }
  | { kind: "away"; value: AwaySettings }
  | { kind: "presence"; value: PresenceSettings }
  | { kind: "calendar"; value: CalendarRule };
```

Track mode (`create`/`edit`), initial snapshot, current draft, step, dirty state,
pending save, and error. Use an explicit type switch; do not build a generic
schema-driven form engine. Validation and summary helpers are pure functions.

At final save, merge only the edited entity into the **latest** saved settings:

- Singleton: replace `current.onAir` or `current.away`, preserving the other and
  `current.priority`.
- Presence: save its own settings through the existing command.
- Calendar: replace/append the matching rule, preserving feeds, unrelated rules,
  and their order. Never append an edited rule that was removed externally.
- Detect changes to the same entity since the initial snapshot. Show “This
  automation changed while you were editing” with Reload saved / Keep editing;
  require an explicit resolution before overwriting. Unrelated changes merge.
- Switching the active bridge during editing stops preview and blocks save until
  the draft's bridge is reconciled through existing selection behavior.

Adapt `saveAutomationSettings` to return a result usable by the caller, e.g.
`Promise<boolean>`. Preserve serialized writes, confirmed snapshots, revision
checks, error toasts, and queue recovery after failures. Audit existing callers
and update the existing tests. A missing loaded store must report failure, not
success. Do not infer success by checking optimistic state.

Do not broaden Presence/Calendar store refactoring without evidence it is needed.
Avoid overlapping writes within the new forms and controls; disable the affected
actions while pending. If concurrency needs correction, do it in a separate
state-only task with a regression test.

Preview consumes the draft through existing hooks/commands, never saved settings
mutated for convenience. For singleton preview, construct a settings snapshot
with only that draft substituted. Stop preview on Back out of the appearance
step, type change, Cancel, save, route exit, entitlement loss, and bridge change.
Keep current lease renewal/cleanup safeguards; do not implement a second timer.

Dirty Cancel/route exit: existing AlertDialog pattern, **Discard changes?** with
Keep editing / Discard. Clean exit needs no dialog. Step Back retains the draft.
Discard stops preview and does not write settings. Connected calendar feeds are
the explicitly disclosed exception above.

## 7. Navigation and editing contract

Add `/settings/automation-wizard` alongside the existing widget wizard route.
Keep its session/draft mounted while steps change; do not use step as a React key.
Type and step can be session-local; sensitive draft content must never enter URL
parameters. Browser/mouse Back within the wizard must follow the same back action
as the visible Back button, preserving the draft, with dirty-exit protection at
the first view. Use the installed router's supported history/blocking facilities;
verify the actual API in installed source rather than guessing a hook signature.

Preserve `/settings?tab=automations&automation=onAir|away|presence|calendar`.
Singleton URLs open direct edit or Finish setup. The legacy Calendar URL opens
calendar management. Add a validated optional rule ID for direct calendar editing;
unknown/deleted IDs show a recovery action to the overview, not a blank form.
Priority and calendar management must have proper Back targets.

Avoid growing the module-level `pushedEntry` boolean into a multi-step navigation
system. Centralize the new session/back logic and check header Back, footer Back,
Cancel, mouse Back, Forward, deep links, and reload explicitly.

Direct editing presents all relevant sections on one page. Use the same field
components and validators as creation. Save changes preserves the existing
enabled value; it must not implicitly enable a disabled automation. Unsaved
changes are isolated and cancelable. Enabled behavior continues using the last
saved configuration until a successful save, except explicit preview.

Do not add singleton Delete/Remove until a separate reset/persistence contract is
defined. Users can disable them. Preserve existing calendar rule deletion and
feed/phone management capabilities, including their confirmation behavior.

## 8. Component boundaries and layout

Proposed new modules; names may be adjusted to nearby conventions, responsibilities
must remain separated:

- `features/automations/editor-model.ts`: UI session types.
- `features/automations/presentation.ts`: configured visibility, status, summaries.
- `features/automations/validation.ts`: per-type and per-step validation.
- `features/automations/useAutomationDraft.ts`: session lifecycle and dirty checks.
- `features/settings-screen/components/automations/AutomationOverview.tsx`.
- `…/AutomationCard.tsx`, `…/AutomationTypePicker.tsx`, `…/AutomationWizard.tsx`.
- `…/AutomationReview.tsx`, `…/AutomationEditPage.tsx`.
- `…/OnAirFields.tsx`, `…/PcLockFields.tsx`, `…/PresenceFields.tsx`,
  `…/CalendarRuleFields.tsx`: controlled sections reused by wizard and editor.
- `src/routes/AutomationWizardRoute.tsx`: route/session composition.

Presentational components receive data and callbacks. Keep backend invocations in
existing adapters or the composition layer, not scattered through field renderers.
Prefer extracting existing light/scene pickers over building new selectors.

Layout: one main content column, compact heading and progress, fields immediately
below, and a footer that stays reachable. Use a flex layout with a bounded
ScrollArea for content if necessary and a non-overlapping footer. Do not introduce
nested fixed-height scrolling panels like the gallery wrapper into production.
At narrow widths stack footer buttons and allow summaries to wrap. No horizontal
scroll. Use existing Tailwind tokens and `src/App.css` only if global styling is
actually needed. Keep current reduced-motion behavior; do not add animation work
until the functional gates pass.

Accessibility: semantic headings, labeled fields, real switches, visible focus,
textual states in addition to color, accessible error associations, focus on the
new step heading, and focus returned to the relevant overview control on exit.
Provide keyboard-operable priority reordering; reuse existing support if present,
otherwise add explicit Move up/Move down controls with boundary disabling.

## 9. Sequential execution phases

### Phase 0 — baseline and inventory (read-only)

Read AGENTS, this plan, relevant existing diffs and the Graft nodes for the files
in section 3. Record current typecheck and targeted test results. Confirm the
current field inventory, including restore, scene, app exceptions, calendar
filters/timing, and phone actions. Record existing failures separately.

Gate: a short implementation checklist with actual current symbols and baseline
failures. No code edits or broad source rereads.

### Phase 1 — state contracts only

Implement UI-only draft/validation/presentation helpers, per-save success results,
entity merge rules, and dirty/conflict handling. Keep current UI intact. Add
meaningful tests for these behavior contracts and queued save failures.

Gate: passing targeted tests and typecheck; no CSS, animation, Rust, or schema work.

### Phase 2 — extract reusable controlled fields

Extract on-air/PC-lock sections and the relevant Presence/Calendar form sections.
Use adapters to keep current screens functional while enabling draft-only use.
Preserve every existing field and helper behavior. Separate feed management from
calendar rule fields. Update demos to pass callbacks without invoking Tauri.

Gate: old flows still work; changing a draft field causes zero persistence calls.
Existing preview cleanup remains working. No new wizard routing yet.

### Phase 3 — overview and type chooser

Build configured cards, empty/loading/partial-error states, Add automation,
singleton Edit existing routing, per-calendar-rule cards, and secondary links.
Move priority out of the default overview. Preserve access to all old editors.

Gate: disabled/missing-resource/other-bridge saved entries remain visible; unused
singletons do not appear as configured; controls work by keyboard. This phase is
an intermediate milestone, not the completed feature.

### Phase 4 — on-air and PC-lock creation/editing

Add wizard route/session and the specified 3-step/2-step flows. Integrate isolated
drafts, review, validation, save results, preview, direct editing, and navigation.
Reuse widget shell conventions. Do not implement Presence/Calendar with placeholder
steps; continue routing those types to existing editors until their phase lands.

Gate: Cancel leaves saved settings unchanged; failed save stays on review; success
creates a real configured card; editing disabled settings does not enable them.
Header, mouse, and footer Back behave consistently without losing entered values.

### Phase 5 — Presence guided creation/editing

Wire controlled phone/action fields to the 3-step flow. Reuse scan/probe commands,
delay semantics, restore behavior, and explicit Try it. Keep scan results distinct
from saved devices. Save the entire Presence draft only at completion.

Gate: canceling newly selected phones does not persist them; no action or no enabled
phone cannot enable; failed save preserves the draft; existing devices are retained.

### Phase 6 — Calendar rules and connection management

Implement rule cards, 3-step creation, direct editing, and shared-feed management.
Disclose connection persistence before/after the explicit Connect action. Preserve
all-calendar semantics, rule IDs/order, matching previews, timing and deletion.

Gate: two calendar rules can be created/edited independently; canceled rules are
not persisted; connected feeds survive cancel with truthful UI; secret URLs never
appear in route/localStorage/logs; unrelated rule/feed changes are not overwritten.

### Phase 7 — integration and polish only

Finish small layout/status/copy adjustments, focus management, reduced motion,
keyboard priority controls, and real empty/error demos. Remove only superseded
UI paths once all new flows pass. Update relevant plan status notes accurately.
Do not modify core runtime or IPC behavior in this phase.

Gate: validation matrix below complete, production build passes or pre-existing
blockers are explicitly identified. Refresh Graft after the code refactor.

## 10. Verification matrix

Use existing Bun test conventions. Add behavior tests where a failure could lose
data or misrepresent enablement; do not snapshot every class name or test simple
markup duplication.

| Area          | Required checks                                                                                                                                                |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visibility    | Fresh defaults, legacy single target, disabled configured singleton, missing scene/light, other bridge, partial Presence setup, feeds without rules            |
| Drafts        | Step back retains values; Cancel writes nothing; live status does not reset form; same-entity conflict detected; unrelated settings preserved                  |
| Saves         | Success, rejection, retry, duplicate click, missing store, queued earlier failure followed by success, newer edits protected from stale response               |
| Validation    | No target, valid scene, deleted resource, bridge change, no enabled phone, no Presence action, unavailable feed, empty all-feed semantics                      |
| Entitlements  | Free can save disabled; cannot enable/preview; Pro loss during setup; enabled automation can still be turned off                                               |
| Preview       | Off initially; uses draft; cleanup on step/route/cancel/save/bridge changes; errors visible; real Presence test described accurately                           |
| Calendar      | New stable ID; edit existing ID; preserve feeds and rule order; no matching events; rule removed elsewhere; connected feed survives canceled rule              |
| Navigation    | Header/footer/mouse Back, Forward, dirty exit, deep links, missing rule ID, reload without draft, Focus return path                                            |
| UI            | Empty, one card, several calendar cards, long names, resource errors, light/dark, narrow/minimum supported desktop size, ordinary desktop size, reduced motion |
| Accessibility | Keyboard-only creation/edit/save/cancel, field labels/errors, focus restoration, switch vs edit target, status text, priority ordering                         |

Run `bun run typecheck` and the relevant new/existing test files after each logical
phase. Final checks: `bun run build`, targeted lint/format checks, and relevant
automation tests. Broaden only if failures or changes justify it. No standalone
Cargo commands are required for this frontend plan.

Browser gallery verification is necessary but not sufficient: it has example data
and cannot prove bridge writes, keyring behavior, OS microphone/lock detection, or
real preview restoration. In Tauri, validate saving/reopening, toggle rollback,
one explicit preview/stop, and normal automation behavior with appropriate test
lights. Record checks that cannot run; never call a mocked preview a hardware test.

Use one batched visual review, fix identified issues together, and one confirmation
pass. Avoid endless polish iterations. If using Impeccable during implementation,
run its required detector after UI work, not during this planning task.

## 11. Done means

- All four types have working creation, cancellation, validation, and completion.
- Existing configurations survive and remain editable, including broken entries.
- Overview describes actual saved automations and truthful state.
- Priority is available without dominating first-time setup.
- Editing does not require replaying a wizard.
- No new backend schema, runtime, Hue transport, or secret storage behavior.
- No production mock data or browser-only success paths.
- Required checks and evidence limitations are reported.
- Relevant documentation reflects the final implemented behavior, not ambitions.

## 12. Copy/paste prompt for the implementing model

> Read AGENTS.md and docs/automations-ux-implementation-plan.md. Implement Phase N
> only, including its acceptance gate. First inspect current git status and relevant
> diffs; preserve unrelated work. Use Graft before searching source. Follow the
> fixed decisions, existing data contracts, and draft/persistence rules in the plan.
> Do not expand scope, introduce new dependencies, rewrite the automation runtime,
> or combine state work with UI polish. Run the checks appropriate to this phase.
> Report changed files, checks performed, and the exact remaining blockers. Do not
> claim the overall feature is complete while later phases remain.

Replace N with the next incomplete phase. Carry forward a short completed-phase
ledger; re-read current source where it changed rather than trusting old line spans.
