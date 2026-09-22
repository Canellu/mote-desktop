//! Who shows what on each light when automations and PC Sync want the same
//! ones.
//!
//! Per light the runtime keeps how it looked before any automation took it,
//! what it last wrote, and every claim on it. The highest-ranked claim is the
//! one on the light; when it lets go the next one takes over, and only when
//! nothing wants the light does it go back to how it was. This module decides;
//! the runtime does the bridge writes it asks for and reports back.

use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::services::entertainment::snapshot::LightSnapshot;

use super::looks::{Applied, Caps, Intent};
use super::priority::{Holder, Rank, Ranking};

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LightKey {
    pub bridge_id: String,
    pub light_id: String,
}

#[derive(Debug, Clone)]
pub struct Claim {
    pub holder: Holder,
    pub intent: Intent,
    /// Put the light back when this look ends and nothing else wants it.
    pub restore: bool,
    pub transition_ms: u32,
}

#[derive(Debug, Clone)]
pub struct Shown {
    pub holder: Holder,
    /// `None` for a look recovered from the journal.
    pub intent: Option<Intent>,
}

#[derive(Debug, Clone)]
pub struct Entry {
    pub key: LightKey,
    pub caps: Caps,
    /// How it looked before any automation took it. Unknown while PC Sync was
    /// streaming to it when it was claimed, until the stream lets go.
    pub before: Option<LightSnapshot>,
    /// What the runtime last wrote, as the bridge reported it back. `None`
    /// while the light still shows `before`.
    pub applied: Option<Applied>,
    /// The look recorded as on the light. Kept after its claim ends, so the
    /// journal knows whose look a light still carries.
    pub shown: Option<Shown>,
    pub claims: Vec<Claim>,
    /// Whether `before` goes back once nothing claims it: the policy of the
    /// look that was on it.
    pub restore: bool,
    /// Write the top claim again even if it is recorded as showing, because
    /// PC Sync may have replaced it.
    pub stale: bool,
}

/// A light a claim wants, as it is right now.
#[derive(Debug, Clone)]
pub struct ClaimedLight {
    pub key: LightKey,
    pub caps: Caps,
    pub current: LightSnapshot,
    pub intent: Intent,
}

/// A light the runtime changed, as the journal keeps it. No bridge address or
/// key: those are looked up by bridge id when the restore runs.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalEntry {
    pub key: LightKey,
    pub before: LightSnapshot,
    pub applied: Applied,
    pub holder: Holder,
    pub restore: bool,
}

/// The lights PC Sync is streaming to.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyncHold {
    pub bridge_id: String,
    pub light_ids: HashSet<String>,
}

impl SyncHold {
    pub fn covers(&self, key: &LightKey) -> bool {
        self.bridge_id.eq_ignore_ascii_case(&key.bridge_id)
            && self.light_ids.contains(&key.light_id)
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum Op {
    /// Show `holder`'s look. `body` is `None` when the light already shows it.
    Write {
        key: LightKey,
        holder: Holder,
        intent: Intent,
        body: Option<Value>,
        applied: Applied,
        transition_ms: u32,
    },
    /// Put `before` back, if the light still shows `expect`.
    Restore {
        key: LightKey,
        before: LightSnapshot,
        expect: Applied,
    },
    /// Nothing claims it and nothing needs putting back.
    Forget { key: LightKey },
}

/// What a write changes about an entry, to undo it when the write fails.
#[derive(Debug, Clone)]
pub struct EntryState {
    applied: Option<Applied>,
    shown: Option<Shown>,
    restore: bool,
    stale: bool,
}

#[derive(Debug, Default, PartialEq)]
pub struct Plan {
    pub ops: Vec<Op>,
    /// A claim ranked above PC Sync wants a light PC Sync is streaming to.
    pub pause_sync: bool,
}

#[derive(Debug, Default)]
pub struct Ownership {
    entries: Vec<Entry>,
    sync: Option<SyncHold>,
}

impl Ownership {
    pub fn entries(&self) -> &[Entry] {
        &self.entries
    }

    fn entry_mut(&mut self, key: &LightKey) -> Option<&mut Entry> {
        self.entries.iter_mut().find(|entry| &entry.key == key)
    }

    fn blocked(&self, key: &LightKey) -> bool {
        self.sync.as_ref().is_some_and(|hold| hold.covers(key))
    }

    pub fn holds(&self, holder: &Holder) -> bool {
        self.entries
            .iter()
            .any(|entry| entry.claims.iter().any(|claim| &claim.holder == holder))
    }

    pub fn holders(&self) -> Vec<Holder> {
        let mut holders: Vec<Holder> = Vec::new();
        for claim in self.entries.iter().flat_map(|entry| &entry.claims) {
            if !holders.contains(&claim.holder) {
                holders.push(claim.holder.clone());
            }
        }
        holders
    }

    /// Replaces every claim `holder` has: lights left out lose it, the rest get
    /// this look. A light seen for the first time remembers how it looks now.
    pub fn claim(
        &mut self,
        holder: &Holder,
        restore: bool,
        transition_ms: u32,
        lights: Vec<ClaimedLight>,
    ) {
        for entry in &mut self.entries {
            if !lights.iter().any(|light| light.key == entry.key) {
                entry.claims.retain(|claim| &claim.holder != holder);
            }
        }
        for light in lights {
            let blocked = self.blocked(&light.key);
            let index = match self.entries.iter().position(|entry| entry.key == light.key) {
                Some(index) => index,
                None => {
                    self.entries.push(Entry {
                        key: light.key.clone(),
                        caps: light.caps,
                        before: None,
                        applied: None,
                        shown: None,
                        claims: Vec::new(),
                        restore: false,
                        stale: false,
                    });
                    self.entries.len() - 1
                }
            };
            let entry = &mut self.entries[index];
            entry.caps = light.caps;
            // Never take PC Sync's stream as the state to return to.
            if entry.before.is_none() && entry.applied.is_none() && !blocked {
                entry.before = Some(light.current);
            }
            let claim = Claim {
                holder: holder.clone(),
                intent: light.intent,
                restore,
                transition_ms,
            };
            match entry
                .claims
                .iter_mut()
                .find(|claim| &claim.holder == holder)
            {
                Some(existing) => *existing = claim,
                None => entry.claims.push(claim),
            }
        }
    }

    pub fn release(&mut self, holder: &Holder) {
        for entry in &mut self.entries {
            entry.claims.retain(|claim| &claim.holder != holder);
        }
    }

    /// PC Sync started or stopped streaming. Lights it let go of may show its
    /// own restore, so their looks are written again.
    pub fn set_sync(&mut self, hold: Option<SyncHold>) {
        if let Some(previous) = self.sync.take() {
            for entry in &mut self.entries {
                if previous.covers(&entry.key) {
                    entry.stale = true;
                }
            }
        }
        self.sync = hold;
    }

    pub fn sync(&self) -> Option<&SyncHold> {
        self.sync.as_ref()
    }

    /// Lights whose original state is still unknown and can now be read.
    pub fn needs_before(&self) -> Vec<LightKey> {
        self.entries
            .iter()
            .filter(|entry| entry.before.is_none() && !self.blocked(&entry.key))
            .map(|entry| entry.key.clone())
            .collect()
    }

    pub fn fill_before(&mut self, key: &LightKey, snapshot: LightSnapshot) {
        if let Some(entry) = self.entry_mut(key) {
            if entry.before.is_none() {
                entry.before = Some(snapshot);
            }
        }
    }

    fn top<'a>(entry: &'a Entry, ranking: &Ranking) -> Option<&'a Claim> {
        entry
            .claims
            .iter()
            .min_by_key(|claim| ranking.holder(&claim.holder))
    }

    /// What has to happen for every light to show its top claim, or go back.
    pub fn plan(&self, ranking: &Ranking) -> Plan {
        let mut plan = Plan::default();
        for entry in &self.entries {
            let blocked = self.blocked(&entry.key);
            match Self::top(entry, ranking) {
                Some(claim) => {
                    if blocked {
                        plan.pause_sync |= ranking.above_sync(&claim.holder);
                        continue;
                    }
                    let Some(before) = &entry.before else {
                        continue;
                    };
                    let showing = entry.shown.as_ref().is_some_and(|shown| {
                        shown.holder == claim.holder && shown.intent.as_ref() == Some(&claim.intent)
                    });
                    if showing && !entry.stale {
                        continue;
                    }
                    let want = claim
                        .intent
                        .want(entry.caps, before, entry.applied.is_none());
                    plan.ops.push(Op::Write {
                        key: entry.key.clone(),
                        holder: claim.holder.clone(),
                        intent: claim.intent.clone(),
                        body: want.body,
                        applied: want.applied,
                        transition_ms: claim.transition_ms,
                    });
                }
                None if blocked => {}
                None => plan.ops.push(match (&entry.before, entry.applied) {
                    (Some(before), Some(expect)) if entry.restore => Op::Restore {
                        key: entry.key.clone(),
                        before: before.clone(),
                        expect,
                    },
                    _ => Op::Forget {
                        key: entry.key.clone(),
                    },
                }),
            }
        }
        plan
    }

    /// A write landed. With no body the light already looked this way.
    pub fn wrote(
        &mut self,
        key: &LightKey,
        holder: &Holder,
        intent: &Intent,
        applied: Option<Applied>,
    ) {
        let Some(entry) = self.entry_mut(key) else {
            return;
        };
        if let Some(applied) = applied {
            entry.applied = Some(applied);
        }
        entry.restore = entry
            .claims
            .iter()
            .find(|claim| &claim.holder == holder)
            .is_none_or(|claim| claim.restore);
        entry.shown = Some(Shown {
            holder: holder.clone(),
            intent: Some(intent.clone()),
        });
        entry.stale = false;
    }

    pub fn state(&self, key: &LightKey) -> Option<EntryState> {
        self.entries
            .iter()
            .find(|entry| &entry.key == key)
            .map(|entry| EntryState {
                applied: entry.applied,
                shown: entry.shown.clone(),
                restore: entry.restore,
                stale: entry.stale,
            })
    }

    /// Undoes a `wrote` whose write never landed.
    pub fn revert(&mut self, key: &LightKey, state: EntryState) {
        if let Some(entry) = self.entry_mut(key) {
            entry.applied = state.applied;
            entry.shown = state.shown;
            entry.restore = state.restore;
            entry.stale = state.stale;
        }
    }

    pub fn applied(&self, key: &LightKey) -> Option<Applied> {
        self.entries
            .iter()
            .find(|entry| &entry.key == key)
            .and_then(|entry| entry.applied)
    }

    /// Replaces what was written with what the bridge reports, so clamping to
    /// a light's gamut or range does not later look like somebody's edit.
    pub fn read_back(&mut self, key: &LightKey, applied: Applied) {
        if let Some(entry) = self.entry_mut(key) {
            if entry.applied.is_some() {
                entry.applied = Some(applied);
            }
        }
    }

    /// Drops a light that went back, or that nothing needs anymore. A light a
    /// claim took again in the meantime stays.
    pub fn settled(&mut self, key: &LightKey) {
        self.entries
            .retain(|entry| &entry.key != key || !entry.claims.is_empty());
    }

    /// Every light the runtime has changed, for the recovery journal.
    pub fn journal(&self) -> Vec<JournalEntry> {
        self.entries
            .iter()
            .filter_map(|entry| {
                Some(JournalEntry {
                    key: entry.key.clone(),
                    before: entry.before.clone()?,
                    applied: entry.applied?,
                    holder: entry.shown.as_ref()?.holder.clone(),
                    restore: entry.restore,
                })
            })
            .collect()
    }

    /// Takes back a light a previous run left changed, to be put back like
    /// any light whose claim ended.
    pub fn adopt(&mut self, saved: JournalEntry, caps: Caps) {
        if self.entries.iter().any(|entry| entry.key == saved.key) {
            return;
        }
        self.entries.push(Entry {
            key: saved.key,
            caps,
            before: Some(saved.before),
            applied: Some(saved.applied),
            shown: Some(Shown {
                holder: saved.holder,
                intent: None,
            }),
            claims: Vec::new(),
            restore: saved.restore,
            stale: false,
        });
    }

    /// Every light shown by a claim ranked above PC Sync, with that holder.
    pub fn held_above_sync(&self, ranking: &Ranking) -> Vec<(LightKey, Holder)> {
        self.entries
            .iter()
            .filter_map(|entry| {
                let claim = Self::top(entry, ranking)?;
                ranking
                    .above_sync(&claim.holder)
                    .then(|| (entry.key.clone(), claim.holder.clone()))
            })
            .collect()
    }

    /// Whether any claim ranked above PC Sync still wants a light in `area`.
    pub fn wants_area_above_sync(&self, ranking: &Ranking, area: &SyncHold) -> bool {
        self.entries.iter().any(|entry| {
            area.covers(&entry.key)
                && Self::top(entry, ranking).is_some_and(|claim| ranking.above_sync(&claim.holder))
        })
    }

    /// A one-time change such as a presence scene, ranked `rank`. Lights a
    /// higher claim holds keep that claim's look and land on this one when it
    /// ends; lights held only by lower claims are taken from them. Lights PC
    /// Sync is streaming to are skipped. Returns the lights to write now.
    pub fn one_shot(
        &mut self,
        ranking: &Ranking,
        rank: Rank,
        lights: Vec<ClaimedLight>,
    ) -> Vec<ClaimedLight> {
        let mut now = Vec::new();
        for light in lights {
            if self.blocked(&light.key) {
                continue;
            }
            let Some(index) = self.entries.iter().position(|entry| entry.key == light.key) else {
                now.push(light);
                continue;
            };
            let higher = Self::top(&self.entries[index], ranking)
                .is_some_and(|claim| ranking.holder(&claim.holder) < rank);
            if higher {
                let entry = &mut self.entries[index];
                let base = entry
                    .before
                    .clone()
                    .unwrap_or_else(|| light.current.clone());
                entry.before = Some(light.intent.result(light.caps, &base));
                entry.stale = true;
            } else {
                self.entries.remove(index);
                now.push(light);
            }
        }
        now
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::automations::looks::Write;
    use crate::services::automations::priority::Source;

    fn key(light: &str) -> LightKey {
        LightKey {
            bridge_id: "BRIDGE".into(),
            light_id: light.into(),
        }
    }

    const CAPS: Caps = Caps {
        dimmable: true,
        color: true,
        ct: Some((153, 500)),
    };

    fn state(light: &str, on: bool, brightness: f64) -> LightSnapshot {
        LightSnapshot {
            id: light.into(),
            on,
            brightness: Some(brightness),
            color_mode: Some("xy".into()),
            xy: Some([0.3, 0.4]),
            mirek: None,
        }
    }

    fn light(id: &str, on: bool, brightness: f64, write: Write) -> ClaimedLight {
        ClaimedLight {
            key: key(id),
            caps: CAPS,
            current: state(id, on, brightness),
            intent: Intent::Look(write),
        }
    }

    const RED: Write = Write::Color {
        xy: [0.675, 0.322],
        brightness: 100.0,
    };

    fn ranking() -> Ranking {
        Ranking::new(&Source::DEFAULT_ORDER, Vec::new())
    }

    /// Carries out a plan as if every write landed exactly.
    fn apply(owners: &mut Ownership, plan: &Plan) {
        for op in &plan.ops {
            match op {
                Op::Write {
                    key,
                    holder,
                    intent,
                    body,
                    applied,
                    ..
                } => owners.wrote(key, holder, intent, body.is_some().then_some(*applied)),
                Op::Restore { key, .. } | Op::Forget { key } => owners.settled(key),
            }
        }
    }

    fn run(owners: &mut Ownership, ranking: &Ranking) {
        let plan = owners.plan(ranking);
        apply(owners, &plan);
    }

    fn written(plan: &Plan) -> Vec<(String, Holder)> {
        plan.ops
            .iter()
            .filter_map(|op| match op {
                Op::Write {
                    key,
                    holder,
                    body: Some(_),
                    ..
                } => Some((key.light_id.clone(), holder.clone())),
                _ => None,
            })
            .collect()
    }

    #[test]
    fn the_higher_claim_shows_regardless_of_start_order() {
        let mut owners = Ownership::default();
        owners.claim(
            &Holder::OnAir,
            true,
            0,
            vec![light("desk", true, 40.0, RED)],
        );
        run(&mut owners, &ranking());

        // Locking during the call: on-air ranks above away, so the lamp stays red.
        owners.claim(
            &Holder::Away,
            true,
            0,
            vec![light("desk", false, 100.0, Write::Off)],
        );
        assert!(owners.plan(&ranking()).ops.is_empty());

        // The call ends while locked: away takes the lamp.
        owners.release(&Holder::OnAir);
        let plan = owners.plan(&ranking());
        assert_eq!(written(&plan), vec![("desk".into(), Holder::Away)]);
        apply(&mut owners, &plan);

        // Unlocking puts back the lamp as it was before the call, not red.
        owners.release(&Holder::Away);
        let plan = owners.plan(&ranking());
        match &plan.ops[..] {
            [Op::Restore { before, .. }] => {
                assert!(before.on);
                assert_eq!(before.brightness, Some(40.0));
            }
            other => panic!("expected a restore, got {other:?}"),
        }
    }

    #[test]
    fn a_reordered_priority_lets_away_win() {
        let ranking = Ranking::new(&[Source::Away, Source::OnAir], Vec::new());
        let mut owners = Ownership::default();
        owners.claim(
            &Holder::OnAir,
            true,
            0,
            vec![light("desk", true, 40.0, RED)],
        );
        run(&mut owners, &ranking);
        owners.claim(
            &Holder::Away,
            true,
            0,
            vec![light("desk", true, 100.0, Write::Off)],
        );
        let plan = owners.plan(&ranking);
        // Off is worked out against the lamp before the call: it was on.
        assert_eq!(written(&plan), vec![("desk".into(), Holder::Away)]);
    }

    #[test]
    fn ending_without_restore_leaves_the_look() {
        let mut owners = Ownership::default();
        owners.claim(
            &Holder::Away,
            false,
            0,
            vec![light("hall", true, 60.0, Write::Off)],
        );
        run(&mut owners, &ranking());
        owners.release(&Holder::Away);
        assert_eq!(
            owners.plan(&ranking()).ops,
            vec![Op::Forget { key: key("hall") }]
        );
    }

    #[test]
    fn a_claim_that_changed_nothing_restores_nothing() {
        let mut owners = Ownership::default();
        owners.claim(
            &Holder::Away,
            true,
            0,
            vec![light("hall", false, 60.0, Write::Off)],
        );
        let plan = owners.plan(&ranking());
        assert!(written(&plan).is_empty());
        apply(&mut owners, &plan);
        owners.release(&Holder::Away);
        assert_eq!(
            owners.plan(&ranking()).ops,
            vec![Op::Forget { key: key("hall") }]
        );
    }

    #[test]
    fn a_changed_look_is_written_without_restoring_first() {
        let mut owners = Ownership::default();
        owners.claim(
            &Holder::Focus,
            true,
            0,
            vec![light("desk", true, 40.0, RED)],
        );
        run(&mut owners, &ranking());
        let blue = Write::Color {
            xy: [0.15, 0.06],
            brightness: 70.0,
        };
        owners.claim(
            &Holder::Focus,
            true,
            1500,
            vec![light("desk", true, 100.0, blue)],
        );
        let plan = owners.plan(&ranking());
        match &plan.ops[..] {
            [Op::Write {
                transition_ms,
                body: Some(_),
                ..
            }] => assert_eq!(*transition_ms, 1500),
            other => panic!("expected one write, got {other:?}"),
        }
        // Its original state is still the one from before the first look.
        assert_eq!(
            owners.entries()[0].before.as_ref().unwrap().brightness,
            Some(40.0)
        );
    }

    #[test]
    fn lights_left_out_of_a_new_claim_go_back() {
        let mut owners = Ownership::default();
        owners.claim(
            &Holder::OnAir,
            true,
            0,
            vec![
                light("desk", true, 40.0, RED),
                light("shelf", true, 40.0, RED),
            ],
        );
        run(&mut owners, &ranking());
        owners.claim(
            &Holder::OnAir,
            true,
            0,
            vec![light("desk", true, 100.0, RED)],
        );
        let plan = owners.plan(&ranking());
        assert!(matches!(&plan.ops[..], [Op::Restore { key, .. }] if key.light_id == "shelf"));
    }

    #[test]
    fn pc_sync_keeps_its_lights_from_lower_claims() {
        let mut owners = Ownership::default();
        owners.set_sync(Some(SyncHold {
            bridge_id: "bridge".into(),
            light_ids: HashSet::from(["tv".to_string()]),
        }));
        owners.claim(
            &Holder::Calendar("standup".into()),
            true,
            0,
            vec![light("tv", true, 90.0, RED), light("desk", true, 40.0, RED)],
        );
        let plan = owners.plan(&ranking());
        assert!(!plan.pause_sync);
        assert_eq!(
            written(&plan),
            vec![("desk".into(), Holder::Calendar("standup".into()))]
        );
        apply(&mut owners, &plan);

        // The stream's colors were never taken as the TV's original state.
        owners.set_sync(None);
        assert_eq!(owners.needs_before(), vec![key("tv")]);
        owners.fill_before(&key("tv"), state("tv", true, 55.0));
        let plan = owners.plan(&ranking());
        assert_eq!(
            written(&plan),
            vec![("tv".into(), Holder::Calendar("standup".into()))]
        );
    }

    #[test]
    fn a_claim_above_pc_sync_asks_for_it_to_pause() {
        let mut owners = Ownership::default();
        let hold = SyncHold {
            bridge_id: "BRIDGE".into(),
            light_ids: HashSet::from(["tv".to_string()]),
        };
        owners.set_sync(Some(hold.clone()));
        owners.claim(&Holder::OnAir, true, 0, vec![light("tv", true, 90.0, RED)]);
        assert!(owners.plan(&ranking()).pause_sync);
        assert!(owners.wants_area_above_sync(&ranking(), &hold));
        assert_eq!(owners.held_above_sync(&ranking()).len(), 1);
    }

    #[test]
    fn looks_under_pc_sync_are_written_again_when_it_stops() {
        let mut owners = Ownership::default();
        owners.claim(
            &Holder::Calendar("focus".into()),
            true,
            0,
            vec![light("tv", true, 90.0, RED)],
        );
        run(&mut owners, &ranking());
        owners.set_sync(Some(SyncHold {
            bridge_id: "BRIDGE".into(),
            light_ids: HashSet::from(["tv".to_string()]),
        }));
        owners.set_sync(None);
        assert_eq!(written(&owners.plan(&ranking())).len(), 1);
    }

    #[test]
    fn a_one_shot_under_a_higher_hold_becomes_the_look_to_return_to() {
        let mut owners = Ownership::default();
        owners.claim(
            &Holder::OnAir,
            true,
            0,
            vec![light("desk", false, 40.0, RED)],
        );
        run(&mut owners, &ranking());
        let warm = Write::White {
            mirek: 366,
            brightness: 80.0,
        };
        let now = owners.one_shot(
            &ranking(),
            ranking().source(Source::Presence),
            vec![
                light("desk", true, 100.0, warm),
                light("hall", false, 0.0, warm),
            ],
        );
        assert_eq!(now.len(), 1);
        assert_eq!(now[0].key.light_id, "hall");
        owners.release(&Holder::OnAir);
        match &owners.plan(&ranking()).ops[..] {
            [Op::Restore { before, .. }] => {
                assert!(before.on);
                assert_eq!(before.mirek, Some(366));
            }
            other => panic!("expected a restore, got {other:?}"),
        }
    }

    #[test]
    fn the_journal_keeps_changed_lights_and_adopted_ones_go_back() {
        let mut owners = Ownership::default();
        owners.claim(
            &Holder::OnAir,
            true,
            0,
            vec![light("desk", true, 40.0, RED)],
        );
        assert!(owners.journal().is_empty());
        run(&mut owners, &ranking());
        let saved = owners.journal();
        assert_eq!(saved.len(), 1);
        assert_eq!(saved[0].holder, Holder::OnAir);

        // A new run starts with nothing but the journal.
        let mut next = Ownership::default();
        next.adopt(saved[0].clone(), CAPS);
        assert!(matches!(
            &next.plan(&ranking()).ops[..],
            [Op::Restore { .. }]
        ));
        // A call still going on takes the lamp back without losing its original.
        next.claim(
            &Holder::OnAir,
            true,
            0,
            vec![light("desk", true, 100.0, RED)],
        );
        assert_eq!(written(&next.plan(&ranking())).len(), 1);
        assert_eq!(
            next.entries()[0].before.as_ref().unwrap().brightness,
            Some(40.0)
        );
    }

    #[test]
    fn preview_outranks_and_hands_back() {
        let mut owners = Ownership::default();
        owners.claim(
            &Holder::Away,
            true,
            0,
            vec![light("desk", true, 80.0, Write::Dim(10.0))],
        );
        run(&mut owners, &ranking());
        owners.claim(
            &Holder::Preview,
            true,
            0,
            vec![light("desk", true, 10.0, RED)],
        );
        let plan = owners.plan(&ranking());
        assert_eq!(written(&plan), vec![("desk".into(), Holder::Preview)]);
        apply(&mut owners, &plan);
        owners.release(&Holder::Preview);
        let plan = owners.plan(&ranking());
        // Back to away's dim, with the lamp's own color rather than red.
        match &plan.ops[..] {
            [Op::Write {
                holder: Holder::Away,
                body: Some(body),
                ..
            }] => {
                assert_eq!(body["dimming"]["brightness"], 10.0);
                assert_eq!(body["color"]["xy"]["x"], 0.3);
            }
            other => panic!("expected away's look, got {other:?}"),
        }
    }
}
