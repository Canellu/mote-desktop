# Plan: Microsoft Store Release

Status: **0.6.0.0 is live in the Store** (confirmed installed by the owner
on 2026-09-24). Package-level history lives in the
[Store packaging and commerce spike](./windows-store-commerce-spike.md).
Last reviewed: **2026-09-24**. The phase checklists below predate the first
publication and have not been re-ticked item by item.

## Goal

Publish a stable Windows release of the app through Microsoft Store using the
shortest supportable path for the current Tauri 2 application.

The first Store release does not depend on cloud control, accounts, shared
homes, Household, calendar integration, Pomodoro, presence automation, or the
broader automation runtime. The first release includes a one-time **Mote Pro**
purchase for selected local features. The feature matrix, Microsoft commerce
spike, and production entitlement enforcement are submission requirements in
[monetization-and-stack-plan.md](./monetization-and-stack-plan.md).

## Recommended launch shape

- Windows 10 and Windows 11, x64 first.
- Freemium app with a useful essential-control tier and a one-time Mote Pro
  add-on at launch. Package identity, purchase/restore, offline, refund,
  enforcement, and certification behavior must pass before submission.
- Use MSIX with Microsoft Store commerce. The local packaging pipeline is proven,
  Partner Center conversion has been requested, and Store purchase/offline and
  packaged native-capability checks remain release gates.
- English Store listing first; add languages only when the app and support
  material are ready in those languages.

Tauri currently generates MSI and NSIS installers through its normal bundling
flow. The selected Store release uses the repository's separate MSIX packaging
workflow so normal development and non-Store bundling remain unchanged.

## Current repository state

As of 2026-09-24:

- The source identity is **Mote Desktop**, publisher **Anton Vo**, identifier
  `com.motedesktop.mote`, and package/crate name `mote-desktop`. The manifests
  are at `0.6.0`, tagged `v0.6.0`.
- The app ships to the Store as an MSIX. 0.6.0.0 is published; the Mote Pro
  durable add-on is live, with a 14-day reverse trial. Entitlements are
  enforced in Rust and the purchase flow opens the Store window.
- Privacy Policy, Terms of Use, and Support are published at
  `motedesktop.com/privacy`, `/terms`, and `/support` and linked from About &
  Support. In-app feedback posts to `motedesktop.com/api/feedback`.
- Production CSP and least-privilege opener capabilities are implemented; see
  the [security hardening audit](./security-hardening-audit.md).

Open items:

- Purchase, restore, offline licensing, the trial surviving a reinstall, and
  the startup task are unverified on a Store-installed build.
- 0.6.0's focus, presence, calendar, priority handoffs with PC Sync, and crash
  restoration have not had a physical Hue acceptance pass.
- A repeatable clean-machine release acceptance run has not been documented.
- Automatic analytics and crash reporting are not implemented.

## Phase 0: Product and publisher decisions

- [x] Choose **Mote** as the brand and **Mote Desktop** as the Store/product
      title.
- [x] Reserve **Mote Desktop** as an EXE/MSI product in Partner Center. The
      shorter **Mote** title was unavailable.
- [ ] Clear **Mote / Mote Desktop** for commercial use with the planned
      preliminary trademark and marketplace review. Store reservation is not
      trademark clearance.
- [x] Check initial Store-title and domain availability. `motedesktop.com` was
      available and selected; purchase is pending. The final public copy must
      continue to avoid implying official Philips Hue affiliation.
- [x] Choose the Partner Center publisher display name: **Anton Vo**. Confirm
      the final legal/signing identity before purchasing a code-signing method.
- [x] Choose `com.motedesktop.mote` as the permanent reverse-domain application
      identifier. Avoid changing it after release because it affects
      installation identity and stored data.
- [x] Activate `support@motedesktop.com` and publish a public support URL.
      `motedesktop.com` and its Domeneshop email are paid for and active, and
      `support@motedesktop.com` receives mail. `privacy@motedesktop.com` has not
      been created yet; until it is, the published privacy policy routes privacy
      requests to `support@motedesktop.com`.
- [x] Enroll in Partner Center with an **Individual** account. Re-check account
      eligibility and migrate/contact Partner Center support if required before
      launching paid features or conducting distribution as a business.
- [x] Create an EXE/MSI Partner Center product and reserve **Mote Desktop**.
- [ ] Record Partner Center ownership and recovery details outside the repository
      in an access-controlled business account.

Do not finalize installer identity, signing subjects, screenshots, or public
legal documents until these decisions are complete.

### Naming decision record

- Brand: **Mote**.
- Reserved Store/product title: **Mote Desktop**.
- Primary domain: `motedesktop.com` (purchased through Domeneshop and live, with
  its email service active).
- Mascot name: **Lumi**.
- Positioning: Mote controls the broader Philips Hue home, including lights,
  sensors, cameras, and other supported devices; it is not positioned only as
  a lighting app.
- Ordered fallback names: **Flint**, **Fleck**, **Facet**, then **Shard**.
- Trigger for using a fallback: Mote cannot be reserved, has an unacceptable
  trademark or marketplace conflict, or a suitable project domain cannot be
  obtained.
- No fallback is pre-cleared. Repeat the same Store, trademark, marketplace,
  domain, and affiliation checks before selecting one.

### Partner Center progress record (2026-08-12)

Completed and saved in the draft submission:

- Account type: **Individual**; publisher display name: **Anton Vo**.
- Product type: **EXE/MSI**; reserved product name: **Mote Desktop**.
- Primary category: **Utilities + tools**; secondary category: **Lifestyle**;
  no subcategory selected.
- A provisional privacy-policy text was entered directly in Partner Center.
  Replace it with the reviewed policy at `https://motedesktop.com/privacy`
  before certification.
- All product declarations were left unchecked: no non-Microsoft drivers or NT
  services, no completed accessibility-conformance claim, no pen/ink feature,
  and no generative-AI feature.
- Certification notes describe the unofficial Hue relationship, local Bridge
  and hardware requirements, link-button pairing, optional PC Sync/Sync Box,
  and the absence of non-Microsoft drivers or NT services.
- Optional hardware requirements were not declared. Memory, DirectX, dedicated
  GPU memory, processor, and graphics were left unspecified; microphone was not
  selected because PC Sync uses system-audio loopback rather than microphone
  capture.
- IARC questionnaire completed for the current free build: **All Other App
  Types**, no ratings-board/physical-media distribution, and current content/
  interaction questions answered no. Generated ratings include Microsoft/IARC
  3+, PEGI 3, ESRB Everyone, and equivalent all-ages ratings.

Still incomplete in Partner Center:

- Live Privacy, Support, and website URLs.
- Package URL and package metadata.
- Final Store listing copy and visual assets.
- Any availability/pricing fields not explicitly finalized in the submission.

Retake or update the IARC questionnaire when a shipped version adds in-app
digital purchases, remotely hosted roadmap/content, or user-to-user content.

## Phase 1: Freeze the first-release scope

Include:

- Bridge discovery, pairing, restore, reset, and bridge switching.
- Lights, rooms, zones, grouped lights, scenes, and live Hue events.
- Completed HDMI Sync Box functionality.
- Completed Windows PC Sync functionality and its documented limitations.
- Theme, window, tray, autostart, and local settings behavior already considered
  stable.
- Privacy, Support, Terms, version, and diagnostic entry points in Settings.
- Source-controlled release notes, an installed-version display, and a stable
  release-notes link. Public roadmap voting is explicitly post-launch.

Exclude from the release branch unless already complete and accepted:

- Cloud control and Hue OAuth.
- App accounts, homes, membership, and guest relay.
- Household subscriptions and unreviewed third-party checkout. The Store-managed
  Pro add-on and its entitlement enforcement are required v1 scope.
- Calendar, Pomodoro, presence rules, and the shared automation runtime.
- Cross-platform claims beyond the tested Windows release.

- [x] Create a written v1 feature inventory from the current routes and Settings
      tabs. See [v1-feature-inventory.md](./v1-feature-inventory.md).
- [ ] Hide or remove incomplete controls, placeholder screens, development
      actions, and claims about unavailable features. The
      [source audit](./release-surface-audit.md) is complete; runtime acceptance
      and raw backend-error normalization remain.
- [x] Document known limitations for support and certification reviewers. See
      [known-limitations.md](./known-limitations.md).
- [ ] Set a release-candidate cutoff after which only release-blocking fixes are
      accepted.

## Phase 2: Finalize application identity and metadata

Update all identity values together:

- [x] Set the package and Rust crate name to `mote-desktop`.
- [ ] Set the final release version in `package.json`, `src-tauri/Cargo.toml`,
      and `src-tauri/tauri.conf.json` (currently synchronized at `0.1.0`).
- [x] Set `productName`, permanent identifier, publisher, and window title in
      `src-tauri/tauri.conf.json`.
- [x] Replace the old product name in current user-facing application copy and
      installer-facing metadata.
- [x] Add the About/diagnostics view, legal links, and a source-controlled
      [Store listing draft](./microsoft-store-listing-copy.md).
- [ ] Finalize the Store listing copy against the accepted release candidate,
      live public URLs, legal review, and the packaging/commerce decision.
- [x] Move keyring writes to `com.motedesktop.mote`. No legacy credential,
      Tauri-store, or localStorage migration is required because the old
      identity was never distributed and local development can be reset.
- [x] Set publisher and copyright metadata to **Anton Vo**.

Keep versions synchronized. Define a simple release rule such as semantic
versioning and never reuse an already-published installer URL or version.

Release-version foundation required for the first submission:

- [x] Adopt semantic versioning and document what qualifies as major, minor,
      and patch changes.
- [x] Add an automated check that `package.json`, `src-tauri/Cargo.toml`, and
      `src-tauri/tauri.conf.json` contain the same version.
- [x] Create a source-controlled release-note format covering highlights,
      improvements, fixes, known issues, and migration notes where applicable.
- [ ] Show the installed app version and a stable release-notes link in
      Settings/About.
- [ ] Create an immutable annotated Git tag such as `v1.0.0` for every published
      build and verify that it matches the manifests, release notes, and installer
      path.

An automatic post-upgrade What's New dialog, public roadmap, feature-request
submission, and voting are post-launch work owned by
[feedback-roadmap-and-release-history-plan.md](./feedback-roadmap-and-release-history-plan.md).
They must not block the first Store submission.

## Phase 3: Privacy, legal, feedback, and support minimum

Use [feedback-analytics-and-legal-plan.md](./feedback-analytics-and-legal-plan.md)
as the detailed design.

Required before submission:

- [ ] Publish a Privacy Policy at a stable HTTPS URL.
- [ ] Publish Terms of Use or choose and declare the applicable standard license
      terms.
- [ ] Publish a Support page with contact instructions and known requirements.
- [x] Add Privacy, Terms, Support, and version links inside Settings/About. The
      stable URL targets still require deployment.
- [x] State clearly that the app is unofficial and requires compatible Philips
      Hue hardware on the same network for local features.
- [x] Document local storage of bridge metadata and OS-keychain storage of Hue
      credentials in the [Privacy Policy draft](./legal/privacy-policy.md).
- [x] Document network destinations and whether any information leaves the local
      network in the [Privacy Policy draft](./legal/privacy-policy.md).
- [ ] Provide deletion/contact instructions for any optional feedback email.
- [ ] Obtain a privacy/legal review appropriate to launch markets.

Analytics, crashes, and feedback:

- [x] Keep analytics and automatic crash uploads out of the first release. Add
      a persistent, user-initiated feedback button that prepares an editable
      email to `support@motedesktop.com`; nothing is sent automatically.
- [x] Limit optional feedback diagnostics to app version, Windows x64, and
      release channel. Exclude Hue data, addresses, credentials, and file paths.
- [ ] If telemetry ships, implement the closed event schema, redaction, default
      preference/disclosure, permanent opt-out, retention, and vendor configuration.
- [ ] Keep automatic telemetry free of names, email, Hue IDs/names, IPs, paths,
      credentials, screenshots, audio, captured frames, and persistent installation
      identifiers.
- [ ] Keep feedback email optional, empty by default, report-scoped, and separate
      from analytics identity.
- [ ] Verify the published Privacy Policy exactly matches the release binary.

## Phase 4: Production security hardening

- [x] Replace `app.security.csp: null` with the narrowest working production CSP.
      Allow only packaged assets and explicitly required HTTPS endpoints.
- [x] Audit every Tauri capability, plugin permission, command, event, URL opener,
      and file/network boundary for least privilege.
- [x] Confirm arbitrary frontend input cannot produce arbitrary Hue endpoints,
      filesystem paths, shell execution, or opened URLs.
- [x] Confirm Hue application keys, entertainment credentials, Sync Box tokens,
      bridge addresses, and personal paths never appear in production logs,
      analytics, crash metadata, clipboard data, or UI error reports.
- [x] Keep bridge self-signed-certificate exceptions scoped only to local Hue
      Bridge transport. Keep the Sync Box pinned-CA path intact.
- [ ] Validate update artifacts and manifests cryptographically before applying
      updates.
- [x] Remove development endpoints, debug menus, verbose tracing, source maps not
      intended for distribution, test credentials, and unused capabilities.
- [ ] Review bundled third-party licenses and create the required notices.
- [x] Run dependency vulnerability and license checks for Bun and Cargo locks.
      Results and remaining transitive warnings are recorded in the
      [security hardening audit](./security-hardening-audit.md).

Security hardening should be reviewed separately from frontend release polish.

## Phase 5: Store installer and signing

### Store-specific packaging configuration

The Store release uses the isolated MSIX manifest and build script recorded in
the packaging/commerce spike. Its defaults now use the exact Partner Center
identity recorded after conversion; never derive those values from the Tauri
identifier.

- [x] Select **MSIX + Microsoft Store commerce** for the Windows Store release.
- [x] Receive Partner Center's conversion result and record the exact package
      identity name, publisher, publisher ID, PFN, and product/Store ID.
- [ ] Rebuild the MSIX with the Store-assigned identity and submit it through a
      private flight.
- [ ] Verify install, launch, Store-managed update, rollback/replacement behavior,
      and uninstall with no forced restart.
- [ ] Decide per-user versus per-machine installation. Prefer per-user unless a
      tested feature requires elevation.
- [ ] Ensure uninstall removes binaries and autostart entries without deleting
      user data unexpectedly; document retained data.

### Code signing

- [ ] Select a code-signing method whose certificate chain is accepted by the
      Microsoft Trusted Root Program.
- [ ] Keep signing credentials in a protected CI signing service or hardware/
      managed key; never commit certificates, private keys, passwords, or tokens.
- [ ] Configure Tauri signing so the application executable, bundled PE files,
      and installer are signed.
- [ ] Timestamp signatures using a trusted timestamp service.
- [ ] Verify signatures and certificate subject on the final downloaded artifact.
- [ ] Document certificate renewal and emergency key-revocation procedures.

### Repeatable build

Recommended commands after the Store configuration exists:

```powershell
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun run build
bun tauri build --no-bundle
bun tauri bundle --config src-tauri/tauri.microsoftstore.conf.json
```

- [ ] Build from a clean, pinned Windows environment or CI runner.
- [ ] Record toolchain versions and artifact SHA-256 hashes.
- [ ] Produce and publish version-matched release notes and a dependency/license
      bill for the release.
- [ ] Retain the exact signed artifact submitted to Microsoft.

## Phase 6: Hosting and updates

For an MSI/EXE Store listing, Microsoft requires a direct, versioned HTTPS URL
to an immutable offline installer. The binary at a submitted URL must never be
replaced.

- [x] Choose **Cloudflare Pages** for the public static website.
- [ ] Choose and validate immutable installer hosting. **Cloudflare R2** behind
      a custom download domain is the leading candidate; Cloudflare Pages is not
      the installer host because its per-file limit may be too small for the
      offline WebView2 bundle.
- [ ] Use immutable paths such as
      `https://<download-host>/<product>/<version>/<signed-installer>.exe`.
- [ ] Set the correct binary content type and verify unauthenticated direct
      download from multiple regions.
- [ ] Never overwrite a published object; publish a new versioned URL.
- [ ] Configure monitoring so an expired certificate, missing file, or CDN error
      is detected quickly.
- [ ] Define retention so every active/certified installer remains available.

Updates:

- [ ] Add and configure the Tauri updater or another signed update mechanism.
- [ ] Separate stable and pre-release channels.
- [ ] Ensure Store builds check only the intended production channel.
- [ ] Test upgrade from the oldest supported version while preserving bridge,
      Sync Box, PC Sync, theme, layout, and autostart state.
- [ ] Test failed download, invalid signature, interrupted update, rollback or
      recovery, and an unavailable update service.
- [ ] Document the Partner Center update procedure: new version, new immutable
      installer URL, certification, and release notes.

## Phase 7: Release-candidate validation

### Automated gates

- [ ] Frozen dependency install succeeds.
- [ ] Formatting check, lint, TypeScript typecheck, frontend build, and Rust/Tauri
      production build pass.
- [ ] Rust unit/integration tests relevant to Hue, Sync Box, and PC Sync pass.
- [ ] No uncommitted generated files or secrets are included in the artifact.
- [ ] Installer and executable signatures verify after upload and download.
- [ ] Privacy/telemetry schema tests and redaction tests pass if telemetry ships.

### Clean-machine matrix

Test on clean, supported Windows installations rather than only the development
machine:

- [ ] Windows 10 x64 and Windows 11 x64 with current security updates.
- [ ] Standard non-administrator user.
- [ ] Fresh install, silent install, normal launch, upgrade, repair where
      applicable, and uninstall.
- [ ] First launch without a Hue Bridge, offline launch, firewall denial, and
      recovery when connectivity returns.
- [ ] Bridge discovery, manual/fallback discovery, link-button pairing, credential
      restore, bridge switching, reset, and unreachable bridge behavior.
- [ ] Light/room/zone/scene control and event-stream reconnect behavior.
- [ ] Sync Box discovery, pairing, token restore, pinned TLS, unsupported firmware,
      and disconnect/reconnect behavior on approved hardware.
- [ ] PC Sync Video, Games, Music, selected displays, HDR/SDR, audio devices,
      minimize/tray, stop modes, display/audio removal, takeover, crash, and state
      restoration on approved hardware.
- [ ] Autostart enable/disable and cleanup on uninstall.
- [ ] High-DPI scaling, minimum window size, keyboard-only navigation, screen
      reader labels for primary actions, light/dark/system themes, and reduced motion.
- [ ] No secrets or personal/Hue household values in logs, diagnostics, crashes,
      or feedback preview.

### Beta before public release

- [ ] Use a private/audience-limited Store listing or controlled installer cohort
      for the release candidate.
- [ ] Collect explicit tester confirmation for install/update/uninstall, bridge
      pairing, Sync Box, PC Sync, and recovery cases.
- [ ] Fix only release blockers after the release-candidate cutoff and repeat the
      affected matrix.

## Phase 8: Partner Center submission

- [ ] Complete markets, discoverability, Free app pricing, one-time Mote Pro
      add-on pricing, and release timing.
- [x] Complete the initial category, age rating, product declarations, system
      requirements, and provisional privacy-policy entry accurately for the
      current freemium release plan.
- [ ] Re-check those answers against the final release binary and complete the
      remaining device-family/package architecture fields.
- [ ] Declare any third-party commerce only if it exists in the submitted binary.
- [ ] Enter the stable Privacy Policy, Support, and website URLs.
- [ ] Add the selected package, x64 architecture, English language, and every
      package-type-specific submission field.
- [x] Provide the reserved product name **Mote Desktop** and Partner Center
      publisher display name **Anton Vo**.
- [ ] Review and enter the source-controlled
      [Store listing draft](./microsoft-store-listing-copy.md), including its
      description, short description, feature list, applicable license
      terms, system requirements, copyright/trademark information, and support
      contact.
      Include a concise invitation such as: **“Missing a feature that would make
      Mote Desktop more useful? Send us a request. Mote Desktop is actively
      developed, and your ideas can help shape future releases.”** Do not imply
      that every request will be implemented or promise a delivery date.
- [ ] Upload final Store logos and at least four representative screenshots.
- [ ] State hardware/network requirements clearly: compatible Hue Bridge and
      lights; Sync Box and entertainment area where applicable; local network;
      Windows-only PC Sync requirements.
- [ ] Give certification reviewers concise setup instructions. If hardware-only
      functionality cannot be exercised normally, explain it without supplying real
      user credentials or weakening production security.
- [ ] Review the current Microsoft Store Policies immediately before submission.
- [ ] Submit for certification and record every certification warning/failure in
      the release issue.

Minimum listing requirements currently include a description, at least one
screenshot, square Store art, applicable license terms, package information, and
the required availability/properties declarations. Prefer a more complete
listing than the minimum.

## Phase 9: Launch and operations

- [ ] Choose manual release after certification rather than an unobserved launch
      if Partner Center offers the option.
- [ ] Confirm installer URL, Privacy, Terms, Support, and update endpoints before
      making the listing public.
- [ ] Install from the public Store listing on a clean device.
- [ ] Monitor crashes, feedback, support mail, installer/CDN health, Store reviews,
      and update adoption without collecting prohibited or undisclosed data.
- [ ] Publish a known-issues page and response process.
- [ ] Define severity levels and an emergency release procedure.
- [ ] For every update: increment versions, rebuild from clean sources, sign,
      test upgrade, publish a new immutable URL, submit it to Partner Center, and
      retain the previous certified artifact; publish matching release notes and an
      immutable Git tag.
- [ ] Schedule periodic reviews of Store policy, certificates, dependencies,
      privacy disclosures, retention, and vendor settings.

## Release gate

The first Store submission is ready only when all of these are true:

- [ ] Final name, publisher, identifier, and Partner Center reservation exist.
- [ ] v1 scope is frozen and contains no unfinished surfaces.
- [ ] Privacy, Terms/license, Support, and required in-app links are live.
- [ ] Production CSP and permission/security review are complete.
- [ ] Signed offline installer builds reproducibly and installs silently.
- [ ] Manifest versions, release notes, Git tag, and installer path agree.
- [ ] Versioned immutable HTTPS hosting and signed updates are tested.
- [ ] Clean Windows 10/11 and Hue hardware acceptance passes.
- [ ] Listing assets, declarations, requirements, and reviewer notes are complete.
- [ ] Mote Pro purchase, restore, offline license, refund/revocation, downgrade,
      Rust enforcement, and frontend locked states pass release acceptance.
- [ ] A rollback/emergency-update and support process exists.

## Immediate next actions

1. Treat the updated
   [Free/Pro/Household feature matrix](./free-pro-feature-matrix.md) as the v1
   product boundary. Free includes one standard single-target widget; Pro owns
   PC Sync, advanced/additional widgets, custom dashboard layout, and multiple
   saved bridges.
2. Continue the selected MSIX packaging/commerce path: use the completed Partner
   Center conversion to prove package identity plus Microsoft
   durable-add-on discovery, purchase, restore, and cached offline licensing.
   Follow the restartable checklist in
   [windows-store-commerce-spike.md](./windows-store-commerce-spike.md).
3. After those validation gates pass, complete the production enforcement phase
   in the feature matrix: connect the provider-neutral Rust entitlement
   foundation to managed state and the Store adapter, enforce every paid command,
   and only then add purchase, restore, and locked-state UI.
4. Done. The Domeneshop order for `motedesktop.com` and its email service was
   paid for and activated (quoted at NOK 568/year including VAT).
5. Largely done. The separate `mote-website` repository exists, the public site
   and its legal and support routes are built and deployed through Cloudflare
   Pages, and the Domeneshop email DNS records are preserved.
   `support@motedesktop.com` is live; `privacy@motedesktop.com` is still to be
   created.
6. Complete preliminary trademark/marketplace clearance and choose the final
   signing identity. The application identifier is now fixed as
   `com.motedesktop.mote`.
7. Implement the legal/support minimum. The current v1 decision remains no
   analytics, automatic crash uploads, or in-app feedback uploader.

## Official references

- [Tauri Microsoft Store guide](https://v2.tauri.app/distribute/microsoft-store/)
- [Tauri Windows installer guide](https://v2.tauri.app/distribute/windows-installer/)
- [Microsoft: distribute a Win32 app through Store](https://learn.microsoft.com/windows/apps/distribute-through-store/how-to-distribute-your-win32-app-through-microsoft-store)
- [Microsoft: MSI/EXE package requirements](https://learn.microsoft.com/windows/apps/publish/publish-your-app/msi/app-package-requirements)
- [Microsoft: MSI/EXE submission checklist](https://learn.microsoft.com/windows/apps/publish/publish-your-app/msi/create-app-submission)
- [Microsoft Store Policies](https://learn.microsoft.com/windows/apps/publish/store-policies)

External requirements change. Re-check these primary sources when implementing
packaging and immediately before every submission.
