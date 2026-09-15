# Mote Desktop v1 known limitations

Status: **release-candidate draft; update from acceptance testing**.

Last reviewed: **2026-09-11**.

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
- The first release manages one saved Hue Play HDMI Sync Box. Multiple or
  per-bridge Sync Box association is not included.
- The app does not impose a limit on the number of widget windows. Multiple
  controls/targets and advanced widget customization require Pro.
- Mote Pro is a one-time Microsoft Store purchase. PC Sync, global keyboard
  shortcuts, automations, advanced widget composition, custom dashboard
  layouts, and multiple saved Hue Bridges require Pro. All of these are
  enforced as of 2026-09-11, automations from 2026-09-15.
- Automations run only while Mote is running, including in the tray. The
  on-air light follows Windows' own record of microphone and camera use, so an
  app that keeps the microphone open outside calls has to be ignored in
  Settings. Shutting down or restarting the PC does not count as stepping away,
  and on PCs with Modern Standby, sleep is noticed only once the PC locks.
- Global keyboard shortcuts can be configured without Pro but will not fire
  until it is owned. The refusal happens in the backend, so a shortcut prepared
  in advance starts working the moment Pro is unlocked.
- The custom dashboard layout is enforced in the interface only. It is stored
  locally with no backend command behind it, unlike every other paid
  capability.
- Mote Pro cannot be bought yet. The durable add-on was submitted on 2026-09-11
  and publishes manually, so until it is published the app has no Pro to sell
  and every gated capability refuses.
- Mote accounts, shared homes, cloud control, Household subscriptions, calendar
  rules, Pomodoro, presence automation, and public roadmap voting are not
  included.
- The first release does not include automatic analytics, automatic crash
  uploads, or a hosted in-app feedback uploader. The persistent feedback action
  prepares an editable email in the user's default email app.
