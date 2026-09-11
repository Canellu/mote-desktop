# Plan: Mote Desktop website launch

Status: **implementation in progress; domain purchase deferred**.

Last reviewed: **2026-09-02**.

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
