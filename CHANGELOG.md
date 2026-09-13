# Changelog

User-visible changes to the application are recorded here. Versioning and
publication rules are defined in [docs/releasing.md](docs/releasing.md).

## Unreleased

## [0.2.1] - 2026-09-13

### Fixes

- Buying Mote Pro failed before Microsoft's purchase window could open, and
  showed "The purchase did not go through". Nothing was charged. The purchase
  window now opens.

## [0.2.0] - 2026-09-13

### Highlights

- **Mote Pro is available.** It is one purchase from inside the app, read from
  your Microsoft Store licence, and restored on any PC signed in to the account
  that bought it.
- PC Sync now needs Pro to start a session. Creating an entertainment area,
  positioning it, and running the colour test stay free, so you can confirm your
  hardware works before paying.
- Saving a second Hue Bridge now needs Pro. Pairing, re-pairing, and recovering
  your one bridge stay free.
- Global keyboard shortcuts now need Pro. They can still be set up without it
  and start working the moment Pro is unlocked.
- Widgets hold one room, zone, or light for free, with no limit on how many
  widgets you keep. Several controls in one widget, multi-target toggle groups,
  pinning, and always-on-top need Pro.
- A custom home dashboard layout needs Pro; the standard grouping modes do not.
- Reaching a paid feature opens a dialog that explains what Pro includes and
  lets you buy it, rather than only saying no.
- The title bar shows whether the app is running as Free or Pro.
- **Send feedback from inside the app**, from the title bar or from Settings,
  under Help and legal. Email addresses, bridge addresses, identifiers,
  credentials, and file paths are removed before the report leaves your PC, an
  email address is only needed if you want a reply, and every report gets a
  reference you can quote to support.

### Known issues

- This is the first release where Mote Pro can be bought, so purchase and
  restore have not yet been exercised on a Store-installed build.
