# Free, Pro, and Household feature matrix

Status: **entitlement implemented and enforced; a 14-day Pro trial ships in
0.3.0**.

Last reviewed: **2026-09-18**.

As of 2026-09-11 the entitlement service is registered as Tauri state, release
builds read the Store licence through a cached provider, and purchase and
restore are wired. Every capability in the table below is now enforced.

Global keyboard shortcuts were added to this matrix on 2026-09-11. They had
shipped without a tier at all — absent here, from `v1-feature-inventory.md`, and
from the Store listing copy — so nothing decided whether they were free. They
are Pro.

Automations were added on 2026-09-15 under `local_automation`, the capability
this document had already reserved for local automation: an on-air light while
an app uses the microphone or camera, and lights that change when the PC locks
or sleeps. Setting one up is free; starting one is gated in the Rust runtime,
and whatever an automation already changed is always put back.

Focus sessions, presence, and calendar rules were built on 2026-09-19 under
the same `local_automation` capability, as the future table below had planned,
together with the priority order that decides shared lights. Rituals, phones,
calendars, and rules can be set up on Free, as other automations can; starting a
session, running a presence action, and a calendar rule taking lights are
gated in Rust. The priority order itself is not a paid setting.

Desktop widgets were narrowed on 2026-09-18, by the owner's decision: Free is
now one widget with one room, zone, or light, at the standard size, corners,
and system theme. Until then Free had no limit on how many widgets could exist and only
the composition of each was paid. More widgets, more controls, and every
appearance and window option are Pro.

**No grandfathering.** The owner confirmed on 2026-09-11, and again on
2026-09-14, that nobody has downloaded the app yet, so there is no installed
base to protect and enforcement takes nothing away from anyone. From 0.3.0 each
installation does record a first-seen date — the start of its trial — so this
can be revisited with real data later.

## Pro trial

Decided 2026-09-14: a reverse trial, rather than freemium alone or a paid app
with a Store trial. Every installation gets every Pro capability for 14 days,
then falls back to Free unless Pro was bought.

- **Starts** when the installation first has a saved Hue Bridge: at pairing, or
  at launch for an installation that was already paired. An installation that
  never pairs never starts a trial.
- **Stored** by `src-tauri/src/services/trial.rs`: the start date and the last
  time Mote ran, in the app config folder (`pro-trial.json`) and in the Windows
  credential store (`com.motedesktop.mote` / `mote-pro-trial`). The earlier
  start and the later sighting win. Credentials survive uninstall, so
  reinstalling does not restart the trial. Nothing leaves the PC and there is no
  server check.
- **Per installation**, which on Windows means per PC and user. Deliberately
  simple: deleting both copies by hand resets it, and on 2026-09-14 that was
  judged not worth a server. Revisit if installs are healthy but purchases lag,
  or if reset instructions start circulating.
- **Clock:** measured from the later of the clock and the last sighting, so
  winding the clock back buys nothing.
- **Authorization:** a running trial satisfies any Pro capability in
  `EntitlementRuntime::authorize`. `pro` in the IPC status stays the purchase
  alone; the trial is reported beside it, so the interface can tell them apart.
- **Debug builds** never read or write the stored trial, because they share the
  credential store with an installed Store copy. The title-bar badge steps
  through Free, trial, trial ending, trial ended, and Pro in memory.
- **Ending:** a watcher notices the end while Mote is running and emits
  `entitlements-changed`. The app reminds at three days and one day left, and
  opens the purchase dialog once after the trial has ended.

### When Pro lapses

Applies when the Store authoritatively says Pro is not owned and no trial is
running — never on `unknown`. Nothing saved is changed, so buying or restoring
Pro brings everything back as it was.

- Only the first saved widget runs. Any others leave the desktop, show as
  "Needs Pro" in Settings, and come back as they were when Pro does. The one
  that runs shows its first control with its first target, at the system theme,
  standard size, and rounded corners, and is neither pinned nor always on top. Saving a widget's
  settings enforces the Free composition and appearance in `set-widget-config`
  as well as `set-widget-controls`.
- A saved custom dashboard layout stays saved; Home shows rooms-first grouping.
- Switching to another saved bridge requires `multiple_bridges`; removing one
  never does.
- Global shortcuts refuse at execution, as before.
- A PC Sync session already running is left to finish; starting the next one
  requires `pc_sync`.
- An automation's look already showing is still put back when it ends; a
  running focus session finishes; starting the next session, presence action,
  or calendar rule requires `local_automation`.

This document defines the initial product boundary for functionality that exists
today and establishes rules for future paid features. Store-specific product IDs
and APIs must map into the provider-neutral capabilities defined here.

## Product promise

- **Free** is a useful, account-optional local Hue controller.
- **Pro** is a one-time purchase for advanced local desktop functionality and
  personal cloud features.
- **Household** is a later subscription for shared and continuously hosted
  functionality.
- A verified Pro purchase can be linked to a Mote account and used on supported
  Windows, macOS, and iOS versions without requiring a second equivalent Pro
  purchase.
- Security, accessibility, account deletion, credential removal, and recovery
  controls are never paywalled.

## Current functionality

| Product area                    | Free                                                                                                                    | Pro                                                                                                                                           | Capability                |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Bridge setup                    | Discover, pair, restore, rename, remove, and recover one saved Hue Bridge                                               | Save and switch among multiple bridges                                                                                                        | `multiple_bridges`        |
| Home dashboard                  | View and control resources; choose standard grouping modes                                                              | Reorder cards and edit/persist a custom dashboard layout                                                                                      | `dashboard_custom_layout` |
| Lights, rooms, and zones        | Power, brightness, color, color temperature, membership, placement, naming, and live updates                            | No current control is reserved for Pro                                                                                                        | —                         |
| Scenes                          | View, activate, create, edit, delete, and run supported dynamic scenes                                                  | No current scene control is reserved for Pro                                                                                                  | —                         |
| Devices                         | Inspect, discover, configure, assign, rename, and remove supported Hue resources                                        | No current device-administration control is reserved for Pro                                                                                  | —                         |
| Entertainment areas             | Create, position, test, edit, and delete areas                                                                          | Using an area for PC Sync requires Pro                                                                                                        | `pc_sync`                 |
| PC Sync                         | Explain requirements and show the upgrade entry point                                                                   | Video, Games, and Music modes; display/audio selection; start, update, and stop streaming                                                     | `pc_sync`                 |
| Hue Play HDMI Sync Box          | One box: discovery, pairing, source, mode, intensity, brightness, sync, restore, and removal controls                 | A second box and switching between boxes (0.7.0); future workflows that combine several boxes, bridges, or automations may be Pro             | —                         |
| Desktop widgets                 | One widget with one single-target control, standard size and corners, system theme, and normal window behavior          | Any number of widgets; multiple controls or multi-target toggle groups; customize theme, size, corners, placement, pinning, and always-on-top | `advanced_widgets`        |
| Global keyboard shortcuts       | Explain the capability and show the upgrade entry point; shortcuts can be prepared but do not fire                      | System-wide hotkeys for lights, rooms, zones, and scenes, active whenever Mote runs, including from the tray                                  | `global_shortcuts`        |
| Automations                     | Explain the capability and show the upgrade entry point; automations can be set up but do not start; the priority order | On-air light; lights when the PC locks or sleeps; focus sessions; presence from phones on the home Wi-Fi; calendar rules                      | `local_automation`        |
| Appearance and desktop behavior | Light/dark/system theme, close behavior, tray behavior, start-on-login, window state, and navigation                    | No current essential application setting is reserved for Pro                                                                                  | —                         |
| About and support               | Version, legal/support links, privacy summary, release notes, diagnostics, purchase status, and restore-purchase action | No support or privacy control is reserved for Pro                                                                                             | —                         |

The first implementation should gate complete workflows, not scatter locks over
individual sliders. For example, the PC Sync entry point may explain and sell
Pro, but a user who starts an authorized session must not encounter additional
paywalls inside that session.

For widgets, Free is one widget holding one single-target control. A room,
zone, or light counts as one target. The backend—not only the interface—enforces
all of it under `advanced_widgets`: creating a second widget, adding a second
control or a multi-target toggle group, choosing a theme other than system, a
size other than standard, or corners other than rounded, placing the widget
from Settings, pinning it, and keeping it on top. Corners are a fixed set of
four styles — square, soft, rounded, round — never a free value. Dragging the window, resizing it, and resetting its position
stay free as ordinary window behavior and recovery.

## Production enforcement phase

The original gate on this phase — do not begin until the commerce spike has
proven purchase, restore, cached offline licensing and refund behaviour — was
written to protect an installed base. There is none: nobody has downloaded the
app. The remaining risk is therefore shipping a build that refuses a capability
somebody paid for, which is why the cached provider never downgrades on a failed
read, and why the interface separates "you do not own this" from "we could not
check".

**Release ordering, which matters more than the steps below.** A build carrying
enforcement must not reach the Store before the `mote-pro` add-on is published.
Gated capabilities refuse until a Store licence says otherwise, and an
unpublished add-on cannot be bought, so shipping in the wrong order hands every
new customer an app that refuses PC Sync and offers no way to fix it. The
listing update submitted on 2026-09-11 carries an unchanged package and is
therefore safe; the next package submission is the one to hold.

**Status, 2026-09-13.** The ordering held. The add-on was published and
confirmed live in the public catalog before 0.2.0.0, the first package carrying
enforcement, was submitted. That package is in certification and publishes
automatically when it passes.

1. **Done (2026-09-11).** Register the provider-neutral entitlement service as
   managed Tauri state and expose sanitized entitlement, purchase, and restore
   commands to React. Restore is the same read as refresh, so it needed no
   command of its own.
2. **Done (2026-09-11).** The placeholder `widgets` capability is now
   `advanced_widgets`, and the Free composition limit is enforced in
   `set-widget-controls` after sanitizing, so the count reflects what would
   actually be stored. Pinning and always-on-top gate only when switching on;
   turning them off is always allowed, or a lapsed purchase would strand a
   widget pinned above everything forever. **Extended 2026-09-18:**
   `open-widget-window` refuses a second widget, reopening any widget but the
   first saved, and a new widget built past the Free composition or appearance
   (it had checked neither). `set-widget-config` also refuses a non-system theme,
   non-standard size, or non-rounded corners, and `set-widget-position` requires Pro;
   `reset-widget-position` does not.
3. **Done (2026-09-11).** `multiple_bridges` is enforced on pairing when a bridge
   is already saved. The check reads what is stored rather than the pairing
   itself, so a Free customer can always pair, re-pair, and recover their one
   bridge.
4. **Done (2026-09-11), and weaker than the rest by nature.** The custom layout
   lives in `localStorage` with no Tauri command behind it, so the check in the
   header is the whole gate rather than a convenience in front of a backend one.
   Hardening it would mean moving layout persistence into Rust; that is a poor
   trade for what it protects, which is one person's arrangement of cards on one
   machine. Recorded here so nobody later mistakes it for a backend gate.
5. **Done (2026-09-11), narrower than first written.** `pc_sync` is enforced
   before starting Video, Games and Music streams, and deliberately _not_ before
   the colour test. The table above lists testing an entertainment area as a Free
   action, and gating it would stop someone confirming their hardware works
   before being asked to pay. Status, requirements, purchase, restore, and safe
   stop remain available without Pro.
6. **Done (2026-09-11).** Refusals carry structured `AuthorizationError` JSON. A
   `pro_required` refusal opens the purchase dialog; `entitlement_unavailable`
   only shows copy telling the customer to retry, because offering to sell Pro
   to somebody who already paid is the worse mistake. The Free badge in the
   title bar carries a "Get Pro" action, and the Shortcuts tab says the same in
   place. Downgrade states were built with the trial on 2026-09-15; see
   [When Pro lapses](#when-pro-lapses).
7. **Not done.** Test every paid command directly so a modified frontend cannot
   bypass the tier boundary. The static half is audited — see the commerce spike
   — but reinstall, offline, refund and downgrade behaviour still need a packaged
   Store build.

## Future functionality

| Product area                                             | Tier                                   | Capability                |
| -------------------------------------------------------- | -------------------------------------- | ------------------------- |
| Combined multi-bridge dashboard and cross-bridge control | Pro                                    | `multi_bridge_control`    |
| Personal Hue cloud control                               | Pro                                    | `personal_remote_control` |
| Personal cloud settings sync                             | Pro while operating cost remains small | `personal_cloud_settings` |
| Shared homes, invitations, and roles                     | Household                              | `shared_homes`            |
| Shared settings and automations                          | Household                              | `shared_home_settings`    |
| Guest command relay using an owner's Hue credential      | Household                              | `shared_home_relay`       |

Future scope must be added here before implementation. A feature must not infer
its tier from a route name, platform, Store product ID, or UI location.

## Entitlement behavior

### Offline

- Free local control continues without an account or internet connection.
- Pro local capabilities accept a valid platform-cached license or a valid
  backend-issued cross-platform entitlement cached according to its signed
  validity period.
- Do not create an unlimited app-defined grace period around an unknown Store
  result. If a previously verified cache remains valid, use it; otherwise show a
  retryable **Unable to verify Pro** state without deleting configuration.
- Household relay and shared mutations require the backend. When offline, show
  cached shared-home data read-only where safe and explain that shared control
  requires a connection.

### Purchase, restore, and platform linking

- Windows purchases use the Microsoft Store adapter; macOS/iOS purchases use
  StoreKit.
- Purchase and restore refresh the provider-neutral entitlement snapshot before
  opening the paid workflow.
- Without a Mote account, a Store purchase applies through that platform's
  license and restoration rules.
- Cross-platform access requires signing into a Mote account and securely
  linking server-verified Store ownership. Never accept a client-supplied
  purchase flag or raw UI state as proof.
- Linking one purchase to several unrelated Mote accounts is prohibited. The
  account-transfer and family-use policy must be finalized before backend
  linking launches.

### Refund, revocation, and downgrade

- A refunded or revoked Pro purchase disables new Pro operations after the next
  authoritative entitlement refresh.
- Stop active PC Sync safely and close active widget windows when Pro becomes
  authoritatively inactive. Do not terminate an operation merely because a
  transient license check returns `unknown`.
- Preserve local widget definitions, dashboard layouts, and PC Sync preferences
  when Pro becomes inactive. Free mode uses the standard dashboard layout, and
  the preserved configuration becomes available again after a valid restore or
  repurchase.
- An expired or canceled Household subscription disables shared mutations and
  relay access. It must not delete a user's local Hue data immediately. Server
  retention, ownership transfer, export, and deletion periods must be decided
  before Household accepts payment.
- Free controls remain available after any downgrade.

## Grandfathering

Grandfathering means allowing an existing user to keep access under the terms
that applied before a tier or price changed.

Mote's initial rules are:

- Features publicly released as Free remain Free. Add new advanced extensions
  instead of moving essential shipped behavior behind Pro.
- A one-time Pro purchaser permanently retains the Pro capabilities included in
  the product when purchased for supported app versions, even if pricing or the
  contents offered to new purchasers change later.
- A later subscription must not remove capabilities already covered by a user's
  one-time Pro purchase.
- Household access lasts only while its subscription is active or in a declared
  provider grace period; it is not grandfathered after cancellation.
- Development builds, private previews, and unreleased repository functionality
  do not create a customer entitlement. The first public Store release defines
  the initial Free and Pro baseline.

Any exception requires an explicit migration plan, user communication, Store
listing updates, and tests before the tier change ships.

## Enforcement rules

- React presents upgrade, purchase, restore, offline, and locked states.
- Rust is the authorization boundary for local paid operations and returns a
  structured `pro_required`, `household_required`, or
  `entitlement_unavailable` result.
- The backend independently checks Household entitlements and membership roles
  for every shared or relayed operation.
- Store-specific identifiers live only in their commerce adapters.
- Locked and downgrade states never erase user configuration as a side effect.
- Development entitlement overrides must be impossible to enable in production
  builds.

## Release gates

- Microsoft package identity, purchase, restore, cached offline license,
  refund/revocation, and certification behavior pass in a minimal Tauri spike.
- StoreKit purchase, restore, current entitlement, refund/revocation, App
  Sandbox, screen capture, and audio feasibility pass before committing the Mac
  App Store build to the same Pro matrix.
- Every capability has Rust enforcement tests and frontend locked-state tests.
- Upgrade, downgrade, unknown-license, offline, refund, reinstall, and account
  linking scenarios pass without losing configuration or double charging.
- Store descriptions and purchase screens state the current tier contents and
  account requirement accurately.
