# Plan: HDMI Sync Box Control ("Sync" tab)

Status: **finished**. Discovery, API-level gating, pushlink registration,
session persistence, onboarding, Sync controls, visibility-scoped state
polling, edge handling, and production TLS hardening are implemented.

Related plan: [PC-hosted Hue Entertainment Sync](pc-sync-plan.md)

> **Optional follow-up for the next agent:** The pinned-CA implementation can be
> checked end to end against a physical Sync Box. Before performing that check,
> explain what will be tested and get explicit confirmation from the user. Do
> not start pairing, send Sync Box commands, or change the saved session without
> that confirmation.

## Goal

Bring the Philips Hue app's **Sync tab** functionality into this app: discover an
HDMI Sync Box on the LAN, pair with it, and let the user:

- Turn the entertainment-area lights on and start/stop syncing.
- Pick which HDMI source (input1–4) is active.
- Switch sync mode (video / game / music / ambient) and adjust intensity.
- Adjust brightness and pick the target entertainment area.
- See live state (current mode, source, content specs, sync supported, errors).

The Sync Box has its **own HTTP JSON API** (`https://<ip>/api/v1/...`) that is
_separate_ from the Bridge's CLIP v2 API, but architecturally a near-twin:
mDNS discovery → pushlink registration → bearer-token HTTPS calls. This is why
most of the work is repeating patterns already in `hue_client.rs`.

> **Important compatibility gate:** Only `apiLevel >= 7` is supported. The API
> was beta below that with breaking changes. On discovery, if a lower apiLevel is
> reported, surface a "please update the Sync Box firmware via the official Hue
> Sync app" message instead of proceeding.

## Why this shape (decisions to make / made)

- **The Sync Box is a distinct device from the Bridge.** It is _not_ reachable
  through the Bridge API. It is its own networked box with its own pairing and
  token. We model it as a separate service + separate stored session, sitting
  alongside the existing Bridge session, not inside it.
- **Mirror the existing Bridge code, don't reinvent.** `mdns-sd` for discovery,
  pushlink registration, `keyring` for the token, `tauri-plugin-store` for
  non-secret device info, `reqwest` for transport, Tauri commands as the
  frontend bridge. All of this already exists for the Bridge.
- **Production uses pinned Sync Box CA validation.** The earlier insecure-client
  phase was implementation scaffolding only and must not be restored or treated
  as an acceptable shipping configuration.
- **Sync control is "execution" PUTs.** Once auth works, the actual feature is
  small atomic JSON PUTs against `/api/v1/execution`. Cheap.

## Architecture

```
┌──────────────────────────────┐
│  Tauri app (user device)     │
│                              │
│  features/sync-screen (React) │
│         │ invoke()            │
│         ▼                     │
│  commands/sync_box.rs         │   mDNS: _huesync._tcp
│         │                     │   pushlink registration
│         ▼                     │   bearer token in keyring
│  services/sync_box_client.rs  ├──────────────────────────►  https://<ip>/api/v1/...
│  (reqwest, own TLS config)    │                              (HDMI Sync Box, HSB1)
└──────────────────────────────┘
```

### New / changed files

| File                                        | Purpose                                                              |
| ------------------------------------------- | -------------------------------------------------------------------- |
| `src-tauri/src/services/sync_box_client.rs` | New. Discovery, registration, state GET, execution PUTs, TLS config. |
| `src-tauri/src/commands/sync_box.rs`        | New. Tauri commands wrapping the client.                             |
| `src-tauri/src/commands/mod.rs`             | Register the new commands.                                           |
| `src-tauri/src/lib.rs`                      | Add commands to the invoke handler.                                  |
| `src-tauri/assets/hsb_cacert.pem`           | New (Phase 2). Pinned Sync Box CA cert.                              |
| `src/features/sync-box/*`                   | Sync Box screen, onboarding, polling, and constants.                 |
| `src/stores/SyncBoxStore.ts`                | Sync Box session and execution state.                                |
| `src/types/sync-box.ts`                     | TypeScript API types.                                                |

## API surface we actually use

Discovery / auth (no auth header needed for the first two):

- `GET  /api/v1/device` — basic info, **read apiLevel here before anything else**.
- `POST /api/v1/registrations` `{"appName","instanceName"}` — pushlink; returns
  `{"registrationId","accessToken"}`. Returns `{"code":16}` ("Invalid State")
  until the device button is held ~3s (LED blinks green), then released. Retry
  every ~1s within the 5s window, same as Bridge pairing.
- `GET  /api/v1` — full state tree (device, hue, execution, hdmi, behavior, ...).

Control (all bearer-authed PUTs to `/api/v1/execution`):

- Start/stop sync: `{"syncActive": true|false}` (needs `hue.connectionState ==
connected`; false → passthrough).
- Power: `{"hdmiActive": true|false}` (false → powersave).
- Mode: `{"mode": "video|game|music|ambient|passthrough|powersave"}`
  (clients must gracefully ignore unknown modes).
- Source: `{"hdmiSource": "input1..input4"}`.
- Target area: `{"hueTarget": "<id>"}`.
- Brightness: `{"brightness": 0..200}` (100 = neutral).
- Intensity: `{"intensity": "subtle|moderate|high|intense"}` or per-mode
  `{"video": {"intensity": ...}}` etc.
- Convenience toggles also exist (`toggleSyncActive`, `cycleSyncMode`,
  `cycleHdmiSource`, `incrementBrightness`, `cycleIntensity`).

Errors to handle explicitly:

- `device.overheating == true` or `device.undervolt == true` → **critical**,
  show prominently.
- HTTP 16 / "Invalid state" during PUT → e.g. tried to sync before hue
  configured. Surface as a friendly precondition message.
- `connectionState != connected` → can't start sync; prompt to fix bridge link.

### Polling vs. events

The Sync Box API (v1) is request/response with **no documented event stream**
(unlike the Bridge's `/eventstream`). So the Sync screen should **poll** `GET
/api/v1` on a short interval (e.g. 1–2s) while visible, and stop when not. Keep
the connection alive (reuse one `reqwest::Client`) for performance, as the docs
stress.

## TLS — the one fiddly part (detailed)

### Why it's harder than the Bridge

For the local Bridge, this app just does `danger_accept_invalid_certs(true)` —
it ignores cert validation entirely. The Sync Box docs ask for something
stricter and more specific for production:

1. **Pin a custom CA.** The box presents a certificate signed by a Philips
   "Sync Box CA". You're meant to bundle `hsb_cacert.pem` in the app and trust
   _only_ that CA — not the OS trust store.
2. **Validate the common name = device uniqueId.** The cert's CN is the device's
   12-char `uniqueId` (e.g. `C42996000000`), **not** an IP and **not** a DNS name
   you'd normally connect to.

The tension: you'll typically connect **by IP** (`https://192.168.1.12/...`),
but the cert's CN is the `uniqueId`. A normal HTTPS client validates that the
hostname you dialed matches the cert's CN/SAN — which will **fail**, because
`192.168.1.12 != C42996000000`. That mismatch is the whole problem.

### Implemented TLS resolution

| Option                                            | How                                                                                                                                                                        | Trade-off                                                                                                  |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **A. Connect by hostname, resolve yourself**      | Dial `https://<uniqueId>/...` and tell reqwest to resolve that name to the discovered IP (`ClientBuilder::resolve(uniqueId, ip:443)`). Hostname then matches CN naturally. | Cleanest, keeps full validation. Needs the box's cert CN to actually equal uniqueId (verify in the spike). |
| **B. Connect by IP, disable hostname check only** | `add_root_certificate(hsb_ca)` + `danger_accept_invalid_hostnames(true)`. Still validates the chain against the pinned CA; only skips the name match.                      | Simple. Slightly weaker (a different box with a CA-signed cert on that IP would pass). Acceptable on LAN.  |
| **C. Connect by IP, manual CN check**             | Disable reqwest hostname verify, then manually assert the peer cert CN == expected uniqueId.                                                                               | Most control, most code. Usually overkill.                                                                 |

The implementation uses **Option A**: validate against the pinned CA, request by
the validated unique-ID hostname, and use reqwest `resolve()` to route that name
to the discovered IP. No hostname-validation bypass is used for authenticated
requests.

```rust
// Simplified production shape — full validation, no "danger" flags
let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
    .add_root_certificate(ca)
    .resolve(unique_id, format!("{ip}:443").parse()?) // dial uniqueId, route to ip
    .build()?;
// then request https://<unique_id>/api/v1/...
```

### Historical implementation note

An insecure client was used only for the unauthenticated discovery probe during
development. Authenticated registration, reads, and writes use the pinned-CA
client described above. Do not use the historical insecure path for credentials
or control requests.

### Resolved TLS questions

- The unique ID is normalized and validated as a 12-digit hexadecimal hostname.
- reqwest accepts the bundled Sync Box CA and resolves that hostname to the
  discovered address.
- The pinned certificate is stored at `src-tauri/assets/hsb_cacert.pem`.

## Historical validation record

These manual probes were used during implementation. They are not production
client guidance; any repeat testing that pairs or controls physical hardware
requires the user's explicit confirmation.

1. **Confirm reachability + apiLevel** (no auth):

   ```
   GET https://<ip>/api/v1/device
   ```

   Check `apiLevel >= 7`, note `uniqueId`, `firmwareVersion`, `deviceType`.

2. **Pushlink registration** (no auth). First call returns `{"code":16}`:

   ```
   POST https://<ip>/api/v1/registrations
   Body: {"appName":"Mote Desktop","instanceName":"<your machine>"}
   ```

   Then hold the box button ~3s until LED blinks green, release, repeat the POST
   within 5s → expect `{"registrationId","accessToken"}`. **Save the token.**

3. **Read full state** (auth):

   ```
   GET https://<ip>/api/v1
   Header: Authorization: Bearer <token>
   ```

   Confirm the shape of `execution`, `hdmi`, `hue.groups`, `hue.connectionState`.

4. **Drive it** (auth) — the actual feature, one PUT at a time:

   ```
   PUT https://<ip>/api/v1/execution   Body: {"hdmiActive": true}     (passthrough)
   PUT https://<ip>/api/v1/execution   Body: {"hdmiSource": "input2"}
   PUT https://<ip>/api/v1/execution   Body: {"mode": "video"}        (needs hue connected)
   PUT https://<ip>/api/v1/execution   Body: {"brightness": 150}
   PUT https://<ip>/api/v1/execution   Body: {"syncActive": false}    (back to passthrough)
   ```

   Watch the lights react and re-GET `/api/v1` to see state change.

5. **TLS reality check (optional but valuable):** download `hsb_cacert.pem`, then
   try a _verifying_ curl to learn how the box wants to be addressed:
   ```
   curl --cacert hsb_cacert.pem --resolve "<uniqueId>:443:<ip>" \
        -H "Authorization: Bearer <token>" https://<uniqueId>/api/v1
   ```
   If this succeeds, **Option A** is viable. If only the IP form with
   `--connect-to` works, lean **Option B**.

Capturing the real JSON bodies from steps 1, 3, and 4 lets us write exact Rust
structs instead of guessing, and answers the TLS questions before we commit to an
approach.

## Completed build record

1. Run the Postman/curl spikes above; capture real JSON.
2. [x] `sync_box_client.rs`: discovery probe, device GET + apiLevel gate,
       pinned-CA registration, full-state GET, and execution PUT.
3. [x] Tauri commands + minimal store.
4. [x] `features/sync-box` UI; polling while visible.
5. [x] Phase 2 TLS hardening (pin CA, resolve CN); no caller changes.
6. [x] Error/edge handling: overheating/undervolt, connectionState, apiLevel < 7,
       token loss / re-pair.
