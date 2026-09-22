//! Everything that changes lights without a direct tap, in three parts:
//!
//! - The shared engine: [`runtime`] makes every light write, [`ownership`]
//!   decides who holds a shared light by the person's [`priority`] order,
//!   [`looks`] and [`resolve`] turn a wanted look into light bodies, and
//!   [`journal`] puts lights back after a crash. PC Sync takes part through
//!   the runtime's signals.
//! - Automations, which start on their own: the on-air light and the lock
//!   automation ([`settings`], [`capture_use`]), [`presence`], and
//!   [`calendar`] rules. On-air, lock and presence are one each, since each
//!   answers a single signal; calendar rules are a list.
//! - [`focus`] sessions, which the person starts. Focus is its own screen in
//!   the app and only borrows the engine; it is not an automation there.
//!
//! Setting them up is free; running them is Mote Pro, through the
//! `local_automation` capability checked in [`runtime`].

pub mod calendar;
pub mod capture_use;
pub mod focus;
pub mod journal;
pub mod looks;
pub mod ownership;
pub mod presence;
pub mod presence_probe;
pub mod presence_scan;
pub mod priority;
pub mod resolve;
pub mod runtime;
pub mod settings;
