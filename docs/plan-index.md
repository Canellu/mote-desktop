# Plan index

Last reviewed: **2026-09-02**.

The product name is **Mote Desktop**, the publisher display name is **Anton
Vo**, the permanent application identifier is `com.motedesktop.mote`, and
**Lumi** is the mascot. Mote remains subject to commercial name clearance;
`<APP_SCHEME>` remains a placeholder until a URI scheme is selected. The
fallback shortlist is recorded in the Microsoft Store release plan.

## Current status and ownership

| Plan                                                                                                  | Status                                | Owns                                                                                                 |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| [Microsoft Store release](./microsoft-store-release-plan.md)                                          | In progress                           | Windows launch identity, packaging, signing, validation, listing, certification, and operations      |
| [Sync Box](./sync-box-plan.md)                                                                        | Complete                              | Existing single-Sync-Box implementation record                                                       |
| [PC Sync](./pc-sync-plan.md)                                                                          | Complete for Windows launch           | Screen/audio capture and entertainment streaming                                                     |
| [Multi-bridge dashboard and PC Sync](./multi-bridge-experience-plan.md)                               | Future                                | Combined bridge views, cross-bridge control, and PC Sync behavior across bridge switches             |
| [Multi-provider smart-home platform](./multi-provider-platform-plan.md)                               | Vision / proposed foundation          | Provider adapters, neutral capabilities/resources, connection ownership, and cross-provider control  |
| [Per-bridge Sync Box](./per-bridge-sync-box-plan.md)                                                  | Proposed                              | Multiple Sync Boxes and bridge association                                                           |
| [Cloud control](./cloud-control-plan.md)                                                              | Proposed                              | Hue OAuth, token broker, and local/cloud transport                                                   |
| [Homes and membership](./homes-and-membership-plan.md)                                                | Vision                                | Product identity, homes, members, roles, and relay model                                             |
| [Home Map](./home-map-plan.md)                                                                        | Proposed                              | Quick and measured floor plans, room editing, light placement, and map-based lighting controls       |
| [Monetization and backend stack](./monetization-and-stack-plan.md)                                    | Product direction decided             | Auth/backend/payment choices and entitlements                                                        |
| [Free, Pro, and Household feature matrix](./free-pro-feature-matrix.md)                               | Initial product decision              | Current and future tier boundaries, capabilities, downgrade, offline, and grandfathering rules       |
| [Windows Store packaging and commerce spike](./windows-store-commerce-spike.md)                       | MSIX selected; validation in progress | MSIX feasibility, Microsoft durable add-on proof, native capability smoke test, and package decision |
| [Website launch](./website-launch-plan.md)                                                            | Planned                               | Public marketing, pricing, legal, support, domain, email DNS, and Cloudflare Pages deployment        |
| [Feedback, analytics, and legal](./feedback-analytics-and-legal-plan.md)                              | Email feedback implemented            | Email feedback, proposed telemetry/hosted intake, optional contact email, and legal surfaces         |
| [Feature voting, public roadmap, and release history](./feedback-roadmap-and-release-history-plan.md) | Future                                | Public feature requests, voting, roadmap statuses, What's New, and version-linked release history    |
| [Automation runtime](./automation-runtime-plan.md)                                                    | Proposed shared prerequisite          | Task ownership, light snapshots, recovery, conflicts, tray execution, and notifications              |
| [Calendar integration](./calendar-integration-plan.md)                                                | Proposed                              | Calendar accounts, event rules, and calendar UX                                                      |
| [Pomodoro focus rituals](./pomodoro-focus-rituals-plan.md)                                            | Proposed                              | Focus-session state machine and UX                                                                   |
| [Local network presence](./local-network-presence-plan.md)                                            | Proposed                              | Presence detection and presence-rule UX                                                              |

## Boundaries that prevent duplicate work

- Calendar, Pomodoro, and presence rules consume the shared
  [automation runtime](./automation-runtime-plan.md); they do not build separate
  snapshot, restoration, conflict, tray, or notification systems.
- Cloud control owns Hue transport and OAuth. Homes/membership owns the shared
  domain model. Monetization owns identity-provider, backend, commerce, and
  entitlement decisions.
- The multi-provider plan owns provider-neutral resources, capabilities,
  connections, and adapter boundaries. Hue cloud transport stays in the cloud
  control plan; Hue Entertainment and Sync Box behavior remain Hue extensions.
- Sync Box and PC Sync are retained as implementation records. Multi-bridge
  follow-up work belongs to the dedicated multi-bridge and per-bridge Sync Box
  plans rather than reopening their completed scope.
- Feedback email is optional and report-scoped. Automatic analytics and crash
  reporting do not collect names or email addresses.
- Private feedback remains separate from the public roadmap. Public voting is
  post-launch and must not become an analytics identity; only its release-note
  and versioning foundation is part of the first Store release.
- The v1 marketing website lives in a separate `mote-website` repository. Do
  not restructure the release-critical desktop repository into a monorepo merely
  to share marketing-site code.

## Review rule

When implementation changes a completed plan, update its status/current-state
summary. Re-check external policy and provider claims at implementation time;
dates, Store rules, OAuth requirements, pricing, and SaaS capabilities can
change.
