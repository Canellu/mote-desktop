# Free, Pro, and Household feature matrix

Status: **entitlement implemented and partly enforced**.

Last reviewed: **2026-09-11**.

As of 2026-09-11 the entitlement service is registered as Tauri state, release
builds read the Store licence through a cached provider, and purchase and
restore are wired. Every capability in the table below is now enforced.

Global keyboard shortcuts were added to this matrix on 2026-09-11. They had
shipped without a tier at all — absent here, from `v1-feature-inventory.md`, and
from the Store listing copy — so nothing decided whether they were free. They
are Pro.

**No grandfathering.** The owner confirmed on 2026-09-11 that nobody has
downloaded the app yet, so there is no installed base to protect and enforcement
takes nothing away from anyone. This is the reason no first-seen timestamp is
recorded; if that ever stops being true, it cannot be reconstructed after the
fact, so revisit this before shipping enforcement to an installed base.

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

| Product area                    | Free                                                                                                                      | Pro                                                                                                                        | Capability                |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Bridge setup                    | Discover, pair, restore, rename, remove, and recover one saved Hue Bridge                                                 | Save and switch among multiple bridges                                                                                     | `multiple_bridges`        |
| Home dashboard                  | View and control resources; choose standard grouping modes                                                                | Reorder cards and edit/persist a custom dashboard layout                                                                   | `dashboard_custom_layout` |
| Lights, rooms, and zones        | Power, brightness, color, color temperature, membership, placement, naming, and live updates                              | No current control is reserved for Pro                                                                                     | —                         |
| Scenes                          | View, activate, create, edit, delete, and run supported dynamic scenes                                                    | No current scene control is reserved for Pro                                                                               | —                         |
| Devices                         | Inspect, discover, configure, assign, rename, and remove supported Hue resources                                          | No current device-administration control is reserved for Pro                                                               | —                         |
| Entertainment areas             | Create, position, test, edit, and delete areas                                                                            | Using an area for PC Sync requires Pro                                                                                     | `pc_sync`                 |
| PC Sync                         | Explain requirements and show the upgrade entry point                                                                     | Video, Games, and Music modes; display/audio selection; start, update, and stop streaming                                  | `pc_sync`                 |
| Hue Play HDMI Sync Box          | All current single-box discovery, pairing, source, mode, intensity, brightness, sync, restore, and removal controls       | Future workflows that combine several boxes, bridges, or automations may be Pro                                            | —                         |
| Desktop widgets                 | Create any number of widgets with one single-target control each, standard size, system theme, and normal window behavior | Add multiple controls or multi-target toggle groups; customize theme, size, placement, pinning, and always-on-top behavior | `advanced_widgets`        |
| Global keyboard shortcuts       | Explain the capability and show the upgrade entry point; shortcuts can be prepared but do not fire                        | System-wide hotkeys for lights, rooms, zones, and scenes, active whenever Mote runs, including from the tray               | `global_shortcuts`        |
| Appearance and desktop behavior | Light/dark/system theme, close behavior, tray behavior, start-on-login, window state, and navigation                      | No current essential application setting is reserved for Pro                                                               | —                         |
| About and support               | Version, legal/support links, privacy summary, release notes, diagnostics, purchase status, and restore-purchase action   | No support or privacy control is reserved for Pro                                                                          | —                         |

The first implementation should gate complete workflows, not scatter locks over
individual sliders. For example, the PC Sync entry point may explain and sell
Pro, but a user who starts an authorized session must not encounter additional
paywalls inside that session.

For widgets, the app does not limit how many widget windows can be created. The
backend—not only the interface—must enforce the Free control-composition limit:
one single-target control per widget. A room, zone, or light counts as one
target. Adding a second control, a multi-target toggle group, or advanced window
customization requires `advanced_widgets`.

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

1. **Done (2026-09-11).** Register the provider-neutral entitlement service as
   managed Tauri state and expose sanitized entitlement, purchase, and restore
   commands to React. Restore is the same read as refresh, so it needed no
   command of its own.
2. **Done (2026-09-11).** The placeholder `widgets` capability is now
   `advanced_widgets`, and the Free composition limit is enforced in
   `set-widget-controls` after sanitizing, so the count reflects what would
   actually be stored. Pinning and always-on-top gate only when switching on;
   turning them off is always allowed, or a lapsed purchase would strand a
   widget pinned above everything forever.
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
   place. Downgrade and recovery states are still not built.
7. **Not done.** Test every paid command directly so a modified frontend cannot
   bypass the tier boundary. The static half is audited — see the commerce spike
   — but reinstall, offline, refund and downgrade behaviour still need a packaged
   Store build.

## Future functionality

| Product area                                                                   | Tier                                   | Capability                |
| ------------------------------------------------------------------------------ | -------------------------------------- | ------------------------- |
| Combined multi-bridge dashboard and cross-bridge control                       | Pro                                    | `multi_bridge_control`    |
| Local automation runtime, calendar rules, Pomodoro rituals, and presence rules | Pro                                    | `local_automation`        |
| Personal Hue cloud control                                                     | Pro                                    | `personal_remote_control` |
| Personal cloud settings sync                                                   | Pro while operating cost remains small | `personal_cloud_settings` |
| Shared homes, invitations, and roles                                           | Household                              | `shared_homes`            |
| Shared settings and automations                                                | Household                              | `shared_home_settings`    |
| Guest command relay using an owner's Hue credential                            | Household                              | `shared_home_relay`       |

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
