# Plan: Shared Automation Runtime

Status: **built after 0.5.0, not yet released**. The on-air light and the
away automation shipped on the first version in 0.4.1/0.5.0. The ownership
rework, the user-ordered priority, the crash-safe journal, PC Sync
coordination, and the three consumers (Focus, presence, calendar) described
below are built and tested, and wait for the next release.

## Goal

One Rust-owned runtime for local automations, so every trigger uses the same
lifecycle instead of each implementing its own background task, light
ownership, snapshots, crash recovery, conflicts, tray behavior, and
notifications.

## What shipped (0.4.1 / 0.5.0)

- `src-tauri/src/services/automations/`: one Tokio task in `runtime.rs` makes
  every automation light write. Windows lock/sleep signals
  (`session_events.rs`) and a two-second poll of microphone/camera use
  (`capture_use.rs`) are handled one at a time, in arrival order.
- `layers.rs` (since replaced by `ownership.rs`) kept a stack of what each
  automation changed, in start order:
  the newest automation wins a shared light, and ending a lower layer hands
  its original state up so the light finally returns to how it was before
  either began.
- Snapshots reuse PC Sync's `LightSnapshot` and paced `snapshot::restore` from
  `services/entertainment/snapshot.rs`; PC Sync behavior is unchanged.
- A light somebody changed while an automation held it is not restored over
  (`layers::unchanged`, `layers::unchanged_color`).
- Failed restores retry every 5 s for about a minute, in memory only.
- Settings live in the Tauri store file `automations.json`. Saving is free;
  starting a layer requires `local_automation`, and a layer already showing is
  always put back.
- Live preview is a short-lease layer driven by the settings editor.
- Automations run while Mote is open or in the tray. On exit the on-air light
  and preview are restored within a 2 s budget; the away automation is left
  as it is so a PC shutting down while locked does not light an empty room.

## Gaps closed by this phase

1. **No crash recovery.** A crash or a failed exit restore left lights in the
   automation's look indefinitely, and pending restores were lost on restart.
2. **Start order decided conflicts.** Whichever automation started last won a
   shared light, so locking during a call turned the on-air light off.
3. **No PC Sync coordination.** Automations wrote REST commands to lights PC
   Sync was streaming to, and PC Sync's restore could overwrite an automation's
   look (or restore a stale one after the automation ended).

## Decisions

- **Priority is the user's.** Automations → Priority is one ordered list of
  every automation and PC Sync. A higher entry takes a shared light from a
  lower one; when it lets go, the light goes to the next entry that still
  wants it, and only when nothing wants it does it return to its original
  state. Preview always wins while the editor shows it.
  Default order: On-air light, When this PC locks, Focus, PC Sync, Calendar,
  Presence. On-air stays lit through a lock because the call is still on;
  locking pauses PC Sync because the person has left; background calendar and
  presence rules leave a running sync alone.
- **PC Sync is an entry in that list.** An automation ranked above PC Sync that
  needs a light in the streaming area pauses PC Sync (stop with its usual
  restore), takes the light, and resumes the same sync when it no longer needs
  any light in that area. One ranked below leaves the area's lights alone until
  sync stops, then catches up. Starting PC Sync while a higher entry holds a
  light in the area is refused with an explanation. The color test is stopped,
  never resumed.
- **Storage: JSON, not SQLite.** Rules and settings stay in Tauri store files
  (`automations.json`, `focus.json`, `presence.json`, `calendar.json`). The
  recovery journal is `automation-journal.json` in the app config directory,
  written to a temporary file and renamed so a crash never leaves it half
  written. SQLite is not added: the data is small, the MSIX has to stay under
  the 10 MB Partner Center upload, and no calendar event content is persisted
  (see the calendar plan), so there is nothing to index or encrypt.
- **Secrets never enter the journal.** It records bridge IDs, light IDs, the
  original state, and what was written. The application key is looked up in
  the keyring when a restore runs, on whichever paired bridge the entry names.

## Ownership model

Per light (bridge ID + light ID) the runtime keeps:

- `before`: how the light looked before any automation took it;
- `applied`: what an automation last wrote to it, read back from the bridge so
  gamut clamping does not look like an edit;
- the claims on it, each with its holder, its wanted look computed against
  `before` (so dimming dims the original, not another automation's color), and
  whether ending should restore.

After every change the highest-ranked claim is written if it is not already
showing. With no claims left the light is restored when it still shows
`applied`; otherwise somebody changed it and it is left alone. One-shot actions
(presence arrival/departure) write lights nobody higher holds, and become the
`before` of lights a higher claim holds, so those land on the new look when the
hold ends.

## Crash-safe journal

- Every entry that owns a light is written to the journal before the first
  light write that depends on it, and removed after its restore succeeds.
- On startup, entries left behind are restored when the light still shows what
  the runtime wrote. Entries from the away automation are dropped instead,
  matching the exit behavior. Entries for a bridge that is no longer paired
  are dropped.
- Failed restores keep retrying (5 s for a minute, then every minute) and stay
  in the journal across restarts until they succeed or the light has changed.

## Delivery order

All done, in this order:

1. Ownership compositor with user priority (`ownership.rs`, `priority.rs`,
   `looks.rs`, `resolve.rs`); on-air, away, and preview moved onto it.
2. Crash-safe journal and startup recovery (`journal.rs`).
3. PC Sync coordination: the engine signals the lights it streams to, an
   automation above it pauses and later resumes it, and a start that would be
   paused at once is refused with an explanation.
4. Priority list in Automations → Priority, with PC Sync's pause notice on
   the PC Sync screen.
5. Consumers: Focus sessions, presence, then calendar. Each hands the runtime
   a claim (or, for presence, a one-time change) and has no light-state code
   of its own.

## Where it lives

| File (`src-tauri/src/services/automations/`) | Owns                                                                   |
| -------------------------------------------- | ---------------------------------------------------------------------- |
| `runtime.rs`                                 | The task, signals, PC Sync pause/resume, status events, exit cleanup   |
| `ownership.rs`                               | Per-light claims, the plan of writes and restores, the journal entries |
| `priority.rs`                                | Sources, holders, the person's order and its default                   |
| `looks.rs`                                   | Turning a look into a body for each light's capabilities               |
| `resolve.rs`                                 | Targets and scenes to reachable lights                                 |
| `journal.rs`                                 | `automation-journal.json`                                              |
| `focus.rs`, `presence*.rs`, `calendar/`      | The consumers                                                          |

Backend and frontend work were delivered as separate steps.

## Acceptance criteria

- The user's priority order decides every shared light, including PC Sync's.
- Normal stop, exit, crash recovery, and bridge reconnection restore owned
  state without deleting a journal entry whose restore failed.
- Focus, calendar, and presence contain no snapshot, restore, or conflict code
  of their own.
- PC Sync regression tests stay green.
