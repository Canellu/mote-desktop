//! Lights that react to this PC: the on-air light while an app uses the
//! microphone or camera, and the away automation when the PC locks or sleeps.
//!
//! Setting them up is free; running them is Mote Pro, through the
//! `local_automation` capability checked in [`runtime`].

pub mod capture_use;
pub mod layers;
pub mod runtime;
pub mod settings;
