# Mote Desktop v1 known limitations

Status: **release-candidate draft; update from acceptance testing**.

Last reviewed: **2026-09-24**.

- The first release supports Windows 10 and Windows 11 on x64 PCs only.
- Hue control is local-network-first. The PC and Hue Bridge must normally be on
  the same network; remote Hue cloud control is not included.
- Bridge discovery can be affected by network isolation, VPNs, firewalls,
  multicast filtering, and guest Wi-Fi. Internet fallback discovery may not
  work when offline.
- Only one Hue Bridge is active in the UI at a time. Combined cross-bridge views
  and cross-bridge PC Sync are not included.
- PC Sync requires compatible Hue entertainment hardware and a provisioned
  entertainment credential. Available display, HDR, and audio behavior depends
  on Windows, drivers, and hardware and must be finalized through acceptance
  testing.
- PC Sync Music mode uses system-audio loopback; it does not use the microphone.
- One Hue Play HDMI Sync Box is free; pairing more is Mote Pro. The Sync screen
  controls one box at a time, and a bridge streams to one box at a time.
- Free includes one desktop widget with one room, zone, or light. More widgets,
  multiple controls/targets, and widget theme, size, corners, placement,
  pinning, and always-on-top require Pro.
- Mote Pro is a one-time Microsoft Store purchase. PC Sync, global keyboard
  shortcuts, automations, more than one widget or control, custom dashboard
  layouts, and multiple saved Hue Bridges require Pro. All of these are
  enforced as of 2026-09-11, automations from 2026-09-15.
- Automations run only while Mote is running, including in the tray. The
  on-air light follows Windows' own record of microphone and camera use, so an
  app that keeps the microphone open outside calls has to be ignored in the
  on-air automation. Shutting down or restarting the PC does not count as stepping away,
  and on PCs with Modern Standby, sleep is noticed only once the PC locks.
- Focus sessions end when Mote quits. Presence works
  on the PC's home network only, and a sleeping phone can take a few minutes
  to answer; a phone that rotates its private Wi-Fi address has to be set to a
  fixed one for that network. Calendars are iCal addresses only: there is no
  Google or Microsoft sign-in and no calendar view, and a time zone a feed
  does not describe is read as this PC's.
- Global keyboard shortcuts can be configured without Pro but will not fire
  until it is owned. The refusal happens in the backend, so a shortcut prepared
  in advance starts working the moment Pro is unlocked.
- The custom dashboard layout is enforced in the interface only. It is stored
  locally with no backend command behind it, unlike every other paid
  capability.
- Mote Pro is a durable Store add-on, live since 2026-09-13. Purchase,
  restore, offline licensing, and the trial surviving a reinstall have not
  yet been verified on a Store-installed build.
- Mote accounts, shared homes, cloud control, Household subscriptions, and
  public roadmap voting are not included.
- Mote does not include automatic analytics or automatic crash uploads.
  Feedback is sent only when the user submits it, through the in-app form to
  motedesktop.com, after local redaction; the contact email is optional.
