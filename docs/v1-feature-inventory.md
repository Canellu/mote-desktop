# Mote Desktop v1 feature inventory

Status: **product surface frozen; Free/Pro enforcement pending commerce spike**.

Last reviewed: **2026-08-14**.

This document defines the user-visible scope of the first Microsoft Store
release. Inclusion here means the feature is allowed in the v1 release
candidate; it does not mean that release acceptance has passed. Any included
feature that cannot pass the validation in the Store release plan must be fixed
or removed before submission.

Availability within Free and Pro is defined separately in the
[Free, Pro, and Household feature matrix](./free-pro-feature-matrix.md).

## Included application surfaces

### Setup and bridge connection

- Discover Hue Bridges on the local network, including the documented discovery
  fallback.
- Pair by pressing the Hue Bridge link button.
- Restore saved bridge sessions on launch.
- Add, rename, switch between, and remove saved bridges.
- Show setup, disconnected, loading, empty, and recoverable error states.

### Home dashboard

- View Hue rooms, zones, lights, scenes, and their current state.
- Switch the dashboard between its supported grouping modes.
- Reorder and customize the locally persisted dashboard layout.
- Control all lights and open individual room or zone views.
- Open PC Sync and Sync Box entry points.

### Room and zone control

- View and control a room or zone and its member lights.
- Control power, brightness, color, and color temperature where supported by the
  selected lights.
- Apply, create, edit, and delete scenes where supported.
- Start dynamic scenes where the bridge and scene support them.
- Rename rooms, zones, lights, and scenes where exposed by the UI.
- Edit room or zone membership and light placement.
- Reflect Hue event-stream updates and recover after stream interruption.

### Devices, spaces, scenes, and entertainment setup

- View Hue devices, services, connectivity, and bridge resource details.
- Search for supported Hue devices using the discovery methods exposed by the
  connected bridge.
- Assign discovered devices to a room and zones.
- Create, rename, edit, and delete rooms and zones.
- Create and manage room and zone scenes.
- Create, edit, position, test, and delete Hue entertainment areas.

### PC Sync

- Select a Hue entertainment area and configure host-driven synchronization.
- Run Video, Games, and Music synchronization modes.
- Select supported displays and system-audio loopback devices.
- Configure the PC Sync options currently exposed by the UI.
- Start, update, and stop an entertainment stream, including cleanup when the
  active bridge changes or the app exits.

PC Sync ships only for the tested Windows configurations and compatible Hue
entertainment hardware. Exact hardware, HDR, capture, and audio limitations
belong in the v1 known-limitations document and Store listing.

### Hue Play HDMI Sync Box

- Discover and pair one Hue Play HDMI Sync Box.
- Restore or remove its locally saved session.
- View connection and execution state.
- Select inputs and modes, start or stop synchronization, and adjust the
  controls exposed by the Sync Box screen.

The first release includes the current single-Sync-Box behavior only.
Per-bridge or multiple-Sync-Box association is not part of v1.

### Desktop widgets

- Create and manage desktop widget windows: one on Free, any number with Pro.
- Choose widget targets and controls.
- Open, close, remove, pin, position, resize, and set always-on-top behavior.
- Persist supported widget configuration and window placement locally.

### Application and Windows behavior

- Light, dark, and system themes.
- Configurable close behavior: quit or minimize to the system tray.
- Start-on-login where supported.
- Custom Windows title bar, window state, tray behavior, and desktop navigation.
- Local persistence for app preferences, dashboard layout, and Hue metadata;
  credentials remain in the operating-system keychain.

### Release-information surface

The following is included in v1 scope and implemented in Settings:

- Settings entry points for About, Support, Privacy, and Terms/license.
- Installed application version and a stable release-notes link.
- A clear unofficial-product and compatible-Hue-hardware notice.
- A privacy/data summary and sanitized diagnostic information suitable for
  support.

## Current Settings inventory

| Group       | Tab                 | v1 purpose                                                        |
| ----------- | ------------------- | ----------------------------------------------------------------- |
| App         | General             | Theme, close behavior, and start-on-login                         |
| App         | Widgets             | Create and manage desktop widgets                                 |
| Your Home   | Rooms & Zones       | Create and manage spaces and membership                           |
| Your Home   | Entertainment Areas | Create, position, test, and manage entertainment areas            |
| Your Home   | Devices             | Inspect and discover Hue devices and configure supported controls |
| Your Home   | Scenes              | Create and manage room and zone scenes                            |
| Connections | Bridge              | Manage saved Hue Bridges and connection details                   |
| Connections | PC Sync             | Configure and enter host-driven entertainment sync                |
| Connections | Sync Box            | Pair and manage the Hue Play HDMI Sync Box                        |
| App         | About & Support     | Version, support, privacy, legal, and sanitized diagnostics       |

## Route inventory

| Route                                       | Purpose                                     |
| ------------------------------------------- | ------------------------------------------- |
| `/`                                         | Home dashboard                              |
| `/space/$spaceId`                           | Room or zone controls and inspector         |
| `/settings`                                 | All Settings tabs                           |
| `/settings/device-discovery`                | Hue device discovery flow                   |
| `/settings/widget-wizard`                   | Widget creation and editing flow            |
| `/settings/spaces-wizard`                   | Room and zone creation flow                 |
| `/settings/entertainment-wizard`            | Entertainment-area creation flow            |
| `/settings/entertainment-placement/$areaId` | Entertainment light placement and test flow |
| `/sync`                                     | PC Sync and Sync Box hub/setup              |
| `/sync/$areaId`                             | PC Sync control for an entertainment area   |

Routes are internal desktop-webview navigation and are not public web URLs.

## Explicitly excluded from v1

- Hue cloud control and OAuth.
- Mote accounts, shared homes, membership, roles, and guest relay.
- Household subscriptions, shared entitlements, and unreviewed third-party
  commerce. The Store-managed Mote Pro add-on, purchase and restore flows, and
  Free/Pro enforcement are required v1 scope and must pass their release gates.
- Calendar rules, focus sessions (Pomodoro), presence, and the automation
  priority and recovery journal. They were built after 0.5.0 and ship in a
  later release; see the plan index.
- Combined multi-bridge dashboards or cross-bridge control.
- Multiple or per-bridge Sync Box management.
- Public feature voting and roadmap services.
- Automatic What's New dialogs.
- Cross-platform claims or releases beyond Windows 10/11 x64.
- Any unreviewed or partially implemented analytics, crash reporting, or
  feedback-upload pipeline.

## Release-candidate rule

After the release-candidate cutoff, changes are limited to release blockers,
security fixes, legal/support content, packaging, and validation findings. New
features move to a later release. This inventory must be updated if a scoped
feature is removed before submission.
