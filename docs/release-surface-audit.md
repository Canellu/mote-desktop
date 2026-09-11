# v1 release-surface audit

Status: **source audit complete; runtime and hardware acceptance pending**.

Last reviewed: **2026-08-13**.

This audit checks the routes and Settings surfaces in the
[v1 feature inventory](./v1-feature-inventory.md) for placeholder features,
development controls, unavailable-feature claims, and obvious release-facing
privacy problems. It does not replace clean-machine, accessibility, Windows, or
Hue-hardware acceptance testing.

## Results

| Surface                                 | Source-audit result                                                                       | Release follow-up                                                                   |
| --------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Setup and bridge pairing                | Included; development preview data is gated by `import.meta.env.DEV` and `VITE_DEV_VIEWS` | Test zero, one, and multiple discovered bridges plus offline/fallback discovery     |
| Home dashboard                          | Included; no release-facing placeholder feature found                                     | Test empty, loading, disconnected, large-home, and custom-layout states             |
| Room and zone control                   | Included; no release-facing placeholder feature found                                     | Test mixed light capabilities, unavailable lights, scenes, and SSE reconnect        |
| Device discovery                        | Included; form placeholders are input examples, not unfinished features                   | Test every discovery method supported by available launch hardware                  |
| Room/zone wizard                        | Included; dummy members are development-only                                              | Test create, cancel, validation, and partial-failure behavior                       |
| Entertainment-area wizard and placement | Included; no release-facing placeholder feature found                                     | Test capability rejection, positioning, color test, save, and cancel                |
| PC Sync                                 | Included for Windows; no placeholder control found                                        | Complete the PC Sync hardware/driver/HDR/audio acceptance matrix                    |
| Sync Box                                | Included for the current single-box model                                                 | Test discovery, pairing, restore, unsupported firmware, disconnect, and reset       |
| Widgets                                 | Included; dummy targets are development-only                                              | Test many simultaneous widgets, persistence, placement, DPI, and monitor removal    |
| General Settings                        | Included                                                                                  | Test tray, close behavior, autostart, uninstall cleanup, and standard-user behavior |
| About & Support                         | Added for v1                                                                              | Verify the public URLs after deployment and re-check final legal text               |

## Findings fixed during the audit

- Removed the production UI path that revealed and copied the Hue application
  key. Settings now reports only whether the key is saved securely.
- Limited raw React error and component-stack details to development builds.
- Limited raw error-boundary console logging to development builds.
- Confirmed the component gallery, device gallery, mock setup states, mock
  widget targets, mock room/zone members, and development URL bar require a Vite
  development build and are not enabled in production.

## Open release blockers

- Many feature-level error states still render raw backend error strings. Audit
  and normalize them before release so addresses, identifiers, credentials, and
  personal paths cannot reach UI errors or production logs.
- About/Support URLs use the planned stable `motedesktop.com` paths but will not
  work until the static site is deployed.
- Runtime behavior, visual states, keyboard navigation, DPI behavior, and real
  Hue hardware combinations still require the Phase 7 acceptance run.
- Store packaging, production CSP, least-privilege capabilities, signing,
  updater verification, and clean-machine installation remain outside this UI
  audit.
