# Changelog

User-visible changes to the application are recorded here. Versioning and
publication rules are defined in [docs/releasing.md](docs/releasing.md).

## Unreleased

## [0.8.0] - 2026-09-26

### Highlights

- **PC Sync is free.** Video, Games, and Music sync with your Hue
  entertainment area no longer need Mote Pro.

## [0.7.0] - 2026-09-26

### Highlights

- **More than one Sync Box (Mote Pro).** Pair several Hue Play HDMI Sync
  Boxes and switch between them from the top of the Sync screen. Each box is
  listed under the bridge it streams to, and Settings shows every box with its
  own details and Remove. Your first Sync Box stays free.
- **What's new.** After an update, Mote shows what changed, once. Settings >
  About opens it again whenever you like.

### Improvements

- Mote looks for updates every hour and again when your PC wakes up, so a new
  version starts downloading sooner.
- Syncing labels name the Sync Box that is syncing instead of saying "the Sync
  Box".

### Fixes

- Restart to update no longer gets stuck on "Restarting…" after Microsoft's
  update window was shown. If a restart still does not happen, Mote tells you
  after two minutes what to do instead of spinning forever.

## [0.6.2] - 2026-09-25

### Improvements

- Updates download on their own as soon as the Microsoft Store offers one, so
  the only step left is Restart to update. The title-bar button fills as the
  download moves. When Windows will not download updates in the background,
  Update downloads and installs in one click.

## [0.6.1] - 2026-09-25

### Improvements

- Creating a scene opens its own page instead of saving the lights as they
  are. Pick a room or zone and a name, place each light on the color or white
  wheel, set the brightness and whether the lights are on, and press Preview
  to see it on your lights before you save. Turning Preview off puts them
  back.
- The lights on the color and white wheels grow with the wheel, so they are
  easier to see and grab on a large window, here and in a room's side pane.
- Rename and Edit placement in Settings are labelled buttons instead of bare
  icons.

## [0.6.0] - 2026-09-23

### Highlights

- **Focus sessions (Mote Pro).** Pick a rhythm, your lights, and a vibe, and
  the lights keep time: they shift as a focus block goes by, change for your
  breaks, and go back to how they were when you are done. The clock follows
  you in the title bar and the tray, with a notification between phases.
- **Presence (Mote Pro).** Mote finds the phones on your home Wi-Fi so you can
  pick yours from a list. When every phone has been gone for ten minutes, the
  lights you choose turn off; when someone is back, a scene comes on. Mote
  follows a phone if the router gives it a new address.
- **Calendar (Mote Pro).** Add a Google, Outlook, or iCloud calendar by its iCal
  address, and lights change around matching events: red for meetings, a
  scene for focus blocks, a few minutes early if you like.
- **You decide which automation wins.** Priority, at the foot of Automations,
  lists every automation, Focus, and PC Sync; drag them into the order you
  want. When two want the same light, the higher one keeps it, and anything
  above PC Sync pauses it and starts it again afterwards.

### Improvements

- Automations has its own screen, opened from Home beside Focus and Sync
  instead of from inside Settings. A dot on its button shows when one is
  changing your lights, and hovering any of Home's buttons names it.
- A new focus ritual is made one step at a time — its rhythm, its lights, its
  vibe, then a last look before it is saved — and every step you have answered
  stays one click away at the top, so going back to change something does not
  lose the rest. Editing a ritual you already have still shows everything on
  one page.
- A ritual's rhythm is a plain list now: a preset to start from, then a row
  each for focus, break, long break and rounds. Above them the session is
  charted — a column per stretch, as tall as its minutes, the rounds numbered
  and the breaks barely rising between them — beside the time it all adds up
  to, the focus and the breaks each counted for you. Each preset carries the
  same chart in miniature, so the difference between a long stretch and a
  quick one is visible before you pick, and the card takes a wash of the
  ritual's own light colours.
- A ritual's lights can be chosen a whole room at a time. Rooms shows one card
  per room and zone; Lights opens them up for single bulbs, as before.
- The vibe step says what it is choosing: how the lights move, then the
  colours they move between, with a line naming what the chosen movement does
  with those colours. Picking a movement never overwrites a colour. The
  movements are a list, and beside them a panel plays the one you picked:
  four lights in your ritual's colours going through a whole round, the focus
  phase and then the break, so the difference can be watched instead of read.
- Every step of the ritual wizard is open from the start, since none of them
  waits on another, and the row along the top ticks the ones that have what
  they need. A ritual with no lights says so on the last step, with a way
  back to choose them.
- The last step of the ritual wizard shows the session, the lights and the
  colours themselves instead of listing them in words.
- The focus clock sits in the middle of the window and grows with it.
- Editing an automation keeps a summary to the right of its settings: whether
  it is on, anything left to set up before it can run (each a jump to where
  to fix it), what it does in one sentence, a list of its sections showing
  what each is set to, and Save. In a narrow window Save floats at the bottom
  instead.
- Light and scene pickers fold each room to one line naming what you picked
  there, so a big home no longer means a long page. Rooms open and close with
  a slide, a room's lights can be picked or cleared in one go, and one button
  in the section's title folds or opens every room at once.
- Calendars you connect now live in Settings, Connections, Calendars, beside
  the bridge and the Sync Box. You can still connect one while making a rule.

- Lights an automation changed go back even if Mote closes unexpectedly: they
  are put back the next time it starts.
- The on-air light now stays on when you lock the PC during a call. Move
  When this PC locks above it in Priority for the old behavior.
- PC Sync says when an automation paused it, and refuses to start on lights a
  higher automation is using rather than fighting over them.

### Fixes

- The Update button's download percent now climbs as the update arrives,
  instead of sitting at 0% until it is done.

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

Withdrawn from Store certification before it was published; everything below
reaches the Store with 0.5.0.

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
