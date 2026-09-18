# Changelog

User-visible changes to the application are recorded here. Versioning and
publication rules are defined in [docs/releasing.md](docs/releasing.md).

## Unreleased

## [0.5.0] - 2026-09-18

### Highlights

- **Your plan, one click away.** The plan control beside the app name opens
  your plan next to what Free and Mote Pro each include, so what you bought
  stays visible after you buy it.
- **The trial says hello.** When the 14-day Mote Pro trial starts, Mote shows
  what it includes and when it ends. No card, and nothing to cancel.

### Improvements

- The title bar has one plan control: Get Pro on Free, the countdown during
  the trial, and the Pro mark once bought. It stays hidden until your first
  bridge is paired, which is when the trial starts.
- Pro features stay marked Pro during the trial, so it is clear what goes back
  to Free when it ends.
- About & Support links to motedesktop.com.

## [0.4.1] - 2026-09-18

### Highlights

- **On-air light (Mote Pro).** Choose lights, rooms, or zones, and they turn a
  color, a white, or a scene you pick while an app uses your microphone or
  camera, then go back to how they were when the call ends. It works with any
  calling app, a browser tab included. An app that keeps the microphone open
  outside calls can be ignored.
- **Lights that follow you stepping away (Mote Pro).** When you lock this PC or
  it goes to sleep, Mote turns off, dims, or sets a scene on the lights you
  choose and puts them back when you unlock it. A light someone changed in the
  meantime is left as it is.
- Both live under Settings, App, Automations, can be previewed on the real
  lights while you edit them, and can be set up before Pro is unlocked.
- **Widget corners (Mote Pro).** Choose square, soft, rounded, or round corners
  for each widget; its cards follow.

### Improvements

- Store updates download while Mote stays open, then install with a restart.
- Settings says what the free app includes wherever Mote Pro starts, and
  anything that needs Pro opens the purchase window instead of an error.

### Fixes

- The Mote Pro purchase window opens the way Microsoft requires, and a failed
  purchase says what the Store reported.
- Moving between screens no longer fades the whole window, the close setting no
  longer flashes the wrong choice, and the scroll-to-top button no longer
  covers the last row in Settings.

### Migration notes

- The free app now includes one desktop widget with one room, zone, or light.
  More widgets, more controls in a widget, and each widget's theme, size,
  corners, placement, pinning, and always-on-top are part of Mote Pro. Widgets
  made during a trial stay saved; without Pro only the first one runs, and the
  rest come back as they were once Pro is unlocked.

## [0.3.0] - 2026-09-15

### Highlights

- **Try Mote Pro free for 14 days.** The trial starts when you pair your first
  Hue Bridge and unlocks everything in Pro. The title bar counts down the days
  left, and Mote reminds you three days and one day before the trial ends.
- When the trial ends without a purchase, Pro features switch off, but nothing
  you set up is lost. Widgets show their first control and stop staying on top,
  the home dashboard shows the standard grouping, and shortcuts stop firing.
  Buying Mote Pro brings all of it back as it was.
- Reinstalling Mote does not start a second trial.

### Improvements

- Mote now starts when you sign in to Windows by default, quietly in the tray.
  Turn it off under Settings, General, or on the Startup page in Windows
  Settings.
- Switching to another saved Hue Bridge now needs Pro, the same as saving a
  second one. Removing a bridge stays free.

## [0.2.5] - 2026-09-14

### Improvements

- While an update installs, the **Update** button counts up to 100%, and a
  notice says Mote is about to close and will reopen.
- The update confirmation now says Mote opens again once Windows has installed
  the update.

## [0.2.4] - 2026-09-14

### Improvements

- The title bar's **Update** button is now a blue filled button, so a waiting
  update stands out from the other title-bar controls.
- Installing Mote from the Microsoft Store now puts a shortcut on your desktop,
  and Settings, under General, has a **Desktop shortcut** switch to remove it or
  add it back.

### Fixes

- Installing an update from the Microsoft Store no longer leaves Mote closed.
  Windows reopens it once the update is installed.

## [0.2.3] - 2026-09-14

### Improvements

- Settings, under About, now says when Mote last checked the Microsoft Store
  for updates, so being up to date and the Check for updates button no longer
  read as a contradiction.
- The Check for updates and Install update buttons keep their size while they
  work, and show a spinner instead of shifting the layout.

## [0.2.2] - 2026-09-13

### Highlights

- Mote tells you when a newer version is in the Microsoft Store. An **Update**
  button appears in the title bar, and Settings, under About, can check for and
  install it. Installing closes Mote while Windows updates it, and stops PC Sync
  first.

### Fixes

- The taskbar and Start menu icon is now sharp and full size, instead of small
  on a grey plate.

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
