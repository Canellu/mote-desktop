# Windows Store packaging and commerce spike

Status: **0.2.5.0 is live in the Store with Pro enforcement, the purchase
window fix, the in-app update notice and progress, a desktop shortcut, and
restart after a Store update, and the Mote Pro add-on is live at NOK 149.
0.3.0.0, which adds the 14-day Pro trial and starts Mote at sign-in by default,
is in certification and publishes automatically. Purchase, restore, offline
licensing, the trial surviving a reinstall, and the startup task are still
unverified on a Store-installed build.**

Last reviewed: **2026-09-15**.

What changed on 2026-09-15: 0.2.5.0 published. 0.3.0.0 went to certification
as Submission 9 (`1152921505701893993`), carrying `MoteDesktop_0.3.0.0_x64.msix`
(9,796,931 bytes, SHA-256
`CB2EEC5200FCFDD69A58F9B08AFACF55B16C140D580774D4C4C2ECE94540E680`, tag `v0.3.0`
at `89f9bf8`), set to publish as soon as it passes. The package declares a
`uap5:StartupTask` (`MoteDesktopStartup`, enabled), because the registry Run
entry the app used to write is kept in a packaged app's private registry copy
and never read at sign-in; MakeAppx accepted the manifest. The listing's
description, short description, and what's new describe the trial, and the notes
for certification explain that no trial starts without Hue hardware and how the
startup task is switched off. The website's features pages, privacy policy, and
terms were updated for the trial the same day, effective 15 September 2026.

What changed late on 2026-09-14: 0.2.4.0 published. 0.2.5.0 went to
certification as Submission 8 (`1152921505701890472`), carrying
`MoteDesktop_0.2.5.0_x64.msix` (9,760,140 bytes, SHA-256
`08228F0C3016AEBABE5FB935A67D4C484DCDC1DF10D8E78FA527CDE5D248E05B`, tag `v0.2.5`
at `102bfb4`), set to publish as soon as it passes. The install command now
forwards `StorePackageUpdateStatus` progress as a `store-update-progress` event,
skipping `Pending` so nothing warns about closing while Microsoft's dialog is
open.

What changed in the evening of 2026-09-14: 0.2.3.0 published. Installing it
through the title-bar Update button worked but left Mote closed, because the app
never registered for restart; 0.2.4.0 calls `RegisterApplicationRestart` before
requesting the install. 0.2.4.0 went to certification as Submission 7
(`1152921505701889847`), carrying `MoteDesktop_0.2.4.0_x64.msix` (9,763,270
bytes, SHA-256
`0E615BE5F53DC21E99E9349139D94DED37D1C4601370A59F5B1F6B2B910064F8`, tag `v0.2.4`
at `bf95645`), set to publish as soon as it passes. The package now declares a
`desktop7:Shortcut`. A locally registered test identity confirmed that install
creates it without a `.lnk` in the package, uninstall removes it, and an update
recreates it after it was deleted.

What changed later on 2026-09-14: 0.2.2.0 published and was installed from the
Store, and the Settings Updates row appeared. 0.2.3.0 went to certification as
Submission 6 (`1152921505701882278`), carrying `MoteDesktop_0.2.3.0_x64.msix`
(9,673,019 bytes, SHA-256
`04C23F4DD4F83B66F5BCFA5F8D18673333DEE13B90B4345A4E052E232659AACA`, tag `v0.2.3`
at `f549e88`), set to publish as soon as it passes. It is the first release a
0.2.2.0 install can see through the title-bar Update button.

What changed on 2026-09-14: 0.2.1.0 published. 0.2.2.0 went to certification
as Submission 5 (`1152921505701881948`), carrying
`MoteDesktop_0.2.2.0_x64.msix` (9,662,075 bytes, SHA-256
`B9E5E02057EEC7658026EDDEF6567277D3F44BD721B85C38660D2A81EA29753B`, tag `v0.2.2`
at `15c331c`). The package now carries targetsize unplated icons indexed in a
single `resources.pri`, and the app checks the Store for updates through
`check-store-update` and `install-store-update`. The update install also parents
its UI to the main window, the same requirement the 0.2.0 purchase failure
exposed.

What changed later on 2026-09-13: 0.2.0.0 published and was installed from the
Store. The gates and the paywall worked and the price loaded (kr 149,00), but
buying ended with "The purchase did not go through". The Windows
`Microsoft-Windows-Store/Operational` log recorded `RequestPurchaseAsync` for
`9P3J5KCBFVQZ` rejected with `ERROR_INVALID_WINDOW_HANDLE` (1400).
`purchase_mote_pro` took a `StoreContext` from `GetDefault` and never
initialised it with the main window, and the association the diagnostic set
does not carry over to it. Nothing was charged. `b09927b` initialises that exact
context through `IInitializeWithWindow`. 0.2.1.0 (tag `v0.2.1`, 9,533,271 bytes,
SHA-256 `4A49B6C0FE95941227919858EE906668F7506304DD34BF93B096FC3EEDF28A3C`) went
to certification as Submission 4 (`1152921505701881766`), set to publish
automatically.

The lesson for this checklist: product and licence reads need no window, so a
paywall that shows a price proves nothing about the purchase call. Only a
Store-installed build that reaches Microsoft's purchase dialog does.

What changed on 2026-09-13: the `mote-pro` add-on was published and confirmed in
the public catalog (Store ID `9P3J5KCBFVQZ`, NOK 149). The listing-only
Submission 2 was published. Submission 3 (`1152921505701881246`) carries
`MoteDesktop_0.2.0.0_x64.msix` (9,526,748 bytes, SHA-256
`76EF491F9FACF1AC037D6C2BB7FE39D633BE43B6E63799FA9936D7E68D5D68EF`, tag `v0.2.0`
at `ee95de8`). It was built with `scripts/build-msix-spike.ps1` under the Store
identity, with a strip and LTO release profile, and without the commerce
diagnostic. It went to certification set to publish as soon as it passes. The
notes for certification now explain how to reach the paywall without Hue
hardware. No purchase has been made against the live add-on.

What changed on 2026-09-11: the parent listing went to certification, the
`mote-pro` durable add-on was submitted (hidden, purchasable only from within
the parent, NOK 149 base across 240 markets), and the app grew a cached Store
entitlement provider, purchase and refresh commands, and enforcement on PC Sync
and the second saved bridge.

The guardrail below saying the add-on's audience "does not authorize submission
or publication" was lifted by the owner on 2026-09-11. It is left in place as
the record of what the spike originally assumed.

## Goal

Determine whether Mote Desktop should replace its current EXE/MSI + NSIS Store
direction with MSIX so the Windows release can use a Microsoft Store durable
add-on for the one-time Mote Pro purchase.

This began as a disposable technical spike rather than production entitlement or
paywall implementation, with a rule against gating user features until it passed.
The package decision is now recorded — MSIX, shipped — and production entitlement
lives in `src-tauri/src/services/entitlements.rs` rather than here. What remains
in this file is the packaging and commerce record; read the feature matrix for
what is actually gated.

## Questions the spike must answer

1. Can the existing **Mote Desktop** Partner Center product accept an MSIX
   package/submission, or is a different product or product-type migration
   required?
2. Can the Tauri application be packaged with the Partner Center identity and
   installed, launched, updated, and removed correctly as MSIX?
3. Can Rust call `Windows.Services.Store` to discover, purchase, restore, and
   read the cached license for a durable **Mote Pro** add-on?
4. Does the packaged full-trust application retain required Windows behavior,
   especially PC Sync screen/audio capture, widgets, tray, start-on-login,
   keyring access, local Hue networking, and Sync Box networking?
5. Is MSIX plus Store-managed commerce/updates a smaller supported release
   surface than NSIS plus separate licensing, hosting, signing, and updates?

## Guardrails

- Do not delete, rename, or publish the existing Partner Center product while
  investigating its package options.
- Keep the paid add-on hidden from Store discovery and purchasable only through
  its parent app. Its public audience does not authorize submission or
  publication.
- Do not add production feature gates, account linking, or Household behavior
  in this spike.
- Keep Store-specific identifiers inside a Windows adapter or spike module.
- Do not commit certificates, Partner Center credentials, Store identity keys,
  transaction data, or other secrets.
- Preserve the normal development and current NSIS configurations until the
  final package decision is made.

## Prerequisites

- [x] Access to the existing Mote Desktop product in Partner Center.
- [ ] A separate Windows user profile or clean VM for install testing. The
      current development host is available for initial checks.
- [x] Windows SDK `makeappx.exe` and `signtool.exe` are installed for x64 under
      SDK version `10.0.19041.0`.
- [x] A published parent-app package suitable for Store-license testing. The
      add-on cannot be submitted before the parent app is published; the parent
      is live, which is what let the add-on go on 2026-09-11.
- [x] A hidden durable **Mote Pro** add-on with the permanent internal product ID
      `mote-pro`, Store ID `9P3J5KCBFVQZ`. Submitted 2026-09-11 with a public
      audience, hidden from Store discovery, purchasable only through the parent
      app, and set to publish manually so it is not live until someone says so.

## Work checklist

### 1. Record the current Partner Center identity

- [x] Record the product type and self-service package controls. The existing
      product is EXE/MSI and exposes no self-service MSIX conversion control.
- [x] Confirm that Partner Center support can assist with conversion to MSIX if
      requested. Coordinate the conversion only after approving the MSIX
      direction and confirming which existing product properties are preserved.
- [x] Record the Store-provided package identity name, publisher, publisher ID,
      package family name, product/Store ID, and supported architectures in a
      private release record. Do not invent these values from
      `com.motedesktop.mote`.
- [ ] Stop and document the blocker if migration would lose the reserved name,
      reviews, ownership, or another material product property.

### 2. Produce a minimal MSIX package

- [x] Build the normal Tauri release executable from the current worktree with
      `bun tauri build --no-bundle`.
- [x] Add an isolated, parameterized MSIX spike pipeline in
      `scripts/build-msix-spike.ps1` and
      `src-tauri/msix/AppxManifest.xml.template`. It does not alter normal Tauri
      or NSIS configuration and does not guess Store identity values.
- [x] Package and sign the x64 app with an explicit temporary test identity.
      Verify `Windows.Desktop`, `runFullTrust`, package contents, signature hash,
      and the expected untrusted-test-certificate install boundary.
- [ ] Repeat the release build from a clean release-candidate checkout.
- [x] Configure the MSIX packaging script to use the exact Partner
      Center identity and a full-trust desktop entry point.
- [x] Include required icons and metadata without changing normal development
      packaging.
- [ ] Install, launch, update, and uninstall the package on the test profile.
- [ ] Verify app data, Windows Credential Manager entries, shortcuts, protocol
      registration where applicable, and uninstall behavior.
- [ ] Record the commands, tool versions, package version, signer, artifact hash,
      and any manual steps needed to reproduce the package.

### 3. Prove Microsoft Store commerce

- [x] Add a Windows-only Rust diagnostic for `Windows.Services.Store` app
      license, durable product discovery, and cached add-on licenses.
- [x] Include the diagnostic executable in the disposable MSIX so it can be run
      with package identity after the package is installed and Store-associated.
- [x] Associate Store UI calls with the main Tauri window handle.
- [x] Query associated durable add-ons and return only sanitized product state,
      localized title, and localized price to the frontend or a diagnostic view.
- [ ] Invoke Microsoft's purchase UI from an explicit test action.
- [x] Read `GetAppLicenseAsync` and map the add-on into a provider-neutral
      `pro: active | inactive | unknown` result.
- [ ] Confirm relaunch and restore behavior while signed into the purchasing
      Microsoft account.
- [ ] Confirm the cached active license behavior while offline.
- [x] Confirm that no purchase flag stored in frontend state or localStorage can
      grant Pro. Audited 2026-09-11 by tracing every writer. In a release build
      the only thing that writes the entitlement cache is `apply_store_snapshot`,
      reached solely from `refresh-entitlements`, whose value comes from the
      Store licence read. The mutable debug provider is
      `#[cfg(any(test, debug_assertions))]` and is not compiled into release at
      all, so `set-debug-entitlements` has nothing to set and returns an error.
      Both gates run in Rust; the frontend `hasPro` only decides what is drawn.
- [ ] Record which refund/revocation states can be exercised in the test
      environment and defer the rest explicitly to certification testing.

## Progress evidence — 2026-08-14

- Added `src-tauri/examples/store_commerce_spike.rs` using `windows` `0.62.2`.
  It reports package identity, current-app license state, cached durable add-on
  licenses, associated durable products, localized titles/prices, and collection
  state without returning customer or transaction identity.
- Added direct Windows-only `windows` and `windows-collections` dependencies.
- `cargo check --example store_commerce_spike` passes.
- `bun tauri build --no-bundle` passes and produced the normal x64 release
  executable. The local artifact was 24,232,960 bytes with SHA-256
  `79CCC7C82DEEC30F48CB83AFB613AD99EA8F0EA00319CE192A477593022A5F9D`.
- Running `cargo run --example store_commerce_spike` outside an installed package
  correctly reported no package identity (`0x80073D54`). The current-app license
  call returned an active non-trial placeholder with an empty SKU, demonstrating
  that this value alone must not grant Pro. Associated durable-product discovery
  returned `0x803F6107`, with no products or add-on licenses.
- This run proves compilation and the expected unpackaged boundary only. It does
  not prove Store association, add-on discovery, purchase, restore, cached
  offline licensing, refund/revocation, or MSIX compatibility.

## Progress evidence — 2026-09-01

- Partner Center converted the existing product to **MSIX or PWA app**. The exact
  Store identity and product identifiers are recorded in the private local
  release record and are now the defaults in the MSIX build script.
- Added `scripts/build-msix-spike.ps1` and
  `src-tauri/msix/AppxManifest.xml.template`. The pipeline accepts exact identity
  and publisher values as parameters, builds the Tauri app and commerce
  diagnostic, stages only the required payload, packages with `makeappx.exe`,
  optionally signs with an ephemeral self-signed certificate, exports only its
  public certificate, and removes the temporary private certificate.
- Windows SDK `10.0.19041.0` successfully produced and signed
  `MoteDesktop_0.1.0.0_x64.msix` using the explicit temporary identity
  `MoteDesktop.MsixSpike`; this is not a Store identity and must never be used for
  submission.
- Package SHA-256:
  `F0F29FB437DB61C76FBE4CCFC173CA06ACB796023592A148C036C5A9392B54F6`.
  Main executable SHA-256:
  `18BC6F4078611ECCEEA3A0209B2E3671C49281342EB5647CEA294821594C3AC8`.
  Commerce diagnostic SHA-256:
  `0FD82BF4D27B3B54E3CAAF6376FC21C822B2846CFE8D04A3C6F182DDCAF8D2D7`.
- Unpacking the signed package verified the x64 identity, version `0.1.0.0`,
  `Windows.Desktop` target family, `runFullTrust`, app executable, and packaged
  commerce diagnostic. The package size was 10,425,037 bytes.
- Installation without trusting the temporary public certificate failed as
  expected with `0x800B0109`; no package was installed. A controlled test-profile
  run must trust the public test certificate in Local Machine `TrustedPeople`,
  install and exercise the package, then remove both package and certificate.
- This proves the local build/package/sign pipeline, not Store association,
  Store ingestion, durable-product discovery or purchase, offline licensing,
  update/uninstall behavior, or native capability compatibility.

### Store-identity rebuild after repository rename

- Cleared the generated Rust target cache after it retained absolute build paths
  to the former `hue-app` directory, then rebuilt cleanly from
  `D:\Documents\GitHub\mote-desktop`.
- Produced the unsigned Store-identity package
  `src-tauri/target/msix-spike/MoteDesktop_0.1.0.0_x64.msix` with identity
  `AntonVo.MoteDesktop`, publisher
  `CN=44112F90-AF39-497A-AE42-3BEEBE2299A7`, version `0.1.0.0`, and x64
  architecture.
- Package SHA-256:
  `ECCBE6C23B5ED3C3A6351EFDADD9069D84468D9AE49D8E514E82E20C0E28BAB6`.
  Main executable SHA-256:
  `D0B6EEFCBC7EF57DFC7A5129754758E35FE212C5C1B173BD5CFA2F48D2F69434`.
  Commerce diagnostic SHA-256:
  `BF60689E84F47607815B3C4DEA993A5861E710B3D8E439F6203BCC144D5CBE19`.
- Unpacked the package and verified the manifest identity, publisher, version,
  architecture, main executable, assets, and packaged commerce diagnostic. The
  package is 10,422,096 bytes.
- The package remains unsigned and has not been uploaded, installed, or sent to
  Microsoft.

### Main-app Store diagnostic boundary

- Added the read-only `get_store_commerce_diagnostic` Tauri command. It binds
  `StoreContext` to the main Mote Desktop window through
  `IInitializeWithWindow`, then reads the app license, cached durable add-on
  licenses, and associated durable products.
- The command returns only package state, license flags, Store/product IDs,
  in-app offer tokens, localized titles/prices, and collection state. It does
  not request a purchase or expose customer or transaction identity.
- The cached add-on license whose in-app offer token is `mote-pro` now maps to
  the provider-neutral Pro state. Only an active base app license plus an active
  matching add-on grants `active`; failed or ambiguous reads map to `unknown`,
  and an authoritative successful read without the add-on maps to `inactive`.
- The non-Windows response is explicitly unsupported, and failed window/package
  association returns a blocked diagnostic instead of granting Pro.
- `cargo check --manifest-path src-tauri/Cargo.toml` passes, as do four focused
  Store entitlement mapping tests. Store-associated runtime output remains
  pending until a Store-associated parent package and the hidden add-on are
  available.

### Partner Center parent-app draft — 2026-09-02

- Confirmed the existing **Mote Desktop** product, Store ID `9P910JMMP9SZ`, is
  an **MSIX or PWA app** and remains in draft. Submission 1 is
  `1152921505701789210`.
- Saved the English (United States) description, short description, copyright
  and trademark information, developer attribution, product features, and
  search terms from the source-controlled Store listing copy.
- Completed the IARC questionnaire as **All Other App Types**, with no
  ratings-relevant packaged content, user-content sharing, age-restricted
  products, precise-location sharing, chance-based purchases, cash rewards,
  browser/search-engine behavior, or directly issued board rating. Digital
  goods purchases are declared because the app offers Mote Pro.
- Accepted the IARC terms with the account holder's explicit authorization.
  Partner Center now reports **Age ratings: Complete**. Generated ratings are
  IARC and Microsoft **3+**, PEGI **3**, ESRB and USK **Everyone**, Chile and
  Russia **All ages**, and Brazil **14**; applicable boards show the
  **In-App Purchases** interactive element. The rating ID remains pending until
  the publication workflow advances.
- Partner Center reports **Pricing and availability**, **Properties**, **Age
  ratings**, and **Submission options** complete. **Packages** remains not
  started and was not opened for upload. **Store listings** remains incomplete
  because at least one required desktop screenshot has not been supplied.
- Account tax and electronic-bank-transfer payment profiles have been assigned
  to Microsoft Store earnings and are pending Microsoft validation. No tax,
  banking, customer, transaction, credential, or other sensitive value is
  recorded here.
- The parent submission remains in draft. It was not submitted for
  certification or published, and its disabled submission control was left
  untouched.

### Partner Center hidden add-on draft — 2026-09-02

- Inspected the existing **Mote Desktop** product and its add-on table before
  creation. The parent product is Store ID `9P910JMMP9SZ`, is an **MSIX or PWA
  app**, and remains in draft. The table reported zero existing add-ons, so no
  duplicate Mote Pro product was present.
- Created Store add-on `9P3J5KCBFVQZ` with internal Product ID `mote-pro` and
  product type **Durable**. Partner Center displays product lifetime **Forever**.
- Created draft Submission 1 (`1152921505701792702`). It was not submitted for
  certification or published.
- Saved **Public audience**. Discoverability remains **Hidden in the Microsoft
  Store**, with acquisition limited to purchase from within the parent app. The
  parent app and this add-on submission remain unpublished.
- Saved the publishing hold as **Publish manually**. Even after any future
  certification, a separate explicit **Publish now** action would be required.
- Added an English (United States) listing with display name **Mote Pro** and a
  short description derived from the source-controlled Store listing. Partner
  Center reports this listing as complete. No package or listing image was
  uploaded.
- Saved a base retail price of **NOK 149**. Partner Center will map this tier to
  corresponding local Store prices; those market conversions still require
  review before any submission.
- Completed **Properties** with lifetime **Forever**, content type **Electronic
  software download**, the same personal-information declaration and privacy
  policy URL as the parent app, and the existing Mote Desktop website and support
  URLs. Optional phone/address, keywords, and custom developer data remain blank.
- Completed **Age ratings** by selecting **This add-on does not require more
  restrictive ratings than its parent product**. Partner Center will apply the
  parent product's ratings after that product is published.
- **Pricing and availability** is complete. Partner Center now reports every
  submission section as complete. No audience identity, customer information,
  transaction data, credential, or secret was entered or recorded.
- Partner Center currently prevents add-on submission because the parent app is
  not published. Account tax and payout validation is pending.

Do not change the durable type, lifetime, or product ID without updating the
entitlement adapter and this record. Do not submit or publish until the parent
app, account-level commerce prerequisites, and release candidate are ready.

### 4. Run the native capability smoke test

- [ ] Local Hue discovery, pairing, HTTPS control, and event stream.
- [ ] PC Sync display capture in SDR and HDR where test hardware permits.
- [ ] PC Sync system-audio loopback.
- [ ] Widget creation, independent windows, placement, always-on-top, and
      persistence.
- [ ] Tray, close behavior, single-instance behavior, and start-on-login.
- [ ] Windows Credential Manager and application settings persistence across an
      update.
- [ ] Sync Box discovery, pairing, and control where hardware is available.
- [ ] Standard non-administrator install, launch, update, and uninstall.

## Evidence to retain

- Sanitized screenshots or text exports of Partner Center package/add-on setup.
- Reproducible packaging commands and configuration files.
- MSIX identity and version output.
- Sanitized Store product and entitlement responses containing no user or
  transaction identity.
- Offline/relaunch/restore results.
- Capability smoke-test results and every failure with reproduction steps.
- Artifact SHA-256 hashes. Do not retain or commit test customer data.

## Release validation criteria

**MSIX + Microsoft Store commerce** was selected on 2026-08-24. All of the
following remain release gates; reopen the decision if any gate fails without an
acceptable remedy:

- The existing product can use the required package route without unacceptable
  product migration loss.
- The package builds reproducibly and passes install/update/uninstall checks.
- The Store durable add-on can be discovered, purchased, restored, and read from
  an offline cache through the Rust boundary.
- The packaged app retains the native capabilities required by the v1 inventory.
- Store-managed updates and commerce materially remove more release complexity
  than MSIX packaging adds.

## Failure and fallback

If any pass criterion fails, record the exact reason and choose one of these
explicit outcomes:

1. Keep EXE/MSI and adopt a separately reviewed cross-platform commerce and
   signed-license service.
2. Create a new packaged Store product only if the product/name/migration impact
   is understood and accepted.

Do not submit a Free-only release as a packaging fallback. Mote Pro and working
Free/Pro enforcement are required for the first public release.

Do not silently combine Store and custom license checks as an unplanned fallback.

## Decision record

```text
Date: 2026-09-01
Decision: MSIX Store commerce
Existing Partner Center product reusable: yes; conversion complete
Store durable add-on proven: no
Offline cached entitlement proven: no
Native capability smoke test: pending
Primary blockers: required parent Store screenshot and package, account-level
  tax/payout validation, parent app publication, and release-candidate validation
Required follow-up: rebuild and validate the Store-identity MSIX, complete
  commerce and native capability tests, then submit only when release-ready
Evidence location: this plan and local Partner Center identity record
```

Do not start production entitlement work until the pending Store commerce and
offline-license gates pass.
