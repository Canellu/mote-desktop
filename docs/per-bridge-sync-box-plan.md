---
title: "Per-Bridge Sync Box Plan"
keywords:
  [
    "sync box",
    "multi-bridge",
    "bridge switcher",
    "pairing",
    "per-bridge",
    "HDMI Sync Box",
  ]
summary: "Scope the paired HDMI Sync Box to the active bridge so switching bridges switches the Sync view and its connected box. One box per bridge, keyed and validated by bridge id."
---

# Per-Bridge Sync Box Plan

Status: **superseded in 0.7.0**. Mote now saves several boxes (one keyring token
each), records the bridge each box reports, lists the boxes on the active bridge
in a picker, and makes a second box Mote Pro. Unlike this plan, a bridge may
have more than one box. The original proposal follows; before 0.7.0 Mote
stored one global Sync Box configuration and credential.

## Goal

Today the app pairs and controls exactly **one** HDMI Sync Box, stored as a global
singleton. We want the Sync Box to be **scoped to the active bridge**, so that:

- Bridge A shows/controls Sync Box A; switching to Bridge B shows/controls Sync Box B.
- The Sync view follows the bridge switcher automatically (no separate box switcher).
- Pairing a box associates it with whatever bridge is active at pairing time.
- Each bridge can have **at most one** Sync Box (matches the Hue reality: a box streams
  to one bridge, and a bridge allows only one entertainment stream at a time).

This mirrors the multi-bridge switcher that already exists for the rest of the app
([bridges.rs](../src-tauri/src/commands/bridges.rs),
[HueContext.switchBridge](../src/context/HueContext.tsx#L113-L135)).

## Is pairing "per bridge"?

Effectively yes, with one nuance worth encoding in the design:

- The Sync Box **access-token registration** is created on the **box** itself
  (`POST /api/v1/registrations`), so the token authorizes _this app → that box_,
  independent of any bridge.
- But every box is bound to exactly **one** bridge and reports it: `hue.bridgeUniqueId`
  / `hue.bridgeIpAddress` in the box state
  ([API doc](HUE/hue-hdmi-sync-box-api.md#L139-L155), resource table
  [line 328](HUE/hue-hdmi-sync-box-api.md#L328)). `bridgeUniqueId` is the same 16-char
  hex identifier the app uses for `bridge_id`.

So we **key the stored box + token by bridge id**, and **validate** each box against the
active bridge by comparing `hue.bridgeUniqueId` to the active bridge's id. Re-pairing a
box to a _different_ bridge is done in the official Hue Sync app (or via `PUT /hue`, a
non-goal here) — our app only remembers which box belongs to which bridge and warns on
mismatch.

## Can two boxes sync simultaneously across two bridges? (Yes)

**Scenario:** on Bridge A start Box A, switch the app to Bridge B, start Box B — both
boxes syncing at the same time. This **works**, and it requires no extra streaming
architecture, because of a fundamental difference between the app's two "sync" concepts:

|                                                                                     | Who streams?                                                                                           | Concurrency                                                                                                                             |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| **PC / host sync** ([engine.rs](../src-tauri/src/services/entertainment/engine.rs)) | **the app** holds the DTLS stream open                                                                 | Single session; tied to the active bridge; **stopped on every bridge switch** ([switchBridge L119](../src/context/HueContext.tsx#L119)) |
| **HDMI Sync Box**                                                                   | **the box** (autonomous hardware) holds the stream; the app just fires `PUT /execution` and walks away | Each box streams to _its own_ bridge → any number can run at once, one per bridge                                                       |

Because the box is autonomous, telling Box A `{syncActive: true}` makes it sync on its
own; the app switching its active bridge afterward does **not** stop Box A. Start Box B on
Bridge B and both run simultaneously — the one-stream-per-bridge limit is satisfied because
each box streams to a _different_ bridge.

**Design implication (must-hold invariant):** a bridge switch changes which box the app
_displays and controls_ — it must **never** send stop to a Sync Box. Only PC host-sync is
torn down on switch (as it is today). A running box on the now-inactive bridge keeps
syncing; the app simply isn't showing its controls until you switch back.

**Boundary:** the app can _control/observe_ only the active bridge's box at a time (both
can be _running_). Seeing both boxes' live state side by side is a separate multi-box
overview (`list-sync-boxes`, optional below), not required to run both simultaneously.

## Current state (single-box singleton)

Backend — [sync_box_client.rs](../src-tauri/src/services/sync_box_client.rs):

- Storage is a single key: `STORE_KEY = "syncBox"` holding one `StoredSyncBoxInfo`
  ([L14](../src-tauri/src/services/sync_box_client.rs#L14),
  `save_sync_box_info`/`load_sync_box_info`
  [L669-L699](../src-tauri/src/services/sync_box_client.rs#L669-L699)).
- One access token: keyring account `hue-sync-box-access-token`
  ([L16](../src-tauri/src/services/sync_box_client.rs#L16)).
- One cached pinned client: _"the one configured box"_
  ([L184](../src-tauri/src/services/sync_box_client.rs#L184)). The cache key
  (`SecureTarget` = uniqueId/ip/port) already rebuilds on change, so it is
  correct for switching — it just holds one entry at a time.
- Every command resolves _"the saved Sync Box"_ with no bridge/box selector
  ([sync_box.rs](../src-tauri/src/commands/sync_box.rs)).

Frontend:

- [SyncBoxStore.ts](../src/stores/SyncBoxStore.ts) holds a single `state` and already
  has a `clear()` — but nothing re-scopes it on bridge switch.
- [HueContext.switchBridge](../src/context/HueContext.tsx#L113-L135) reloads Hue
  resources and restreams, but never touches the Sync Box session.

Entertainment areas in the Sync view are **already** bridge-scoped (they come from the
active bridge). Only the Sync **Box** is a global singleton — that is the whole gap.

## Target design

`syncBox` (singleton) → `syncBoxes` (map keyed by uppercase bridge id):

```jsonc
// hue-store.json
"syncBoxes": {
  "001788FFFEAAAAAA": { /* StoredSyncBoxInfo, incl. box uniqueId + reported bridgeId */ },
  "001788FFFEBBBBBB": { /* ... */ }
}
```

- Value is a **single** box per bridge (not a list) — one box per bridge by design.
- Keyring: one token per bridge, account `hue-sync-box-access-token-<BRIDGE_ID>`.
- Bridge id normalized to uppercase to match `BridgeStore` normalization
  ([hue_client.rs L136-L142, L4488](../src-tauri/src/services/hue_client.rs#L136)).

The "active box" is always _the box stored under the active bridge id_. There is no
separate box-selector state — the bridge switcher is the selector.

### Where the active bridge is resolved

**Recommended:** resolve the active bridge id **inside** the Sync Box commands via the
existing bridge store, so command signatures stay parameterless and can never drift from
the rest of the app:

```rust
let bridge = HueClient::new()?.get_stored_bridge(&app)?; // active StoredBridgeInfo
let bridge_id = bridge.bridge_id; // already uppercase-normalized
```

`get_stored_bridge` is the same accessor the entertainment engine uses
([engine.rs L916](../src-tauri/src/services/entertainment/engine.rs#L916)). The Sync Box
commands already take `AppHandle`, so this is a light, existing coupling (discovery.rs
already bridges the entertainment + hue_client modules).

_Alternative:_ pass `bridgeId` from the frontend on every command. Rejected as the
default — it threads bridge id through more call sites and risks the frontend and backend
disagreeing about "active."

## Backend changes

[sync_box_client.rs](../src-tauri/src/services/sync_box_client.rs):

1. **Storage map.** Replace the single-value helpers with map-based ones keyed by bridge
   id:
   - `save_sync_box_info(app, bridge_id, info)`, `load_sync_box_info(app, bridge_id)`,
     `clear_sync_box_info(app, bridge_id)`.
   - New store key `syncBoxes` (map). Keep reading the legacy `syncBox` key for migration
     (see below).
2. **Per-bridge token.** `save_access_token(bridge_id, token)`,
   `load_access_token(bridge_id)`, `clear_access_token(bridge_id)` using account
   `hue-sync-box-access-token-<BRIDGE_ID>`.
3. **Resolve active bridge** at the top of each saved-state method
   (`get_saved_state`, `update_saved_execution`, `update_saved_source_mode`,
   `restore_session`, `save_session`, `clear_session`) via `get_stored_bridge`, then load
   the box/token for that bridge id. Error text when none: _"No Sync Box is paired for
   this bridge."_
4. **Capture the box's bridge.** Extend `SyncBoxHue` to deserialize `bridgeUniqueId` and
   `bridgeIpAddress` (currently dropped). Add a `bridge_id: String` field to
   `StoredSyncBoxInfo` recording the bridge the box reported at pairing time.
5. **Validation helper.** `fn box_matches_active_bridge(state, active_bridge_id) -> bool`
   comparing `state.hue.bridge_unique_id` to the active id, case-insensitively. Surface a
   non-fatal warning in `SyncBoxSession`/state when they differ (new `bridge_mismatch:
Option<String>` on `SyncBoxSession`), e.g. _"This Sync Box is paired to a different
   bridge in the Hue Sync app."_
6. **Secure-client cache (optional).** `Mutex<Option<(SecureTarget, Client)>>` →
   `Mutex<HashMap<String /*uniqueId*/, (SecureTarget, Client)>>` to avoid rebuilding the
   pinned TLS client on every bridge switch. Correct without this change; purely an
   efficiency nicety. Low priority.

[sync_box.rs](../src-tauri/src/commands/sync_box.rs):

7. Command signatures stay the same (parameterless resolution). `pair-sync-box` stores
   under the active bridge id; on success it reads box state once and, if
   `bridgeUniqueId` ≠ active bridge, still saves but returns the mismatch warning so the
   UI can prompt.
8. Optional new command `list-sync-boxes` → `Vec<{ bridgeId, StoredSyncBoxInfo }>` for a
   future overview; not required for the switch-driven flow.

## Frontend changes

1. **Reload on switch (never stop a box).** In
   [HueContext.switchBridge](../src/context/HueContext.tsx#L113-L135) (and `removeBridge`),
   after the bridge becomes active, refresh the Sync Box:
   `useSyncBoxStore.getState().clear()` then `refresh()` (which now returns the active
   bridge's box). Do the same on initial `refreshSession`. **Do not** add a
   `stop-sync-box` to the switch path — a box already syncing on the now-inactive bridge
   must keep running (see "Can two boxes sync simultaneously"). Only the existing
   `stop-host-sync` (PC sync) is fired on switch.
2. **SyncBoxStore** [SyncBoxStore.ts](../src/stores/SyncBoxStore.ts): no keying needed —
   it keeps showing "the current bridge's box." Ensure `clear()` runs on switch so the
   old bridge's box never flashes under the new bridge (same pattern as
   `HueResourcesStore.hasLoaded = false`). Surface the new `bridgeMismatch` warning.
3. **Sync view.** When the active bridge has no paired box, the Sync view shows an empty
   state + "Pair a Sync Box" entry point (the existing onboarding wizard). When it has
   one, render as today. No box-switcher UI — the bridge switcher drives it.
4. **Onboarding** ([SyncBoxOnboardingWizard](../src/features/sync-box/SyncBoxOnboardingWizard.tsx)):
   pairing associates with the active bridge. If the discovered box reports a different
   `bridgeUniqueId`, warn: the box must be paired to _this_ bridge in the Hue Sync app, or
   switch to the bridge it belongs to. (Discovery still lists all boxes on the LAN.)
5. **Types** ([types/sync-box.ts](../src/types/sync-box.ts)): add `bridgeUniqueId` /
   `bridgeIpAddress` to the hue state and `bridgeMismatch` to the session.

## Migration & backward compatibility

On first load after upgrade, migrate the legacy singleton once:

1. If `syncBoxes` is absent but legacy `syncBox` + `hue-sync-box-access-token` exist:
   - Determine the owning bridge: prefer the box's live `hue.bridgeUniqueId` (fetch state
     if reachable); fall back to the **currently active** bridge id if unreachable.
   - Write the box into `syncBoxes[<bridgeId>]` and copy the token to
     `hue-sync-box-access-token-<bridgeId>`.
   - Delete the legacy `syncBox` key and legacy token account.
2. Idempotent: guard on `syncBoxes` already present.

This keeps existing single-box users working with zero re-pairing in the common case
(box reachable, or the box belongs to the active bridge).

## Edge cases

- **Bridge with no box:** Sync view empty state + pair CTA. Commands return
  _"No Sync Box is paired for this bridge."_
- **Box paired to a different bridge than active:** show `bridgeMismatch` warning; do not
  auto-issue execution changes blindly (the box will 400 with "Invalid state" anyway).
- **Remove bridge:** `remove-hue-bridge` must also clear `syncBoxes[<bridgeId>]` and its
  token (extend the removal path in [bridges.rs](../src-tauri/src/commands/bridges.rs)).
- **Same physical box re-paired to another bridge:** stored under the new bridge id; the
  old entry becomes stale and its token 401s → prompt to re-pair. Acceptable.
- **One box, two bridges:** the second bridge simply has no box. Fine.
- **Both boxes syncing at once:** fully supported. Because each box is autonomous and
  streams to its _own_ bridge, starting Box A then switching to Bridge B and starting Box B
  leaves both running. The switch only changes which box is displayed/controlled; it never
  stops a box. (See "Can two boxes sync simultaneously across two bridges".)

## Non-goals

- Re-pairing a box to a different bridge from this app (`PUT /hue` with
  bridgeUniqueId/username/clientKey). Out of scope; use the official Hue Sync app.
- More than one box **per bridge**. One box per bridge by design (one stream per bridge).
  _(Note: two boxes on two bridges syncing simultaneously **is** supported — that's the
  autonomous-hardware case above, not a non-goal.)_
- Simultaneous **PC host-sync** across bridges (the _app_ can only stream to one bridge at
  a time — that constraint is unchanged and unrelated to HDMI boxes).
- Controlling/observing both boxes on one screen at the same time. The plan is
  switch-driven for control; a side-by-side multi-box dashboard is a later add
  (`list-sync-boxes`).
- A standalone Sync Box switcher separate from the bridge switcher.

## Testing

Backend (unit, no runtime — mirror existing `sync_box_client` tests):

- Storage map round-trips per bridge id; `load` for an unknown bridge returns `None`.
- Token keyring account is bridge-scoped; clearing one bridge leaves others intact.
- Legacy-singleton migration assigns to the box's reported bridge, falls back to active,
  and is idempotent.
- `box_matches_active_bridge` case-insensitive match / mismatch.

Frontend / integration:

- Switching Bridge A → B swaps the Sync view's box; A's box never renders under B.
- Removing a bridge clears its box + token.
- Pairing while on Bridge A stores under A; a mismatched box surfaces the warning.

## Suggested sequencing

1. **Backend storage + keyring keyed by bridge id** (+ migration) with existing commands
   resolving the active bridge. Ships single-box behavior unchanged for current users.
2. **Capture `bridgeUniqueId` + validation warning** end to end.
3. **Frontend switch hook**: reload Sync Box on `switchBridge`/`removeBridge`; empty state
   for bridges with no box.
4. **Onboarding association + mismatch prompt.**
5. _(Optional)_ secure-client cache map; `list-sync-boxes` overview.
