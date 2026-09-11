# Mote Desktop Privacy Policy

Status: **superseded**. The published documents are the ones served from the
website repository (`mote-website`), which the application links to at
`https://motedesktop.com/privacy`; they were written from this draft and carry
more than it does. Change the site first, and treat this file as the record of
what the pre-launch draft said rather than as the policy in force.

Effective date of the published version: **10 September 2026**.

Mote Desktop is an unofficial Windows desktop application published by Anton
Vo. It controls compatible Philips Hue devices through hardware on your local
network. Mote Desktop is not affiliated with or endorsed by Signify.

## Information stored on your device

Mote Desktop stores the minimum information needed to restore the application
and your settings:

- Hue Bridge metadata, including bridge identifiers, names, and local network
  addresses, in the application's local Tauri store.
- Hue application keys and entertainment credentials in the Windows credential
  store. These credentials are not displayed by the application.
- Sync Box connection metadata and credentials locally on your device.
- Application preferences such as theme, window behavior, dashboard layout,
  grouping mode, widget configuration, and autostart preference locally on your
  device.

You can remove a saved Hue Bridge or Sync Box through Settings. Uninstalling the
application may leave local preferences or credentials behind so that an
upgrade or reinstall does not unexpectedly erase them. The support page will
document the final deletion procedure before release.

## Network communication

Core control is local. Mote Desktop communicates directly with your Hue Bridge,
Hue Play HDMI Sync Box, and compatible Hue entertainment system over your local
network. PC Sync processes captured display frames or system-audio loopback on
your PC to calculate lighting output; it does not upload captured pixels or
audio.

Mote Desktop may contact `https://discovery.meethue.com/` when local Hue Bridge
discovery does not find a bridge. That service is operated by Signify and is
subject to its own privacy terms. Opening Privacy, Terms, Support, or release
notes leaves the app and loads the requested `motedesktop.com` page in your
default browser.

The first release does not include Hue cloud control, Mote accounts, advertising,
automatic analytics, automatic crash uploads, session replay, or in-app
feedback upload. The application does not intentionally send Hue names,
identifiers, bridge addresses, credentials, screenshots, captured frames,
audio, clipboard contents, or personal file paths to the publisher.

## Support contact

If you choose to contact support by email, the publisher receives the address,
message, and attachments you send. This information is used only to answer and
resolve your request, protect the service, and meet legal obligations. Do not
send Hue credentials, bridge addresses, or other secrets.

Support correspondence is retained only as long as reasonably necessary to
resolve the request and meet legal obligations. The final support address and
deletion-request procedure will be inserted before publication.

## Sharing and processors

Mote Desktop does not sell personal information. Information is shared only
when needed to operate user-requested support, comply with law, or protect
rights and security. The final hosting and email providers, processing
locations, retention periods, and international-transfer safeguards must be
confirmed in the reviewed policy before publication.

## Your rights

Depending on where you live, you may have rights to access, correct, delete, or
restrict the processing of personal information supplied through support. The
published policy will provide a working privacy contact and the information
required for the selected launch markets.

## Changes

Material changes will be identified by a new effective date. The policy
published for a release must describe the behavior of that exact release.
