# Changelog

User-visible changes to the application are recorded here. Versioning and
publication rules are defined in [docs/releasing.md](docs/releasing.md).

## Unreleased

### Highlights

- **Mote Pro is real.** Entitlements are read from the Microsoft Store licence,
  Pro can be bought from inside the app, and restoring on another machine is the
  same read once you are signed in to the account that owns it.
- PC Sync now needs Pro to start a session. Creating an entertainment area,
  positioning it, and running the colour test stay free, so you can confirm your
  hardware works before paying.
- Saving a second Hue Bridge now needs Pro. Pairing, re-pairing, and recovering
  your one bridge stay free.
- The title bar shows which tier the app is running as. In a development build
  that badge is also the switch between Free and Pro.
- Initial Microsoft Store release preparation is in progress.
- Reserved **Mote Desktop** as an EXE/MSI product in Microsoft Partner Center
  under publisher display name **Anton Vo**.
- Renamed the application and package identity to **Mote Desktop**, with
  publisher **Anton Vo** and permanent identifier `com.motedesktop.mote`.
- Completed the initial Store properties, declarations, certification notes,
  system requirements, and all-ages IARC questionnaire for the planned
  freemium release.

### Known issues

- Mote Pro cannot be bought yet. The add-on is submitted and publishes manually,
  so gated features refuse until it is published. A build carrying enforcement
  must not reach the Store before that happens.
- The custom dashboard layout and advanced widget composition are described as
  Pro but are not yet enforced.
- The Windows purchase and restore flows have not been exercised against a
  packaged Store build.
- Signing identity, live support/privacy URLs, package, and final `1.0.0`
  release scope have not been finalized.
