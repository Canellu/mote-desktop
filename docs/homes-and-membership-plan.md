# Plan: Accounts, Homes & Membership (Full Platform Vision)

Status: **vision / not started**. This is the umbrella design doc for the
"first-class Hue app experience": users sign in, create **homes**, invite
**members**, and members who install the app are automatically recognised and can
control the devices in the homes they belong to.

This doc owns the **identity, homes, and membership** layer. The **device-control
transport** (how light/scene/room commands actually reach a bridge, locally or via
Hue's cloud) is specified separately in
[cloud-control-plan.md](./cloud-control-plan.md) and referenced here rather than
duplicated.

## The "Home" entity

A **Home** is our own top-level logical container — **not** a Hue concept and not
necessarily a physical residence. It could be a house, an office, a factory, a
venue, anything. It is the upper entity that **holds one or more bridges**, and
each bridge holds the rooms / zones / lights it already owns. Hue has no
equivalent: on Hue's side a bridge is the ceiling, so the Home sits _above_
anything Hue models.

```
Home (our entity)              "Acme Factory"
 ├─ Bridge A (Hue)             building 1 bridge
 │   ├─ Room / Zone            → grouped_light, lights, scenes
 │   └─ Room / Zone
 ├─ Bridge B (Hue)             building 2 bridge
 │   └─ Room / Zone
 └─ Members (our entity)       owner / member / guest
```

Cardinality (a **decision**, not an open question):

- A Home has **one or more bridges**.
- A bridge belongs to **exactly one Home**.
- A user can belong to **multiple Homes**; a Home can have **multiple members**.

Each bridge under a Home keeps its own credential (local app key and/or the
owner's Hue OAuth token). The Home is the unit of **sharing and membership**; the
bridge stays the unit of **device control**.

## The four pillars

The user-facing goal has four parts. They do **not** all become possible at the
same time, because two of them require infrastructure we own.

| #   | Pillar                                           | Source of truth                                             | Needs our backend?                   |
| --- | ------------------------------------------------ | ----------------------------------------------------------- | ------------------------------------ |
| 1   | **Account login**                                | Philips Hue account (OAuth2) now; app-native identity later | App identity: **yes**                |
| 2   | **Cloud device control**                         | Hue cloud (`api.meethue.com/route`)                         | No — only the stateless token broker |
| 3   | **Homes** (top-level container over bridges)     | Local app now; our backend when shared                      | Shared homes: **yes**                |
| 4   | **Members / invites / roles / auto-recognition** | Our backend                                                 | **Yes**                              |

### What can be implemented without an app backend

- **Login with a Philips Hue account** (Hue OAuth2).
- **Cloud device control** from anywhere — see
  [cloud-control-plan.md](./cloud-control-plan.md).
- **Multi-home for a single user**, modeled as multiple **bridge connections**
  stored on that user's own device. This is "my house + my parents' house," not a
  shared home.

The one server piece even this requires is the **stateless token broker** (no
database, no user data) described in
[cloud-control-plan.md → "Vercel token broker"](./cloud-control-plan.md). It only
holds the `client_secret` and swaps codes for tokens.

### What requires the future backend

- An **app-native account** (your identity, not just your Hue account) so a person
  is a stable entity that can belong to multiple homes.
- **Homes as shared, server-owned entities** — so more than one person can see and
  control the same home.
- **Members, invitations, and roles** (owner / member / guest).
- **Auto-recognition**: a member installs the app, signs in, and the homes they've
  been added to simply appear.

There is **no way to build pillar 4 on Hue's public API** — Hue does not expose
homes-as-collections or membership, and will not let you invite anyone or read who
else has access. Those concepts live only in Signify's private consumer cloud,
which is not available to third parties. So membership is something we implement
ourselves or not at all.

## Why "members" forces a backend (and a relay)

Hue application keys are **per Hue account**. A guest member who is not on the
home owner's Hue account has no Hue credential that can reach the owner's bridge.
The only model that actually works:

- The **home owner** links their Hue account once (OAuth + per-bridge app key, per
  [cloud-control-plan.md](./cloud-control-plan.md)). Their refresh token is stored
  **server-side**.
- **Members** authenticate to _our_ backend (pillar 1) and are authorised by _our_
  roles. Their device commands are **relayed through our backend** to Hue using the
  owner's stored credential. Members never hold the owner's Hue tokens.

This is the key reason the future backend is **stateful** (users, homes,
memberships, owner Hue tokens, a relay), whereas the Phase-1 broker is
**stateless** (secret only). It is an evolution of the same server, not a second
one.

## Target architecture (full vision)

```
┌──────────────────────────┐   our auth (pillar 1)   ┌───────────────────────────┐
│  Tauri app                │◄───────────────────────►│  Our backend (FUTURE)      │
│                           │  homes, members, roles, │  - app users / identity    │
│  - app-native sign-in     │  invites, auto-recognise│  - homes (our concept)     │
│  - home picker            │                         │  - membership + roles      │
│  - device control UI      │                         │  - home → bridge mapping   │
│                           │   member device cmds    │  - owner Hue tokens (relay)│
│                           │  (relayed for guests)   └─────────────┬─────────────┘
└──────────┬────────────────┘                                       │
           │                                                        │ owner credential
           │ Hue OAuth + per-bridge app key                         │
           │ (device control transport — see cloud-control-plan.md) │
           ▼                                                        ▼
   LOCAL: https://<bridge-ip>/clip/v2/...        CLOUD: https://api.meethue.com/route/...
                                                  (Philips relays to bridge)
                                                        ▲
                                          stateless token broker (Phase 1)
                                          holds client_secret only
```

- **Device transport** (local bridge vs Hue cloud) is unchanged from
  [cloud-control-plan.md](./cloud-control-plan.md). Homes/membership sit _on top_
  of it.
- **Owner's home** controlled directly app→Hue using the owner's own credential.
- **Guest member's home** controlled app→our-backend→Hue using the owner's stored
  credential (the relay).

## Phasing

The first two phases ship real value with **no stateful backend**. Pillars 3-4
arrive when the backend exists.

### Phase 1 — Cloud device control + Hue-account login (now)

Fully specified in [cloud-control-plan.md](./cloud-control-plan.md). Deliverables:

- Hue OAuth2 login (system browser + deep-link callback).
- Stateless token broker on Vercel (exchange + refresh).
- Transport abstraction in `hue_client.rs` (`Local` vs `Cloud`).
- Keychain token storage + refresh; Settings opt-in for remote access.

Follow that doc's own sub-phasing (broker → transport → OAuth flow → wire into
commands → optional remote SSE). **Do not re-plan it here.**

### Phase 2 — Local Homes over multiple bridges (now, optional)

Without any backend, introduce the **Home** container locally: each Home holds a
list of **bridge connections**, and the app stores a list of Homes. This is
single-user; it does not add sharing. It deliberately shapes the data model so a
future server-owned Home maps cleanly onto a local one.

- Session model: `homes: { id, name, bridges: Connection[] }[]`, with an active
  Home and an active bridge within it.
- UI: a Home switcher plus per-Home bridge management; reuse the existing
  pairing/cloud flows to add a bridge to a Home.

### Phase 3 — App-native identity (requires backend)

- Our own user accounts (or federate: "Sign in with Hue/Google/Apple" → our user).
- App user becomes the stable principal that memberships attach to.
- Migrate Phase-1/2 local sessions to be associated with an app user.

### Phase 4 — Shared homes + membership (requires backend)

- Homes become **server-owned** records, each mapping to one or more bridges and
  storing the owner's Hue refresh token.
- **Invitations** (email/link) and **roles** (owner / member / guest).
- **Auto-recognition**: on sign-in, the app fetches the user's homes from the
  backend and renders them — no manual pairing for invited members.
- **Relay** endpoint so guest members' commands reach Hue via the owner credential.

## What changes vs. cloud-control-plan.md

That doc assumes one user controlling their own bridge(s). This plan adds:

- A **principal** (app user) above the device session, so a home can have many
  users.
- A **home** entity distinct from a bridge (one home → potentially several
  bridges; one user → several homes).
- A **server that stores state** (users, homes, memberships, owner tokens) — the
  stateless broker grows into this; it is not a separate system.
- A **relay path** for guests, which the cloud-control plan does not need.

## Open questions / decisions deferred to backend time

- **Identity/backend selection:** owned by
  [monetization-and-stack-plan.md](./monetization-and-stack-plan.md). Its current
  recommendation is federated identity through Clerk with Convex for state and
  server functions; validate the desktop OAuth flow before committing.
- **Relay vs. shared credential hand-out:** confirmed we relay through the backend
  (never hand owner Hue tokens to guests). Confirm rate-limit headroom, since Hue
  limits are per `client_id` and now multiplied by every member of every home.
- **Offline behavior for guests:** a guest on the home's LAN — do they still go
  through the relay, or can they be granted local access? (Local needs a bridge app
  key, which is the owner's to give.)
- **Revocation:** owner removes a member, or unlinks their Hue account — both must
  invalidate the member's access promptly via the backend.
- **Privacy/trust framing:** the backend now holds owner Hue tokens and brokers
  control for others; document the trust model before building pillar 4.

## Touch list (beyond cloud-control-plan.md's list)

Phases 1-2 touch the files already enumerated in
[cloud-control-plan.md → "Touch list"](./cloud-control-plan.md). Phases 3-4 add:

- **New backend project** (evolution of the `/broker`): users, homes, memberships,
  invites, owner-token storage, relay endpoint.
- `src/context/HueContext.tsx`, `src/types/hue.ts` — app-user principal; `homes`
  collection; per-home transport/role.
- New home-management UI (create home, invite member, manage roles, home switcher).
- New Tauri commands / API client for our backend (auth, list homes, accept
  invite, relay device commands for guest homes).
