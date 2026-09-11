# AGENTS.md

Guidance for coding agents working in this repository.

Use the local Hue documentation instead of the public Hue developer site for
endpoint details. The public API reference is login-gated and is not reliable
for agent workflows.

Start with `docs/HUE/README.md`, then open the smallest relevant Markdown file
from that index. For current bridge work, prefer the Hue API v2 docs
(`core-concepts.md`, `hue-clip-api-v2.md`, and
`migration-guide-to-the-new-hue-api.md`) unless the task explicitly involves
legacy API v1 behavior, pairing, or a documented v1 fallback.

## Agent Efficiency & Token Budgeting

To prevent runaway costs and massive "thinking spirals" (which can exceed 20,000+ output tokens per prompt), coding agents must adhere strictly to these execution rules:

### 1. Enforce Separation of Concerns

Never attempt to write or refactor core state logic (SSE stream handlers, Tauri IPC bridging) and frontend micro-interactions (Tailwind transitions, framer-motion loops, CSS hover adjustments) in the same prompt or task execution. Break them into isolated, sequential steps.

### 2. Limit Thinking Effort

If you are operating as an reasoning/thinking model, restrict your internal reasoning loop by prioritizing explicit constraints over exploratory permutations. Only explore whats necessary to get the right picture to execute the given tasks.

### 3. Strict Output Formatting

- Skip all conceptual explanations, introductory pleasantries, and architectural justifications.
- Do not explain the code you have written unless explicitly asked.
- Use brief inline comments for complex lines instead of trailing text blocks.

## Stack

- **Frontend**: React + TypeScript, Vite, Tailwind CSS
- **Component library**: shadcn/ui (`base-maia` style, built on `@base-ui/react`, not Radix). Components live in `src/components/ui/` and are added with `bunx shadcn@latest add <name>`.
- **Routing**: TanStack Router with in-memory history for the desktop webview.
- **Icons**: lucide-react
- **Animations/interactions**: browser view transitions, `motion`, and dnd-kit for Home layout editing.
- **Backend**: Tauri 2 (Rust) desktop shell and IPC layer.
- **Package manager**: Bun

Use `package.json`, `components.json`, and the source files as the source of
truth for exact versions, installed libraries, and current feature structure.
The `@/*` path alias maps to `src/` through `tsconfig.json` and `vite.config.ts`.
`src/lib/utils.ts` exports the `cn()` class-merge helper.

## Commands

```bash
# Frontend dev server only
bun dev

# Tauri development app (starts Vite + desktop window)
bun tauri dev

# Frontend production build/typecheck
bun run build

# Tauri production build
bun tauri build

# Preview the built frontend
bun run preview
```

Rust is compiled by `tauri dev` / `tauri build` during normal development, so
do not run separate `cargo` commands unless you specifically need Rust-only
diagnostics.

## Architecture

The app discovers and controls Philips Hue lights through a local Hue Bridge.
Bridge communication is v2-first: use Hue API v2 for every resource and feature
it supports, and use Hue API v1 only as an explicit fallback or for functionality
not yet covered by v2. Local v2 calls use `https://{ip}/clip/v2/...`, with the
bridge's self-signed certificate accepted.

All persisted and UI-facing Hue resource ids should remain v2 UUIDs whenever
possible. Keep v1 ids as backend transport details unless a feature has no v2
identity.

Allowed non-v2 bridge communication includes:

- mDNS `_hue._tcp.local.` discovery
- `https://discovery.meethue.com/` fallback discovery
- CLIP link-button pairing via `POST http://{ip}/api`
- v1 light/sensor/device discovery fallbacks when a bridge lacks the v2
  discovery resource
- legacy effects or bridge features that are missing, incomplete, or rejected in
  v2
- future Hue features that are still under development and not yet exposed by v2

```text
React frontend --Tauri IPC--> Rust backend --Hue bridge client--> Hue Bridge
```

The ready-state UI is route-driven and optimized for the desktop webview.
Routes are defined in `src/router.tsx`; treat that file as the source of truth
for the current route map instead of relying on a hard-coded route list in this
guide. The router uses memory history because the desktop shell has no useful
URL bar.

## Frontend

The frontend is changing actively. Do not treat this guide as a complete
component, route, hook, or feature inventory. Before making frontend changes,
inspect the current files under `src/` and follow the nearby patterns.

Stable orientation:

- `src/main.tsx`, `src/App.tsx`, and `src/router.tsx` define app boot, shell
  state, and routing.
- `src/context/` contains shared application state providers.
- `src/features/` contains route-level and domain-specific feature UI. Prefer
  feature-local components, hooks, and utilities when behavior is not broadly
  reused.
- `src/components/` contains shared app components.
- `src/components/ui/` contains shadcn/base-ui primitives. Import them through
  `@/components/ui/...` and keep additions consistent with the local style.
- `src/hooks/` and `src/lib/` contain reusable cross-feature helpers.

When adding or changing UI, keep behavior close to the feature unless it is
clearly shared, and avoid updating this file with detailed component lists that
will drift during active feature work.

## Styling And Theming

`src/App.css` is the single stylesheet. It imports Tailwind and the shadcn layer,
defines OKLCH design tokens for light `:root` and `.dark`, sets view-transition
styles, and provides global app/window styling.

Use Tailwind utilities that reference tokens (`bg-background`,
`text-muted-foreground`, `border-border`, etc.). Do not add separate component
CSS files unless the architecture changes.

Theme preference is persisted as `themeMode` in `localStorage`. Valid values are
`light`, `dark`, and `system`. Dark mode is applied by toggling `.dark` on
`document.documentElement`.

## Rust Backend

Tauri commands live in `src-tauri/src/commands/`:

- `discovery.rs` - `discover-bridges`, `pair-bridge`, `get-hue-session`,
  `reset-hue-session`
- `lights.rs` - `get-hue-lights`, `set-light-state`, `set-light-color`
- `rooms.rs` - `get-hue-rooms`
- `zones.rs` - `get-hue-zones`
- `grouped_lights.rs` - `set-grouped-light-state`
- `scenes.rs` - `get-hue-scenes`, `activate-scene`
- `events.rs` - `start-hue-events`, `stop-hue-events`; guarded by managed
  `EventStreamState` so only one background SSE task runs.

`src-tauri/src/services/hue_client.rs` is the core Hue bridge client. It handles:

- mDNS discovery with cloud discovery fallback
- CLIP link-button pairing
- session restore and bridge rediscovery
- generic `get_v2` / `put_v2` helpers and explicit v1 fallback helpers
- light, room, zone, grouped light, scene, device, zigbee connectivity, and
  bridge resource mapping
- event stream parsing and Tauri event emission

Rooms aggregate lights through member devices' `light` services. Zones reference
light children directly. Light metadata and reachability come from `device` and
`zigbee_connectivity`.

`src-tauri/src/lib.rs` registers Tauri plugins, command handlers, managed
event-stream state, and Windows window styling for the border/shadow.

## Real-Time Sync

`run_event_stream` opens a persistent SSE connection to:

```text
https://{ip}/eventstream/clip/v2
```

It sends `hue-application-key` and `Accept: text/event-stream`, uses a streaming
reqwest client with no request timeout, accepts the bridge self-signed cert, and
reconnects with a 3s backoff.

The backend emits `hue-event` carrying `Vec<HueEventUpdate>`. Updates include:

- `type`
- `id`
- `on`
- `brightness`
- `xy`
- `mirek`

`HueResourcesProvider` matches `grouped_light` updates by
`id === roomZone.groupedLightId` and `light` updates by `id === light.id`.

## Storage

- Bridge info: Tauri store file `hue-store.json`
- Application key/API credential: system keyring service `com.motedesktop.mote`,
  account `hue-application-key`
- Theme preference: `localStorage` key `themeMode`
- Home custom layout: `localStorage` key `hue-dashboard-layout`
- Home grouping mode: `localStorage` key `hue-dashboard-grouping-mode`

## Hue Data Rules

- Frontend and backend app state use normalized Hue units: brightness is 0-100
  percent, transition duration is milliseconds, and color temperature is mireds.
- Convert only at transport boundaries. For v2, send brightness as
  `dimming.brightness` and transition duration as `dynamics.duration`. For v1
  fallback writes, convert brightness to legacy `bri` 1-254 and transition
  duration to `transitiontime` in 100ms units.
- Treat transition timing as command-local. `transitiontime` and
  `dynamics.duration` are not persisted by the bridge, so include them on every
  state write where timing matters.
- Color temperature is in mireds in API/backend/frontend state.
- The light drawer may display Kelvin using `1e6 / mirek`.
- All Hue resource ids used by the UI are v2 UUIDs whenever possible.
- Room/zone power and brightness controls must target their `grouped_light`
  resource id, not the room/zone resource id.

<!-- graft:start -->
## Graft — repo context graph

This repo is indexed in `graft/`: small linked markdown nodes that explain each
system and carry exact file:line spans, kept in sync with the code through git.

For ANY task here — understanding how something works, finding where code lives,
or scoping a change — get context from the graph before grepping or opening
source files. Re-ask freely (it's cheap) and reuse literal identifiers you
already have (symbol, error string, file name) as the query. New to this repo?
Run `graft map` first — a token-budgeted orientation (dir clusters, hubs,
hotspots), no LLM, no key.

- Run `graft ask "<your question>" --source` → ranked nodes with the relevant
  code spans inlined (each hit's ≤8-line crux by default; `--full` for whole
  definitions when the crux isn't enough). Match the tool to the task shape:
  for understanding or editing, the top node IS the answer — cite its
  `covers:` file:line spans and edit straight from `--source`. For
  exhaustive tasks ("every occurrence / every caller of this pattern"), ranked
  results are top-N, not complete — run `graft grep "<literal>"` instead
  (exhaustive over indexed files, grouped by enclosing symbol), falling back
  to raw `grep -rn` only for unindexed files.
- `graft skeleton <file>` → every definition's signature + span, ~10× cheaper
  than reading the file; use it to skim an API surface.
- `graft callers <symbol>` gives precomputed, exact edges — who calls this.
  Add `--direction out` for what it calls, or `--depth N` to walk
  transitively for the full blast radius. For structural questions, skip
  ranking and use this directly.
- Or browse: `graft/INDEX.md` lists every node; follow the links.
- Monorepos and folders of multiple repos rank fairly across sub-projects —
  hits carry `[scope/]` labels naming which one they're from. Narrow with
  `graft ask "<task>" --in <scope>/` once you know where you're working.

If a returned span is truncated ("+N more lines"), open the file at that exact
range before finalizing. Only open source files when a node genuinely lacks a
needed detail, and then at the exact file:line the node points to — never
re-read whole files.

After big code changes, refresh the graph with `graft build` (deterministic,
no API key, $0).
<!-- graft:end -->
