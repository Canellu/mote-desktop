# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Mote Desktop uses a React web interface inside a Tauri desktop shell. The
repository currently targets Windows desktop workflows.

## Users

People controlling their home's Philips Hue lighting from their desktop.

## Product Purpose

Discover and connect to a Hue Bridge, organize and control lights, and recall
room and zone scenes. Home currently presents a dashboard of rooms and zones.

## Capabilities and Constraints

- Existing room, zone, light, and scene controls are grounded in the repository's
  current implementation, not the future roadmap.
- Hue operations are v2-first. Local endpoint documentation lives in `docs/HUE/`.
- The app can save multiple bridges and currently controls one active bridge.
- The proposed Home Map lets users draw, divide, combine, and name spaces,
  position lights, and control lighting through the map.
- The user confirmed on 2026-09-06 that map creation should offer both quick
  snapping and measured drawing with dimensions. Home Map remains a proposal.
- Shared homes and multiple providers are future plans, not current capabilities.

## Evidence on Hand

- `AGENTS.md`, `package.json`, `src/router.tsx`, and current source files.
- `src/features/home-screen/` and `src/features/space-screen/`.
- `store-assets/screenshots/raw/01-dashboard.png`, checked against current Home
  components and `src/App.css` for planning context.
- `docs/plan-index.md` distinguishes implemented features from proposals.
