# Plan: Monetization and Backend Stack

Status: **product direction decided; implementation not started**. Last policy
review: **2026-08-14**.

This plan owns identity-provider, backend, commerce, licensing, and entitlement
decisions. It does not redefine the domain model in
[homes-and-membership-plan.md](./homes-and-membership-plan.md) or Hue OAuth and
transport in [cloud-control-plan.md](./cloud-control-plan.md).

The working brand is **Mote** and the reserved Microsoft Store title is
**Mote Desktop**. Commercial trademark clearance and the permanent app scheme
remain pending, so use `<APP_SCHEME>` and legal-entity placeholders in
implementation until those decisions are final.

## Decisions

| Area                     | Current direction                                                      | Qualification                                                                                                                                                                                   |
| ------------------------ | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product model            | Free + Pro + Household                                                 | Free covers essential local Hue control; Pro is a one-time purchase; Household is a later subscription for shared/cloud-backed features.                                                        |
| Windows commerce         | Microsoft Store durable add-on                                         | Use a Store-managed `pro` purchase. Confirm the required package identity and MSIX path before implementing the Windows adapter.                                                                |
| Windows packaging        | MSIX                                                                   | Selected on 2026-08-24. Partner Center conversion is complete; Store commerce, offline licensing, and native capability validation remain required.                                             |
| Apple commerce           | StoreKit non-consumable and subscription                               | Use a non-consumable `pro` purchase on macOS/iOS and a subscription if Household ships there.                                                                                                   |
| Cross-platform ownership | One equivalent purchase unlocks supported platforms                    | A signed-in Mote account links verified Microsoft or Apple ownership to a normalized entitlement. Do not require a second purchase solely because the user changes platform.                    |
| Local/offline Pro        | Platform-cached license through a provider-neutral entitlement service | Microsoft and Apple adapters map into the same capability model. Local licensing deters casual bypass but is not an absolute security boundary.                                                 |
| Identity                 | Provider undecided                                                     | Accounts are optional for Free/local use and required for cross-platform ownership, cloud settings, and Household. Do not store sessions in webview `localStorage`.                             |
| Stateful backend         | Provider undecided                                                     | One backend holds users, synced settings, homes, memberships, roles, normalized entitlements, encrypted owner-token records, and relay actions. Clerk and Convex are options, not requirements. |
| Hue token broker         | Server-side function                                                   | Start with a minimal broker if cloud control ships before the stateful backend; later fold it into the selected backend where practical.                                                        |
| Direct commerce          | Deferred                                                               | Do not add Paddle, Lemon Squeezy, or another MoR unless direct-download or unsupported-platform sales justify it.                                                                               |

## Architecture

```text
Tauri app
  ├─ platform Store adapter ────────────┐
  ├─ provider-neutral entitlement layer │
  └─ Mote account session ──────────────┼─> selected backend
                                        │    ├─ users/homes/memberships
Microsoft Store / Apple StoreKit ───────┘    ├─ normalized entitlements
                                             └─ broker/relay actions
                                                          │
                                                          └─> Hue cloud
```

- The selected identity provider owns authentication and account recovery; the
  app keeps only the stable provider user ID and necessary profile fields.
- The selected backend owns state and authorization. Every server operation
  checks the authenticated principal, entitlement, and home role.
- Microsoft and Apple own Store checkout and payment data. The app and backend
  never receive or store card details.
- Hue credentials are separate from payment and analytics data, encrypted at
  rest, access-controlled, and never exposed to guest clients.

## Product tiers

The exact boundary for current functionality is defined in the
[Free, Pro, and Household feature matrix](./free-pro-feature-matrix.md).

| Tier      | Initial scope                                                                                                                                                                                                                                                                               | Model                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Free      | Local discovery and pairing, one active bridge, essential light/room/zone controls, basic scenes, basic Sync Box control, one standard single-target desktop widget, and essential settings/accessibility                                                                                   | Free; no Mote account required                                                        |
| Pro       | PC Sync, advanced/multi-target widgets without a widget-count cap, custom dashboard layout, multiple saved bridges, advanced personalization, future advanced Sync Box workflows, local automation, personal remote control, and personal cloud settings where operating cost remains small | One-time purchase                                                                     |
| Household | Shared homes, invitations, owner/member/guest roles, shared settings/automations, encrypted owner Hue credentials, and guest command relay                                                                                                                                                  | Subscription because these features create continuing infrastructure and support cost |

The exact control-level feature matrix and regional prices remain to be frozen
before paywall implementation. Do not paywall security, accessibility, account
deletion, bridge removal, or the essential controls needed for a useful Free
experience. Existing purchasers must retain the functionality represented by
their purchase if tier definitions change later.

Personal remote control should not automatically imply a subscription: normal
Hue traffic can go directly from the app to Hue after brokered token exchange.
The guest relay has genuine ongoing infrastructure and abuse cost, so Household
is the tier where recurring pricing may be defensible.

## Entitlement model

Use a single normalized entitlement record regardless of sales channel:

```text
subject: app user or locally activated installation
product: pro | household
source: microsoft_store | apple_app_store | merchant_of_record | manual_grant
state: active | grace | expired | refunded | revoked
validUntil: optional
providerReference: opaque identifier
updatedAt: timestamp
```

- Provider webhooks are verified, idempotent, replay-safe, and the source of
  truth for purchase/refund/subscription events.
- Microsoft and Apple purchases map to the same `pro` or `household` product;
  store-specific product IDs must not leak into feature checks.
- A Mote account is the cross-platform subject. Linking a store purchase to an
  account requires server-verifiable proof and anti-replay controls; never trust
  a client-supplied `isPro` value.
- Premium server actions enforce entitlement and role on every call.
- The client may cache an entitlement for offline UX, but cannot use that cache
  to authorize server operations.
- Offline local features use a signed license/entitlement. Never ship a private
  signing key or a reusable commerce API secret in the desktop binary.
- Define refund, chargeback, cancellation, grace-period, restore-purchase, and
  account-migration behavior before accepting money.

### Application entitlement boundary

All paid feature checks go through one provider-neutral entitlement service.
React uses it to present locked states and purchase/restore actions; Rust checks
it again before executing paid local commands. Server-backed Household actions
also enforce the normalized entitlement and membership role on every request.

Capability names describe product behavior rather than stores. The current
canonical names are `pc_sync`, `advanced_widgets`, `dashboard_custom_layout`, and
`multiple_bridges`; future Household capabilities include `shared_home_relay`.
Do not spread Microsoft or Apple conditionals through feature components and
commands.

## Microsoft Store commerce

The first Partner Center product was created as an **EXE/MSI** listing. MSIX was
selected on 2026-08-24 after the local build/package/sign pipeline passed.
Partner Center converted the product to **MSIX or PWA app** by 2026-09-01 and
assigned the Store package identity recorded in the private release record.

The selected long-term Windows direction is an MSIX-packaged free Store app with
a one-time **Mote Pro** durable add-on. Before building the production adapter,
complete Store-associated purchase, restore, offline-license, update, and native
capability validation.

The previous draft incorrectly said Microsoft Store policy forbids third-party
checkout for locally used PC features and therefore requires premium assets to
be streamed from the cloud. Remove that architecture: it is unnecessary and
would undermine offline behavior.

Current Microsoft Store Policy 10.8.1 allows a non-game product on PC devices to
use either a secure third-party purchase API or Microsoft's in-product purchase
API for digital goods or services consumed in the app. When using third-party
commerce, the implementation must meet the current policy requirements,
including:

- identify the commerce provider to users at purchase time;
- authenticate the user before purchase;
- obtain purchase confirmation;
- use a PCI-compliant processor for payment information;
- declare use of a third-party purchase API in Partner Center; and
- comply with all current disclosure, refund, regional, and certification rules.

Policy can change. Re-read the live
[Microsoft Store Policies](https://learn.microsoft.com/windows/apps/publish/store-policies)
before checkout implementation and immediately before submission. Do not infer
that a policy allowing third-party commerce guarantees certification of a
particular UX.

Microsoft Store IAP remains a valid alternative. If supporting both Store and
direct-download sales, normalize both into the entitlement model and provide a
clear restore-purchase flow without asking users to buy twice.

## Apple App Store commerce

The planned macOS and iOS versions use StoreKit. Offer **Mote Pro** as a
non-consumable in-app purchase and offer Household as a subscription if that
tier ships on Apple platforms. Map StoreKit transactions into the same
provider-neutral entitlement model used on Windows.

Apple and Microsoft do not share purchase records. A user who wants
cross-platform portability signs into a Mote account and links a verified store
purchase. The backend then grants the equivalent normalized product on supported
platforms. The Apple build must also offer the same paid digital functionality
through StoreKit as required by the applicable App Review rules.

Mac App Store sandboxing, StoreKit integration, screen capture, system-audio
capture, background behavior, and Tauri mobile support require early technical
spikes. A directly distributed notarized macOS build would need separate
commerce/licensing and is deferred.

## Privacy and security

- Collect only account/payment metadata needed to authenticate, grant purchases,
  prevent fraud, support users, and meet legal obligations.
- Keep product analytics separate from identity by default. Follow
  [feedback-analytics-and-legal-plan.md](./feedback-analytics-and-legal-plan.md)
  for consent, anonymous telemetry, optional report-scoped email, retention, and
  deletion.
- Verify authorization in the selected backend; never trust a tier, role, home
  ID, or user ID supplied by the client.
- Verify webhook signatures against the raw body, reject stale/replayed events,
  and make processing idempotent.
- Store desktop tokens in the OS keychain. Use `<APP_SCHEME>://...` deep links,
  random OAuth state, PKCE where supported, and strict callback validation.
- Rate-limit broker, relay, invite, activation, and restore-purchase endpoints.
- Maintain audit events for membership, entitlement, and credential changes
  without logging tokens, event content, or payment secrets.

## Delivery plan

1. **Freeze products and feature gates**
   - [x] Write the exact Free/Pro/Household feature matrix for current
         functionality.
   - [x] Assign stable, provider-neutral capability names and define downgrade,
         refund, offline, unknown-license, and grandfathering behavior.
2. **Store packaging and commerce spikes**
   - [x] Compile and run the initial Windows Store license/durable-product
         diagnostic in the current unpackaged state.
   - [ ] Prove Windows package identity, Microsoft durable-add-on discovery,
         purchase, restore, refund/revocation, and cached offline behavior from
         a Store-associated package. Use the dedicated
         [Windows Store packaging and commerce spike](./windows-store-commerce-spike.md).
   - Prove macOS StoreKit non-consumable purchase/restore and validate that App
     Sandbox constraints do not block planned native functionality.
3. **Provider-neutral local entitlement layer**
   - [x] Add the provider-neutral Rust capability model, normalized entitlement
         snapshot, structured authorization errors, fail-closed unavailable
         provider, debug-only mutable provider, and unit tests. See
         `src-tauri/src/services/entitlements.rs`.
   - [ ] Add managed application state and structured frontend entitlement IPC.
   - [ ] Add Microsoft and Apple adapters without leaking provider IDs into
         feature code.
   - [ ] Enforce paid commands in Rust and present purchase, restore, locked,
         offline, and downgrade states in React.
4. **Desktop/mobile auth spike**
   - Prove system-browser sign-in, `<APP_SCHEME>` callback, OS-keychain session
     restore, sign-out, token refresh, and account switching on each supported
     platform before choosing the identity provider.
5. **Backend foundation**
   - Select identity and backend providers after the auth and data-model spikes.
   - Implement the homes/membership schema and least-privilege authorization.
   - Verify and normalize Microsoft and Apple purchases, including secure
     account linking and idempotent refund/revocation handling.
   - Move the Hue broker into the selected backend only if that simplifies
     operations.
6. **Cross-platform entitlement linking**
   - Link verified store ownership to a Mote account without exposing buyer
     identity to analytics or allowing one purchase to fan out to unrelated
     accounts.
   - Test reinstall, offline launch, platform migration, account migration,
     refund, revocation, grace, and restore behavior.
7. **Household relay**
   - Gate relay operations server-side, add quotas/abuse controls, and measure
     actual recurring cost before choosing subscription pricing.

## Open decisions

- Exact control-level Free/Pro boundary and regional Store pricing.
- Identity and backend providers after Windows, macOS, and iOS auth spikes.
- Account-linking and device policy for one cross-platform purchase.
- Whether a notarized direct-download macOS build is worth separate commerce.
- Guest-relay quotas, retention, revocation latency, and sustainable pricing.

## Acceptance criteria

- A user can purchase, restore, refund, and migrate an entitlement through every
  supported channel without duplicate charging.
- Offline Pro features work for the documented period without weakening server
  authorization for Household features.
- A modified desktop client cannot grant itself server-backed access.
- Payment data never touches app or backend storage.
- Store submission materials accurately declare the commerce provider and match
  the implemented purchase UX.
- Privacy policy, terms, purchase disclosures, refund terms, and support contact
  are published before checkout is enabled.

## Sources to re-check at implementation

- [Microsoft Store Policies](https://learn.microsoft.com/windows/apps/publish/store-policies)
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- Current Microsoft Store, StoreKit, Tauri platform, selected identity/backend,
  and any direct-commerce provider documentation.
