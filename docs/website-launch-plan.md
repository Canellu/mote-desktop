# Plan: Mote Desktop website launch

Status: **live at motedesktop.com**. The domain and Domeneshop email were
bought, and the site, legal pages, and support route deploy from
`mote-website` through Cloudflare Pages. `support@motedesktop.com` is live;
`privacy@motedesktop.com` is still to be created. The phases below are the
original plan.

Last reviewed: **2026-10-31**.

## Current state

- Site copy, deployed on 2026-10-12 (`mote-website` `cf22488`), matches
  [the feature matrix](./free-pro-feature-matrix.md) as of 0.10.1. 0.11.0
  needs no site change before it publishes. It covers PC Sync free, one Sync
  Box and one widget on Free, the 14-day trial, the one-time Mote Pro
  purchase, the five automation types (on-air light, stepping away, focus
  sessions, presence, calendar) on `/features`,
  connecting by IP address in the setup guide, FAQ and support, and the Hue
  Bridge answer from the [bridgeless spike](./bridgeless-hue-control-spike.md).
  The legal pages carry the 3 October 2026 changes that 0.10.1 announces.
- 0.12.0 site changes (mascot, folding, feature comparison, desktop widgets
  page) and a 31 October 2026 legal effective date, for the plan now listed
  among the diagnostics facts, were deployed on 2026-10-31 (`mote-website`
  `1a08422`), while 0.12.0 was in certification.
- The sitemap was submitted in Google Search Console on 2026-10-04 and read
  the same day (8 pages). On 2026-10-11 Google had 7 pages indexed. The 9 not
  indexed are URLs meant to redirect (slashless, `http`, `www`) and
  `/features/desktop-widgets/`, not yet crawled; detail is in
  `mote-website/docs/discoverability/implementation-record.md`. Bing Webmaster
  Tools is not set up yet.
- The feedback endpoint, with diagnostics since 0.9.0, runs as the separate
  `mote-api` Worker on `motedesktop.com/api/*`; see the
  [feedback and public roadmap delivery plan](./feedback-and-roadmap-delivery-plan.md).
- Two technical-direction bullets below no longer hold: the site runs
  cookieless Cloudflare Web Analytics, and the app submits feedback, both
  disclosed in the privacy policy. The Mote Pro price is still not shown.
- Open website work lives in `mote-website/docs/next-steps.md`: a real
  automations capture, Bing Webmaster Tools, and the 11 October
  discoverability review. One item is in this repository: the in-app Free vs
  Mote Pro table in `src/features/pro/PlanOverview.tsx` has the row
  "Automations: on air and away", which leaves out focus sessions, presence,
  and calendar rules, all Pro since 0.6.0. The website's table reads
  "Automations: calls, locking, focus, presence, and calendar". Keep that file
  and this section in step.

## Goal

Build a simple, fast, clean public website for Mote Desktop before purchasing
and connecting `motedesktop.com`. The site must provide stable Store submission
URLs for the product page, Privacy Policy, Terms of Use, and Support.

## Repository decision

Create a separate repository named **`mote-website`**. Do not place the site in
the current `mote-desktop` repository and do not move the existing Tauri app into
an `apps/desktop` folder for v1.

Reasons:

- The desktop repository already has release-critical Tauri, MSIX, Rust, and
  frontend paths rooted at the repository top level. Moving them into a
  monorepo would create broad build and packaging churn close to release.
- The first website is a static marketing and legal surface with a different
  deployment cadence and almost no runtime code worth sharing with the desktop
  application.
- Separate permissions and deployment secrets keep a website compromise or
  deployment mistake away from desktop signing and Store-release workflows.
- Cloudflare Pages can build and deploy the website independently while the
  desktop application keeps its existing Bun and Tauri commands unchanged.

Reconsider an umbrella monorepo only when Mote has multiple maintained web
applications or genuinely shared packages—for example an account portal,
backend client, design-token package, or cross-platform entitlement SDK. Do not
merge repositories solely to share a logo, colors, or legal copy.

## Technical direction

- React, TypeScript, Vite+, Bun, TanStack Start, and Tailwind CSS.
- Use Vite+ as the unified development toolchain for development, checks,
  tests, and production builds.
- Statically prerender every public route with TanStack Start. Deploy the
  generated `dist/client` assets to Cloudflare Pages; no production server or
  runtime SSR is required for v1.
- Accessible semantic HTML, responsive layout, keyboard support, reduced-motion
  support, and strong Lighthouse performance.
- No analytics, advertising, cookies, account system, newsletter, or automatic
  form submission in the first version.
- Keep legal text source-controlled and reviewed. The website may render copies,
  but the release checklist must verify they match the approved desktop docs.

## Initial routes

- `/` — concise product introduction, screenshots, hardware requirements, and
  Microsoft Store call to action when the listing is ready.
- `/features` — honest Free versus Mote Pro comparison.
- `/privacy` — reviewed Privacy Policy.
- `/terms` — reviewed Terms of Use.
- `/support` — setup help, common troubleshooting, version information, and the
  support email after it exists.

The homepage should explain that Mote Desktop is an unofficial Windows
controller for compatible Philips Hue hardware and is not affiliated with or
endorsed by Signify.

## Content requirements

- Present the Free tier as useful: essential Hue control, scenes, one bridge,
  current single-Sync-Box control, and one standard single-target widget.
- Present Mote Pro accurately: PC Sync, advanced widgets without a count cap, custom
  dashboard layout, and multiple saved bridges.
- State Windows, Hue Bridge, entertainment-area, display-capture, audio-loopback,
  Sync Box, local-network, VPN, firewall, and multicast requirements accurately.
- Do not advertise a feature, price, trial, platform, or purchase path until it
  passes release acceptance and appears in the approved Store listing copy.

## Delivery phases

1. **Design and content** — establish the information architecture, visual
   direction, responsive page designs, and approved copy without buying a domain.
2. **Repository and implementation** — create `mote-website`, implement the
   static React site, add accessibility checks, and deploy to a temporary
   Cloudflare Pages hostname.
3. **Legal and release review** — verify Privacy, Terms, Support, pricing,
   hardware requirements, trademark attribution, and every Free/Pro statement.
4. **Domain and email** — purchase `motedesktop.com`, configure Domeneshop email,
   connect Cloudflare Pages, preserve MX/SPF/DKIM/DMARC records, and create
   `support@` and `privacy@` addresses.
5. **Store integration** — verify HTTPS and all public routes, then update the
   Partner Center website, privacy, support, and listing links.

## Release gates

- The site works at the temporary Pages hostname before domain purchase.
- All routes work without JavaScript errors on supported desktop and mobile
  browsers.
- Accessibility, responsive layout, metadata, social preview, favicon, and
  performance checks pass.
- Privacy, Terms, Support, and Free/Pro claims match the release candidate.
- Domain ownership, TLS, redirects, email delivery, SPF, DKIM, and DMARC pass.
- No Partner Center URL is changed until its final HTTPS destination is live.
