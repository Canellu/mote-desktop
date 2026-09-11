# Free, Pro, and Household feature matrix

Status: **initial product decision updated; entitlement implementation pending**.

Last reviewed: **2026-09-01**.

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

Do not begin this phase until the Microsoft Store commerce spike has proven
package identity, durable-add-on discovery, purchase, restore, cached offline
licensing, and refund/revocation behavior.

1. Register the provider-neutral entitlement service as managed Tauri state and
   expose sanitized entitlement, purchase, and restore commands to React.
2. Replace the placeholder `widgets` capability with `advanced_widgets` and
   enforce the Free widget limits in every Rust command that can create, reopen,
   or reconfigure widgets.
3. Enforce `multiple_bridges` when pairing or retaining more than one saved
   bridge. A downgrade keeps saved configuration but allows one selected Free
   bridge to remain active.
4. Enforce `dashboard_custom_layout` on entering layout-edit mode and on every
   persistence write. Free mode always renders a standard grouping layout.
5. Enforce `pc_sync` before starting Video, Games, Music, or color-test streams.
   Status, requirements, purchase, restore, and safe stop operations remain
   available without Pro.
6. Add the React locked, purchase, restore, unknown-license, upgrade, downgrade,
   and recovery states only after backend enforcement is complete.
7. Test every paid command directly so a modified frontend cannot bypass the
   tier boundary. Cover reinstall, offline, refund, downgrade, and preserved
   configuration behavior for every capability.

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
