//! Which automation keeps a light when several want it.
//!
//! The order is the person's: Automations → Priority is one list of
//! every automation and PC Sync, and a higher entry takes a shared light from a
//! lower one. Preview is not in the list; it wins while the editor shows it.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Source {
    OnAir,
    Away,
    Focus,
    PcSync,
    Calendar,
    Presence,
}

impl Source {
    /// On-air stays lit through a lock because the call is still on; locking
    /// pauses PC Sync because the person has left; background calendar and
    /// presence rules leave a running sync alone.
    pub const DEFAULT_ORDER: [Source; 6] = [
        Source::OnAir,
        Source::Away,
        Source::Focus,
        Source::PcSync,
        Source::Calendar,
        Source::Presence,
    ];

    /// How a refusal names it, e.g. "The on-air light is using …".
    pub fn label(self) -> &'static str {
        match self {
            Self::OnAir => "the on-air light",
            Self::Away => "the lock automation",
            Self::Focus => "a focus session",
            Self::PcSync => "PC Sync",
            Self::Calendar => "a calendar automation",
            Self::Presence => "the presence automation",
        }
    }
}

/// Any saved order made whole: unknown or repeated entries are dropped and a
/// missing one is put back where the default order has it.
pub fn normalize(order: &[Source]) -> Vec<Source> {
    let mut result: Vec<Source> = Vec::with_capacity(Source::DEFAULT_ORDER.len());
    for source in order {
        if !result.contains(source) {
            result.push(*source);
        }
    }
    for (index, source) in Source::DEFAULT_ORDER.iter().enumerate() {
        if result.contains(source) {
            continue;
        }
        // After the nearest default predecessor already placed.
        let at = Source::DEFAULT_ORDER[..index]
            .iter()
            .rev()
            .find_map(|before| result.iter().position(|placed| placed == before))
            .map_or(0, |position| position + 1);
        result.insert(at, *source);
    }
    result
}

/// Something that can hold a light. Calendar rules hold separately, each by
/// its own id, and rank among themselves in the order they are listed.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(tag = "kind", content = "id", rename_all = "camelCase")]
pub enum Holder {
    Preview,
    OnAir,
    Away,
    Focus,
    Calendar(String),
}

impl Holder {
    pub fn source(&self) -> Option<Source> {
        match self {
            Self::Preview => None,
            Self::OnAir => Some(Source::OnAir),
            Self::Away => Some(Source::Away),
            Self::Focus => Some(Source::Focus),
            Self::Calendar(_) => Some(Source::Calendar),
        }
    }
}

/// Lower ranks first. `(0, 0)` is preview.
pub type Rank = (u8, u16);

#[derive(Debug, Clone, Default)]
pub struct Ranking {
    order: Vec<Source>,
    calendar: Vec<String>,
}

impl Ranking {
    pub fn new(order: &[Source], calendar_rules: Vec<String>) -> Self {
        Self {
            order: normalize(order),
            calendar: calendar_rules,
        }
    }

    pub fn source(&self, source: Source) -> Rank {
        let position = self
            .order
            .iter()
            .position(|entry| *entry == source)
            .unwrap_or(self.order.len());
        (position as u8 + 1, 0)
    }

    pub fn holder(&self, holder: &Holder) -> Rank {
        match holder {
            Holder::Preview => (0, 0),
            Holder::Calendar(id) => {
                let (outer, _) = self.source(Source::Calendar);
                let inner = self
                    .calendar
                    .iter()
                    .position(|rule| rule == id)
                    .unwrap_or(self.calendar.len());
                (outer, inner as u16)
            }
            other => self.source(other.source().expect("only preview has no source")),
        }
    }

    pub fn above_sync(&self, holder: &Holder) -> bool {
        self.holder(holder) < self.source(Source::PcSync)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_partial_order_gets_its_missing_entries_back() {
        assert_eq!(normalize(&[]), Source::DEFAULT_ORDER.to_vec());
        // An order saved before focus existed keeps its own choices, and focus
        // lands after its default predecessor.
        assert_eq!(
            normalize(&[
                Source::Away,
                Source::OnAir,
                Source::PcSync,
                Source::Away,
                Source::Calendar,
                Source::Presence,
            ]),
            vec![
                Source::Away,
                Source::Focus,
                Source::OnAir,
                Source::PcSync,
                Source::Calendar,
                Source::Presence,
            ]
        );
    }

    #[test]
    fn preview_outranks_everything_and_calendar_rules_rank_in_list_order() {
        let ranking = Ranking::new(
            &Source::DEFAULT_ORDER,
            vec!["standup".into(), "review".into()],
        );
        assert!(ranking.holder(&Holder::Preview) < ranking.holder(&Holder::OnAir));
        assert!(ranking.holder(&Holder::OnAir) < ranking.holder(&Holder::Away));
        assert!(
            ranking.holder(&Holder::Calendar("standup".into()))
                < ranking.holder(&Holder::Calendar("review".into()))
        );
        assert!(ranking.above_sync(&Holder::Focus));
        assert!(!ranking.above_sync(&Holder::Calendar("standup".into())));
    }

    #[test]
    fn ipc_names_are_camel_case() {
        assert_eq!(serde_json::to_value(Source::PcSync).unwrap(), "pcSync");
        assert_eq!(serde_json::to_value(Source::OnAir).unwrap(), "onAir");
    }
}
