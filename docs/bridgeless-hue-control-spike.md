# Bridgeless Hue control spike

Status: **research complete; no code written. Recommendation is to keep the
Bridge requirement for v1, reject Bluetooth LE as a product dependency, and
route the real bridgeless answer into the
[multi-provider platform plan](./multi-provider-platform-plan.md) as a future
Matter adapter.**

Last reviewed: **2026-09-11**.

This spike was raised by the website FAQ claim "A compatible Hue Bridge is
required for lighting control. Mote Desktop does not connect directly to
Bluetooth-only lights." The question behind it: Philips Hue itself sells
bridgeless control, so should Mote support it too?

Short answer: bridgeless Hue is real, and there are now two separate bridgeless
paths — Bluetooth LE and Matter over Thread. Neither of them is reachable from a
Windows desktop app without giving up most of what Mote is. The FAQ claim is
correct. It is also slightly over-broad, and the wording change is recorded at
the end of this document.

## Goal

Decide whether Mote Desktop should control Hue lights without a Hue Bridge, and
if so, over which transport, with what feature loss, and at what engineering
cost.

## Questions the spike must answer

1. Does Philips Hue officially support control without a Bridge, and with what
   documented limits?
2. Is there a supported API for either bridgeless path that a third-party
   Windows application may use?
3. Can a Windows PC physically reach the lights over that transport, at the
   scale a real home has?
4. Which Mote features survive a bridgeless connection, and which cannot exist?
5. Is the resulting experience worth shipping, supporting, and defending in the
   Microsoft Store?

## Guardrails

- Do not ship a reverse-engineered vendor protocol as a product dependency. This
  is already a stated non-goal in the
  [multi-provider platform plan](./multi-provider-platform-plan.md).
- Do not weaken the existing bridge path, its v2-first rule, or its resource
  identity model to accommodate a second transport.
- Do not change website or Store copy on the basis of a capability that is not
  implemented.
- Any probe code stays in `src-tauri/examples/` as a throwaway binary, following
  the precedent set by `pc_sync_spike.rs` and `store_commerce_spike.rs`.

## Finding 1 — Hue supports two bridgeless paths, and both are real

### Bluetooth LE (since 2019)

Signify ships Bluetooth radios in most current bulbs and a separate "Philips Hue
Bluetooth" app. Philips' own FAQ states the limits plainly:

- **Up to 10 lights per Bluetooth control device** (one phone or tablet).
- **~10 metre range**, versus whole-home coverage with a Bridge.
- **Local only** — no away-from-home control.
- **Basic timers and routines only** — no advanced automation.
- **Limited integrations** — Bluetooth, Alexa and Google, via a speaker acting
  as the intermediary rather than direct control.
- No multi-room control, no custom scenes.

Philips positions it for "small apartment lighting" or "single rooms".

### Matter over Thread (since September 2025, expanded June 2026)

This is the newer and more consequential path, and it is the one that will
actually matter to Mote.

- From September 2025, new Hue bulbs support **Matter over Thread**, so they can
  be commissioned directly into a Thread network with no Hue Bridge.
- Philips' Matter support guide documents a "Without a Bridge (Direct Setup)"
  path, and is explicit that it requires a **Thread Border Router** — a HomePod
  mini, Nest Hub (2nd gen), Echo (4th gen) or equivalent.
- Philips is equally explicit about what direct Matter costs you: it works only
  with Matter-enabled lights, and loses Apple adaptive lighting, entertainment
  sync, gradient lighting and dynamic scenes.
- On **23 June 2026** Signify and Silicon Labs announced concurrent
  multiprotocol on selected Hue products — Zigbee and Matter over Thread running
  simultaneously on one chip, so a bulb no longer has to be committed to one or
  the other at commissioning. It is built on the Silicon Labs MG26 and SiMG301
  SoCs, with the enabling firmware update due later in 2026.
- That capability is **silicon-gated**. Bulbs without the MG26/SiMG301 cannot
  get it by firmware, so the installed base splits for years.

## Finding 2 — Neither path has an API a third party may use

| Path | Public specification | Vendor support for third-party apps |
| ---- | -------------------- | ----------------------------------- |
| Bridge CLIP v2 | Yes — the documentation set in [`docs/HUE/`](./HUE/README.md) | Yes. This is what Mote uses. |
| Bluetooth LE | **None.** Signify has never published a BLE specification. | None. |
| Matter over Thread | Yes — the Matter specification is public | Yes in principle, but the controller, not Hue, is the integration point. |

The Bluetooth path exists in the wild entirely through reverse engineering.
Working prior art does exist and is worth naming, because it proves feasibility
and simultaneously proves the cost:

- **Home Assistant's `hue_ble` integration** — the strongest proof point, since
  it is in HA core rather than a hobby repository.
- **`flip-dots/HueBLE`** — the Python library behind it. Supports power,
  brightness, colour temperature, XY colour, light name, and manufacturer/model/
  Zigbee address metadata.
- **`Mic92/hue-ble-ctl`**, **`walter5138/hue_ble_bash`** — smaller CLI probes
  that document the GATT layout. The control service is
  `932c32bd-0000-47a2-835a-a8d455b859dd` with on/off at
  `932c32bd-0002-47a2-835a-a8d455b859dd`; brightness and colour live under
  further undocumented services (`9da2ddf1-…`, `b8843add-…`).

Home Assistant's integration lists roughly ten *tested* models. Everything
outside that list is a coin toss, and there is no vendor commitment that any of
it keeps working after a firmware update.

## Finding 3 — a Windows PC cannot reach the lights at household scale

This is the finding that decides the spike, and it is a hardware constraint
rather than a software one.

### Bluetooth LE

- **Windows allows roughly 7 simultaneous Bluetooth connections in hardware, and
  3–4 in practice.** A second adapter does not raise the ceiling. Every BLE
  light needs its own live GATT connection while it is being controlled, so the
  PC runs out of connections somewhere around four lights — well below Philips'
  own 10-light cap, and far below what a Mote user has. Mote's whole premise is
  rooms, zones and scenes across a home.
- **Many desktops have no Bluetooth radio at all.** The Bridge path needs only
  the network the PC is already on.
- **Range is measured from the PC.** Philips' 10 metre figure assumes a phone
  you carry into the room. A tower under a desk is a fixed point, often on a
  different floor from half the lights.
- **Pairing is a manual, per-light ritual.** The light must be put into pairing
  mode first, either by factory reset or via the Hue app under Settings → Voice
  Assistants → Alexa/Google → Make Discoverable, and then bonded at the OS
  level.
- **Identity churns.** Hue BLE addresses are randomly generated and change on
  factory reset, so a reset light returns as a brand-new device with no history.
- **Bonding is adapter-bound.** Home Assistant documents that only the adapter
  used at setup can control the light afterwards; swap the dongle and every
  light must be set up again.
- **The obvious Rust crate does not cover it.** `btleplug` is host/central only
  and has no pairing or bonding support on any platform. Mote would need WinRT
  `DeviceInformation.Pairing` through the `windows` crate plus its own GATT
  layer, on top of a protocol nobody documents.

### Matter over Thread

- **A Windows PC has no 802.15.4 radio.** It cannot be a Thread node and it
  cannot be a Thread Border Router. Reaching a Matter-over-Thread bulb requires
  an existing Thread network fronted by somebody else's hub.
- To speak to those bulbs, Mote would have to become a **Matter controller** —
  implement or embed a full Matter stack (`rs-matter`, `matter.js`), handle BLE
  commissioning, fabric administration and multi-admin flows, and then sit
  behind a border router owned by Apple, Google or Amazon.
- The user still needs a hub. **The Hue Bridge is replaced by a HomePod, Nest
  Hub or Echo, not eliminated.** For a Windows-first product that is a worse
  requirement, not a better one, and it is not the thing the FAQ question is
  really asking about.
- Hue bulbs are Zigbee/Thread. There is no Matter-over-Wi-Fi Hue bulb that a PC
  could reach over the network it is already on.

## Finding 4 — what Mote would lose

| Mote capability | Bridge | Hue BLE | Matter direct |
| --------------- | ------ | ------- | ------------- |
| On/off, brightness, colour, colour temperature | Yes | Yes, per light, ~4 at a time | Yes, via a controller stack |
| Rooms, zones, grouped lights | Yes, bridge resources | No — Mote would have to invent and own grouping | Partial; Matter groups, not Hue rooms |
| Scenes, dynamic scenes, gradients | Yes | No | No, per Philips' own comparison |
| Real-time state (`/eventstream/clip/v2`) | Yes, one SSE connection | Per-light GATT notifications, bounded by the connection ceiling | Matter subscriptions |
| **PC Sync** | Yes, Entertainment API over DTLS | **Impossible** — no streaming path exists over BLE | **Impossible** — Philips lists entertainment sync as lost |
| Sync Box association | Yes | No | No |
| Away-from-home / cloud control | Planned, via Hue OAuth | No, local only by definition | Via the hub's ecosystem, not Mote |
| Stable v2 UUID identity | Yes | No — randomised MAC that changes on reset | Matter node/endpoint identity |

PC Sync is the line that ends the argument. It is a paid Pro feature, it is one
of only two dedicated feature pages on the website, and it cannot exist without
the Bridge's Entertainment streaming API. A bridgeless Mote is not a cheaper
Mote — it is a different, much smaller product.

## Verdict

1. **Keep the Bridge requirement for v1.** It is not a gap in the product; it is
   the reason the product works.
2. **Do not implement Hue Bluetooth LE.** An undocumented protocol, a ~4-light
   practical ceiling on Windows, optional PC hardware, per-light manual pairing,
   identity that churns on reset, no scenes, no rooms, no PC Sync, and a vendor
   who can break it in a firmware release. It would produce support load and
   one-star reviews out of proportion to any user it served, and it contradicts
   the multi-provider plan's own non-goal about reverse-engineered APIs.
3. **Matter is the real bridgeless answer, and it is a platform decision, not a
   Hue feature.** If Mote ever goes bridgeless it should be as a `matter`
   provider adapter under the
   [multi-provider platform plan](./multi-provider-platform-plan.md), reached
   through a border router, covering every Matter vendor rather than Hue alone.
   Revisit when the concurrent-multiprotocol firmware has actually shipped and
   the installed base has moved, and treat "the user must own a Thread border
   router" as a requirement to be stated honestly, not hidden.
4. **Correct the website wording** so it stays accurate as Matter spreads. See
   below.

## Optional follow-up probe

Only worth doing if the Bluetooth question needs to be closed with hardware
evidence rather than research. Time-box to one day; do not let it grow.

- [ ] Confirm the development PC has a Bluetooth LE radio.
- [ ] Put one Hue bulb in pairing mode via the Hue app's voice-assistant
      discoverable flow and bond it in Windows Settings.
- [ ] Add `src-tauri/examples/hue_ble_spike.rs` using `btleplug` to connect to
      the bonded light, read the control service, and toggle power.
- [ ] **The one measurement that matters:** connect and hold GATT connections to
      as many bulbs as possible at once and record where Windows refuses. If it
      is 4 or fewer, the question is permanently closed.
- [ ] Record brightness and colour write latency against the same operation over
      the Bridge.
- [ ] Delete the example and record the numbers in this document.

Exit criterion: the connection ceiling. Everything else is secondary, because a
transport that cannot hold a room's worth of lights cannot serve Mote's UI no
matter how fast or clean the protocol turns out to be.

## Website copy change

The current claim — `mote-website/src/routes/index.tsx:122` and
`mote-website/src/routes/guides.control-philips-hue-from-windows.tsx:53` — is
factually correct about Mote. It is over-broad about Hue: a reader who knows
their bulbs work in the Hue Bluetooth app, or who has commissioned them into
Apple Home over Matter, will read "does not connect directly to Bluetooth-only
lights" as either wrong or evasive.

"Do I need a Hue Bridge?" is also a high-intent search query, so the honest
answer is worth more than the short one. Suggested replacement, to be applied as
a separate copy change rather than as part of this spike:

> Yes. Mote Desktop controls lights through a compatible Hue Bridge on your
> local network. Hue's own Bluetooth and Matter setups can run without a Bridge,
> but they are limited to a handful of nearby lights and cannot provide the
> scenes, rooms and PC Sync that Mote is built around.

Do not soften it into an implied roadmap promise. Nothing in this spike commits
Mote to a bridgeless transport.

## Sources

Re-check all of these at implementation time; this area moved twice in twelve
months.

- Philips Hue — [How to connect Philips Hue without a Bridge?](https://www.philips-hue.com/en-us/explore-hue/faq/controls/how-to-connect-philips-hue-without-a-bridge)
- Philips Hue — [Philips Hue and Matter: Complete Setup & Support Guide](https://www.philips-hue.com/en-us/support/article/philips-hue-and-matter-complete-setup-and-support-guide/000012)
- Silicon Labs — [Signify Enhances Philips Hue Matter Support Through Collaboration with Silicon Labs (23 June 2026)](https://news.silabs.com/2026-06-23-Signify-Enhances-Philips-Hue-Matter-Support-Through-Collaboration-with-Silicon-Labs)
- HomeKit News — [Hue to Simultaneously Support Zigbee and Thread on the Same Bulb](https://homekitnews.com/2026/06/23/hue-to-simultaneously-support-zigbee-and-matter-on-the-same-bulb/)
- Home Assistant — [Philips Hue BLE integration](https://www.home-assistant.io/integrations/hue_ble/)
- [`flip-dots/HueBLE`](https://github.com/flip-dots/HueBLE)
- [`Mic92/hue-ble-ctl`](https://github.com/Mic92/hue-ble-ctl)
- [`deviceplug/btleplug`](https://github.com/deviceplug/btleplug)
- Microsoft Q&A — [How many BLE bonding/connections are supported by Windows?](https://learn.microsoft.com/en-us/answers/questions/452987/how-many-ble-bonding-connection-are-supported-by-w)
