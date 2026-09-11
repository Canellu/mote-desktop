# Plan: Multi-Provider Smart-Home Platform

Status: **vision / proposed foundation**. Last reviewed: **2026-09-02**.

## Product direction

Mote Desktop should grow from a Philips Hue controller into a local-first
desktop control surface for multiple smart-home ecosystems. Hue remains the
first and most capable integration, while future providers can include systems
such as Govee and IKEA without duplicating the application or forcing their
devices into Hue-specific concepts.

"Supports any system" means Mote has a stable adapter contract that lets a new
provider be added with bounded integration work. It does not mean every device
or vendor feature is automatically compatible. Each provider must have a
documented, supportable local, cloud, hub, or interoperability API, and its Mote
adapter must declare exactly what it can discover, read, control, and stream.

## Goals

- Let one Mote installation connect to multiple providers and multiple
  connections of the same provider.
- Present common lighting controls consistently while preserving
  provider-specific features and limitations.
- Keep resource identity, credentials, events, errors, and commands scoped to
  their owning provider connection.
- Make offline or degraded providers fail independently.
- Allow Home, widgets, automations, and app-level groups to span providers where
  their capabilities permit it.
- Migrate incrementally, with no all-at-once rewrite and no regression to the
  existing Hue experience.
- Make later adapters testable against one shared contract and fixture suite.

## Non-goals

- Claiming feature parity between ecosystems.
- Reimplementing a vendor cloud, reverse-engineering private APIs as a product
  dependency, or bypassing vendor security.
- Replacing native vendor apps for firmware updates, account administration,
  or unsupported device configuration.
- Loading untrusted third-party code inside Mote in the first version of the
  provider architecture.
- Making Hue-specific Entertainment, PC Sync, Dynamic Scenes, or Sync Box
  behavior part of the minimum provider contract.

## Vocabulary and ownership

Provider-neutral names become the application-level language:

| Term             | Meaning                                                                                      |
| ---------------- | -------------------------------------------------------------------------------------------- |
| **Provider**     | An integration implementation, such as Philips Hue, Govee, IKEA, or a future Matter adapter. |
| **Connection**   | One configured instance of a provider: a bridge/hub, account, or directly connected network. |
| **Device**       | A physical product or logical endpoint reported by a connection.                             |
| **Controllable** | A control target such as a light, outlet, strip segment, or provider group.                  |
| **Space**        | A room, zone, provider group, or Mote-created app-level group.                               |
| **Scene**        | A provider-owned preset or a Mote-owned cross-provider action set.                           |
| **Capability**   | A typed operation or readable state supported by a resource.                                 |

Every resource gets a stable Mote identity containing at least
`providerId`, `connectionId`, `resourceType`, and `nativeId`. Frontend keys,
routes, persisted layouts, widgets, event payloads, and command requests must
use this ownership rather than a bare vendor resource ID. Native IDs remain
unchanged inside the adapter so writes can always be routed back correctly.

The app-level **Home** defined in
[homes-and-membership-plan.md](./homes-and-membership-plan.md) should contain
provider connections rather than Hue bridges specifically:

```text
Home: "House"
 ├─ Connection: Philips Hue bridge
 │   ├─ Space: Living room
 │   └─ Devices / scenes
 ├─ Connection: IKEA hub
 │   ├─ Space: Kitchen
 │   └─ Devices / scenes
 ├─ Connection: Govee account or LAN integration
 │   └─ Devices / scenes
 └─ Mote space: Downstairs
     └─ Targets from more than one connection
```

## Capability model

Avoid a single large device interface full of nullable Hue fields. Resources
declare small, composable capabilities with readable state, writable commands,
constraints, and freshness:

- `power`: on/off, including read-only or write-only variants where necessary.
- `brightness`: normalized `0-100`, with the provider's actual range and step.
- `color`: a normalized application color plus declared input/output modes and
  gamut or accuracy constraints.
- `colorTemperature`: mireds internally, with supported minimum and maximum.
- `effect`: provider-owned effect identifiers and display metadata.
- `sensor`: typed readings, units, event support, and last-updated time.
- `identify`: blink or another provider-supported identification action.
- `groupControl`: native broadcast control for a provider-owned space.
- `scenes`: list, activate, and optionally create/update/delete.
- Optional extensions such as `entertainmentStreaming`, `dynamicScene`,
  `devicePlacement`, `buttonConfiguration`, and `firmwareInfo`.

Capabilities must distinguish **unsupported**, **temporarily unavailable**, and
**unknown/not yet loaded**. The UI renders controls from capability data and
constraints, not from provider-name conditionals. Provider extensions can have
dedicated screens, but shared screens must not import vendor transport types.

Normalization happens only at the adapter boundary. For example, Mote keeps
brightness at `0-100` and color temperature in mireds; an adapter converts to
the vendor's wire format. Color conversion must retain enough metadata to avoid
showing precision or gamut that a device cannot reproduce.

## Target architecture

```text
React UI
  ├─ connection + resource store
  ├─ capability-driven controls
  └─ provider-extension screens
            │ generic Tauri commands/events
            ▼
Provider registry and command router (Rust)
  ├─ Hue adapter ───────► local Hue Bridge / Hue cloud
  ├─ Govee adapter ─────► supported local or cloud API
  ├─ IKEA adapter ──────► supported hub or interoperability API
  └─ future adapter ────► documented provider transport
            │
            ├─ per-connection credential storage
            ├─ normalized snapshots and events
            └─ independent health, retry, and rate limiting
```

### Backend provider contract

Introduce an internal Rust provider contract and registry. The exact trait split
should follow implementation pressure, but the boundary must cover:

- provider metadata and build-time registration;
- discovery and setup/authentication flows;
- list, inspect, and remove connections;
- fetch normalized resources and capability descriptors;
- execute typed commands against owned resource references;
- subscribe or poll for normalized state changes;
- report connection health and actionable provider errors;
- expose optional provider extensions without expanding the base interface.

The registry routes by `providerId + connectionId`; no adapter reads a global
"active bridge." Each connection owns its client, credentials, rate limiter,
event/poll task, reconnect policy, and cancellation lifecycle. Prefer internal,
compile-time adapters first. A public plugin/SDK system can be evaluated later
only after permissions, signing, process isolation, API versioning, and support
policy are defined.

### Tauri boundary

Add provider-neutral commands and events instead of multiplying vendor-named
commands in the frontend. A possible command surface is:

- `list-providers`, `discover-provider-connections`, `begin-provider-setup`;
- `list-connections`, `set-active-connection`, `remove-connection`;
- `get-resources`, `execute-resource-command`;
- `start-connection-events`, `stop-connection-events`.

Requests and event envelopes always carry their connection and resource owner.
Commands should use typed tagged payloads rather than arbitrary JSON where the
operation is shared. Provider-extension commands may remain namespaced, for
example Hue Entertainment operations, and must verify connection ownership.

Existing Hue commands can delegate through the Hue adapter during migration and
remain temporarily as compatibility wrappers. Remove them only after every
frontend caller has moved to the neutral boundary.

### Frontend state and UI

- Replace `HueContext` with a connection/session context once its callers have a
  neutral equivalent.
- Evolve `HueResourcesStore` into a resource store keyed by the full Mote
  resource identity. Keep provider-specific extension state in feature-local
  stores such as Entertainment.
- Make routes and selection state carry encoded Mote resource references rather
  than bare Hue UUIDs.
- Change setup from "find a Hue Bridge" to a provider picker followed by the
  selected provider's setup flow. Continue to offer the polished Hue flow.
- Show provider and connection affiliation only where it resolves ambiguity;
  do not cover every light tile in vendor branding.
- Disable or omit controls based on capability descriptors, and explain
  meaningful restrictions in plain language.
- Let users filter Home by connection/provider and see independent connection
  health.
- Make optimistic updates and event reconciliation connection-scoped. A late
  event from one provider must never overwrite another provider's resource.

## Persistence and credentials

- Store non-secret provider connection metadata in a versioned Mote connection
  store. Do not keep expanding `hue-store.json` into the generic format.
- Store secrets in the system keyring under keys scoped by provider and
  connection. Never copy credentials between adapters or expose them to React.
- Add a one-way, idempotent migration from current Hue bridge records. Preserve
  the existing Hue application keys, bridge IDs, active bridge, cached names,
  layouts, widget targets, and entertainment preferences.
- Version persisted resource references so provider/native ID changes can be
  migrated without silently retargeting a control.
- Removing a connection must stop its background tasks and remove only its own
  secrets, caches, layouts references, and pending commands after explicit
  confirmation.

## Spaces, scenes, and cross-provider actions

Keep provider-owned spaces and scenes distinct from Mote-owned ones:

- A provider space uses native group control when supported and otherwise fans
  out only when the adapter explicitly declares that behavior safe.
- A Mote space stores owned resource references from any connection. Commands
  fan out with bounded concurrency and return per-target results.
- A provider scene is activated by its owning provider and cannot target other
  connections.
- A Mote scene stores normalized actions and optional transitions. It may span
  providers, but the UI must communicate that activation is best-effort and not
  perfectly simultaneous.

Partial success is a first-class result. One unavailable provider must not roll
back successful commands on another unless a future automation explicitly uses
transaction-like recovery.

## Events, polling, and consistency

Adapters may receive push events, use polling, or combine both. They normalize
updates into one envelope containing connection ownership, resource identity,
changed capability state, provider timestamp when available, Mote receive time,
and a monotonic connection-local revision.

The shared layer should:

- coalesce noisy updates while retaining final state;
- reject stale updates after optimistic commands when ordering is known;
- periodically reconcile full snapshots for providers with lossy event streams;
- apply independent backoff, jitter, health, and rate limits per connection;
- pause/resume correctly across sleep, network changes, connection removal, and
  app shutdown.

The UI must expose whether state is live, delayed, stale, or unavailable when
that distinction affects user trust.

## Provider admission checklist

Before committing to a new provider, record:

1. Supported and documented integration path: local, hub, cloud, Matter, or a
   combination.
2. Authentication, credential storage, account-review, and redistribution
   requirements.
3. Device discovery, identity stability, grouping, scene, sensor, and event or
   polling behavior.
4. Rate limits, latency, offline behavior, API lifecycle, regional limits, and
   required hardware.
5. Capability mapping and which features remain provider-specific.
6. Test hardware and accounts available for development and regression.
7. Security/privacy impact and whether traffic leaves the local network.
8. Vendor terms and branding requirements.

Re-check these facts from current official provider documentation when an
adapter is scheduled; they are intentionally not frozen in this architecture
plan.

## Suggested delivery phases

### Phase 0 — Inventory and contracts

- Inventory every Hue-shaped frontend type, command, persistence key, route,
  event, and extension feature.
- Define neutral resource references, capabilities, connection health, errors,
  command results, and event envelopes in Rust and TypeScript.
- Write provider contract tests before changing runtime behavior.
- Select a narrow vertical slice: list lights, receive state, and control
  power/brightness through the generic boundary.

Exit criterion: the contract represents current Hue behavior without losing
Hue-only metadata, and unsupported capabilities have explicit semantics.

### Phase 1 — Put Hue behind the provider boundary

- Extract Hue transport and mapping from `hue_client.rs` into a registered Hue
  adapter while preserving its v2-first behavior and explicit v1 fallbacks.
- Route the chosen vertical slice through provider-neutral Tauri commands.
- Emit connection-owned normalized events and consume them in a small neutral
  frontend store path.
- Keep compatibility wrappers for untouched Hue features.

Exit criterion: the existing Hue user journey behaves the same, but one common
control path no longer depends on Hue-named frontend APIs.

### Phase 2 — Neutralize shared product surfaces

- Migrate Home, Space, inspector, search/selection, widgets, and shared controls
  capability by capability.
- Move layouts and widget targets to versioned Mote resource references.
- Add Connections settings and the provider-picker setup shell.
- Keep Hue Entertainment, PC Sync, device placement, and advanced Hue settings
  as Hue extensions.

Exit criterion: shared UI can render resources from two fake providers in the
same development build without provider checks in shared components.

### Phase 3 — First non-Hue adapter

- Use the provider admission checklist to choose the first ecosystem based on
  documented API stability, local-first fit, hardware access, and useful
  capability overlap—not brand recognition alone.
- Implement setup, resources, power, brightness, color/color temperature where
  supported, connection health, updates, error mapping, and removal.
- Run the contract suite plus physical-device reconnect, sleep/resume, rate-limit,
  stale-state, and partial-failure tests.

Exit criterion: Hue and one non-Hue connection coexist in normal Home, Space,
and widget flows, and either can fail without breaking the other.

### Phase 4 — Cross-provider product features

- Add Mote-owned spaces and scenes with per-target results.
- Make the shared automation runtime operate on capabilities and owned resource
  references.
- Add provider/connection filters, stale-state UI, backup/export rules, and
  diagnostics suitable for support.
- Generalize multi-bridge plans into multi-connection behavior where the
  semantics are shared.

Exit criterion: one app-level action can safely control compatible resources
across providers, with partial failures visible and recoverable.

### Phase 5 — Ecosystem and SDK decision

- Add further first-party adapters only when support and regression capacity
  exist.
- Evaluate Matter as another provider/interoperability path, not as a guarantee
  that all vendor features become available.
- Decide whether an external provider SDK is worthwhile. If so, version the
  contract and run adapters out of process with explicit permissions and
  compatibility checks.

## Testing strategy

- A provider contract suite runs against every adapter and a deterministic fake
  provider.
- Recorded/constructed fixtures cover capability combinations without requiring
  physical devices for every UI test. Never record real credentials.
- Mapping tests verify units, constraints, IDs, errors, and event ordering at
  each adapter boundary.
- Shared UI tests use at least two providers with overlapping native IDs to
  catch missing ownership in keys and routes.
- Integration tests cover setup cancellation, credential expiry, offline start,
  reconnect, partial discovery, throttling, sleep/resume, removal, and shutdown.
- Hardware smoke tests are required before releasing each supported provider or
  materially changing its adapter.
- Hue regression tests cover pairing, multi-bridge switching, scenes, widgets,
  sensors, Entertainment/PC Sync, Sync Box, and v1 fallbacks.

## Acceptance criteria for the foundation

- Hue works through a registered provider adapter with no loss of current
  functionality.
- A deterministic second adapter can connect concurrently and populate shared
  Home/Space controls without Hue-specific UI branches.
- All persisted and runtime resource references include provider and connection
  ownership.
- Common controls render from declared capabilities and constraints.
- Commands, optimistic state, and events cannot cross connection boundaries.
- Provider-specific failure, throttling, or disconnection leaves other
  providers usable.
- Credentials are isolated per connection and remain outside the frontend.
- Existing Hue data migrates idempotently and can be rolled back to the last
  pre-migration app version through a documented backup/recovery procedure.
- Removing a connection leaves no background task, credential, or silently
  retargeted widget behind.

## Risks and safeguards

- **Lowest-common-denominator UI:** keep optional capabilities and provider
  extensions instead of flattening every feature into a universal light model.
- **Leaky Hue abstractions:** make the fake second provider part of foundation
  testing before building a real adapter.
- **Unstable vendor APIs:** admit providers only after the checklist and isolate
  every wire model inside its adapter.
- **Cloud dependency creep:** label local/cloud requirements during setup and
  keep local transports preferred where supported.
- **Rate-limit conflicts:** use per-connection schedulers and collapse superseded
  slider writes.
- **Identity collisions:** use compound Mote references everywhere and test
  deliberately duplicated native IDs.
- **Migration blast radius:** dual-read/compatibility wrappers first, then
  migrate one surface at a time with versioned backups.
- **Maintenance load:** publish a provider/device support matrix and do not ship
  an adapter without owned hardware and regression responsibility.

## Relationship to existing plans

- [Multi-bridge dashboard and PC Sync](./multi-bridge-experience-plan.md) becomes
  the Hue-specific first case of multiple provider connections. Its
  Entertainment requirements stay Hue-specific.
- [Homes and membership](./homes-and-membership-plan.md) should evolve from
  `Home -> bridges` to `Home -> provider connections`; identity, sharing, and
  relay ownership remain in that plan.
- [Cloud control](./cloud-control-plan.md) continues to own Hue OAuth and Hue
  local/cloud transport. Other providers own their authentication and transport
  inside their adapters.
- [Automation runtime](./automation-runtime-plan.md) should target capability-
  owned Mote resource references, not Hue UUIDs or Hue command names.
- [Per-bridge Sync Box](./per-bridge-sync-box-plan.md) remains a Hue provider
  extension and must not become part of the common provider contract.

## Initial touch list

The first foundation phases are expected to touch:

- `src-tauri/src/services/hue_client.rs` and `src-tauri/src/services/mod.rs` —
  extract/register the Hue adapter and shared provider contract;
- `src-tauri/src/commands/` and `src-tauri/src/lib.rs` — add the neutral command
  router while retaining Hue compatibility handlers;
- `src/types/hue.ts` — keep Hue transport/extension types, while adding neutral
  resource and capability types under a new provider-neutral module;
- `src/context/HueContext.tsx` — migrate connection lifecycle responsibilities
  toward a provider-neutral context;
- `src/stores/HueResourcesStore.tsx` — migrate shared resources and commands in
  vertical slices, retaining Hue extension logic until it has a clear owner;
- `src/features/setup-wizard/` and `src/features/settings-screen/` — provider
  selection, connection setup, health, and removal;
- Home, Space, inspector, widget, and selection/layout code — compound resource
  references and capability-driven controls;
- `hue-store.json`, keyring account naming, Home layout, Space preferences, and
  widget settings — versioned migration to connection-owned records.

Do not combine the core provider/state migration with visual micro-interaction
work. Complete and verify the data/command boundary first, then adapt each UI
surface in isolated follow-up work.
