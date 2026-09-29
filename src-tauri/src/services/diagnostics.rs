//! In-memory trail of what Mote tried and how it ended, sent only when the
//! user presses Send on a report.
//!
//! Every step and outcome is a `&'static str` written in this codebase, so no
//! Hue name, address, id, or error text can reach the trail. The hosted
//! endpoint enforces the same rule (lowercase letters and underscores only).
//! Nothing here is written to disk; the trail starts empty on each launch.

use serde::Serialize;
use std::collections::{BTreeMap, VecDeque};
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

const MAX_STEPS: usize = 60;

#[derive(Debug, Clone, Serialize)]
pub struct Step {
    /// Milliseconds since Mote started.
    pub t: u64,
    pub step: &'static str,
    pub outcome: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub n: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
pub enum Fact {
    Flag(bool),
    Count(u64),
    Code(&'static str),
}

#[derive(Debug, Clone, Serialize)]
pub struct Diagnostics {
    pub v: u8,
    pub code: Option<String>,
    pub facts: BTreeMap<&'static str, Fact>,
    pub steps: Vec<Step>,
}

struct Trail {
    started: Instant,
    steps: VecDeque<Step>,
    /// The last bridge address seen, kept only to work out `same_subnet`. It
    /// is never serialised.
    last_device_ip: Option<std::net::IpAddr>,
}

fn trail() -> &'static Mutex<Trail> {
    static TRAIL: OnceLock<Mutex<Trail>> = OnceLock::new();
    TRAIL.get_or_init(|| {
        Mutex::new(Trail {
            started: Instant::now(),
            steps: VecDeque::with_capacity(MAX_STEPS),
            last_device_ip: None,
        })
    })
}

/// Starts the clock steps are timed from. Called once at app start; without
/// it the clock would start at the first recorded step.
pub fn init() {
    let _ = trail();
}

/// A step being recorded; finish it with [`Record::save`].
pub struct Record {
    step: Step,
}

impl Record {
    pub fn ms(mut self, ms: u128) -> Self {
        self.step.ms = Some(ms.min(i32::MAX as u128) as u64);
        self
    }
    pub fn n(mut self, n: usize) -> Self {
        self.step.n = Some(n as u64);
        self
    }
    pub fn status(mut self, status: u16) -> Self {
        self.step.status = Some(status.into());
        self
    }
    pub fn save(self) {
        let Ok(mut trail) = trail().lock() else {
            return;
        };
        // Polling loops (pairing, reconnects) repeat the same result many
        // times; one entry says as much and keeps room for what came before.
        if let Some(last) = trail.steps.back_mut() {
            if last.step == self.step.step && last.outcome == self.step.outcome {
                last.t = self.step.t;
                return;
            }
        }
        if trail.steps.len() == MAX_STEPS {
            trail.steps.pop_front();
        }
        trail.steps.push_back(self.step);
    }
}

pub fn record(step: &'static str, outcome: &'static str) -> Record {
    // Capped at the endpoint's limit (about 24 days) so a long-running Mote
    // doesn't have its whole report's diagnostics refused.
    let t = trail()
        .lock()
        .map(|trail| trail.started.elapsed().as_millis().min(i32::MAX as u128) as u64)
        .unwrap_or(0);
    Record {
        step: Step {
            t,
            step,
            outcome,
            ms: None,
            n: None,
            status: None,
        },
    }
}

/// Remembers the bridge address in play so the report can say whether the PC
/// is on the same subnet, without ever including the address.
pub fn note_device_ip(ip: &str) {
    let Ok(address) = ip.split('%').next().unwrap_or(ip).parse() else {
        return;
    };
    if let Ok(mut trail) = trail().lock() {
        trail.last_device_ip = Some(address);
    }
}

/// A short code for the most recent failure, e.g. `mdns_empty_cloud_busy`,
/// shown on error screens and sent as the report's code.
fn failure_code(steps: &[Step]) -> Option<String> {
    // A failure that the same step later got past is history, not the problem.
    let mut recovered: Vec<&str> = Vec::new();
    let last_failure = steps.iter().rev().find(|step| {
        if !is_failure(step.outcome) {
            recovered.push(step.step);
            return false;
        }
        !recovered.contains(&step.step)
    })?;
    // Discovery fails in two stages; name both so the code tells the story.
    if last_failure.step == "cloud_lookup" {
        let mdns = steps
            .iter()
            .rev()
            .find(|step| step.step == "mdns_discovery")
            .map(|step| step.outcome)
            .unwrap_or("skipped");
        return Some(format!("mdns_{mdns}_cloud_{}", last_failure.outcome));
    }
    Some(format!("{}_{}", last_failure.step, last_failure.outcome))
}

fn is_failure(outcome: &str) -> bool {
    !matches!(
        outcome,
        "ok" | "found" | "connected" | "started" | "stopped" | "restored" | "rediscovered"
    )
}

/// The code for the latest failure, for error screens to show.
pub fn current_code() -> Option<String> {
    let steps: Vec<Step> = trail()
        .lock()
        .map(|trail| trail.steps.iter().cloned().collect())
        .unwrap_or_default();
    failure_code(&steps)
}

/// Everything a report would include, gathered now. Slow system queries run
/// here rather than on every step, so recording stays cheap.
pub fn snapshot(packaged: bool) -> Diagnostics {
    let (steps, bridge_ip) = trail()
        .lock()
        .map(|trail| {
            (
                trail.steps.iter().cloned().collect::<Vec<_>>(),
                trail.last_device_ip,
            )
        })
        .unwrap_or_default();

    let mut facts = BTreeMap::new();
    facts.insert("packaged", Fact::Flag(packaged));
    facts.insert("debug_build", Fact::Flag(cfg!(debug_assertions)));
    system::add_facts(&mut facts, bridge_ip);

    Diagnostics {
        v: 1,
        code: failure_code(&steps),
        facts,
        steps,
    }
}

/// Plain lines for the report preview, so the user can read what is sent.
pub fn describe(diagnostics: &Diagnostics) -> Vec<String> {
    let mut lines = Vec::new();
    if let Some(code) = &diagnostics.code {
        lines.push(format!("Error code: {}", display_code(code)));
    }
    for (key, fact) in &diagnostics.facts {
        let value = match fact {
            Fact::Flag(flag) => if *flag { "yes" } else { "no" }.to_string(),
            Fact::Count(count) => count.to_string(),
            Fact::Code(code) => (*code).to_string(),
        };
        lines.push(format!("{}: {value}", key.replace('_', " ")));
    }
    for step in &diagnostics.steps {
        let mut line = format!(
            "{:>7.1}s  {} → {}",
            step.t as f64 / 1000.0,
            step.step.replace('_', " "),
            step.outcome.replace('_', " ")
        );
        if let Some(n) = step.n {
            line.push_str(&format!(", {n} found"));
        }
        if let Some(status) = step.status {
            line.push_str(&format!(", HTTP {status}"));
        }
        if let Some(ms) = step.ms {
            line.push_str(&format!(", {ms} ms"));
        }
        lines.push(line);
    }
    lines
}

/// `mdns_empty_cloud_busy` → `MDNS-EMPTY-CLOUD-BUSY`, easier to read aloud.
pub fn display_code(code: &str) -> String {
    code.to_uppercase().replace('_', "-")
}

#[cfg(windows)]
mod system {
    use super::Fact;
    use std::collections::BTreeMap;
    use std::net::IpAddr;
    use windows::core::{Interface, BSTR};
    use windows::Win32::NetworkManagement::WindowsFirewall::{
        INetFwPolicy2, INetFwRule, NetFwPolicy2, NET_FW_ACTION_BLOCK, NET_FW_RULE_DIR_IN,
    };
    use windows::Win32::Networking::NetworkListManager::{
        INetworkListManager, NetworkListManager, NLM_ENUM_NETWORK_CONNECTED,
        NLM_NETWORK_CATEGORY_DOMAIN_AUTHENTICATED, NLM_NETWORK_CATEGORY_PRIVATE,
        NLM_NETWORK_CATEGORY_PUBLIC,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, COINIT_MULTITHREADED,
    };
    use windows::Win32::System::Ole::IEnumVARIANT;
    use windows::Win32::System::Variant::VARIANT;

    pub fn add_facts(facts: &mut BTreeMap<&'static str, Fact>, bridge_ip: Option<IpAddr>) {
        if let Some(build) = windows_build() {
            facts.insert("windows_build", Fact::Count(build));
        }
        // COM on its own thread, so the caller's apartment never matters.
        let com_facts = std::thread::spawn(|| {
            let mut found = BTreeMap::new();
            // SAFETY: balanced by CoUninitialize below on this same thread.
            let initialised = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }.is_ok();
            found.insert("network", Fact::Code(network_category()));
            let (firewall_on, mote_rule) = firewall_state();
            if let Some(on) = firewall_on {
                found.insert("firewall_on", Fact::Flag(on));
            }
            found.insert("firewall_mote_rule", Fact::Code(mote_rule));
            if initialised {
                // SAFETY: pairs with the successful CoInitializeEx above.
                unsafe { CoUninitialize() };
            }
            found
        })
        .join()
        .unwrap_or_default();
        facts.extend(com_facts);

        let adapters = adapters::scan(bridge_ip);
        facts.insert("vpn_active", Fact::Flag(adapters.vpn_active));
        facts.insert("virtual_adapters", Fact::Count(adapters.virtual_adapters));
        facts.insert("active_adapters", Fact::Count(adapters.active_adapters));
        if let Some(same) = adapters.same_subnet {
            facts.insert("same_subnet", Fact::Flag(same));
        }
    }

    fn windows_build() -> Option<u64> {
        windows_registry::LOCAL_MACHINE
            .open(r"SOFTWARE\Microsoft\Windows NT\CurrentVersion")
            .ok()?
            .get_string("CurrentBuildNumber")
            .ok()?
            .parse()
            .ok()
    }

    /// The category of the connected network(s). Several at once is rare but
    /// happens (Wi-Fi plus a VPN), and they can differ.
    fn network_category() -> &'static str {
        let result = (|| -> windows::core::Result<&'static str> {
            // SAFETY: plain COM activation on a thread that initialised COM.
            let manager: INetworkListManager =
                unsafe { CoCreateInstance(&NetworkListManager, None, CLSCTX_ALL)? };
            let networks = unsafe { manager.GetNetworks(NLM_ENUM_NETWORK_CONNECTED)? };
            let mut seen: Option<&'static str> = None;
            loop {
                let mut slot = [None];
                let mut fetched = 0;
                unsafe { networks.Next(&mut slot, Some(&mut fetched))? };
                let Some(network) = slot[0].take() else { break };
                if fetched == 0 {
                    break;
                }
                let category = match unsafe { network.GetCategory()? } {
                    NLM_NETWORK_CATEGORY_PUBLIC => "public",
                    NLM_NETWORK_CATEGORY_PRIVATE => "private",
                    NLM_NETWORK_CATEGORY_DOMAIN_AUTHENTICATED => "domain",
                    _ => "unknown",
                };
                seen = match seen {
                    None => Some(category),
                    Some(previous) if previous == category => Some(previous),
                    Some(_) => Some("mixed"),
                };
            }
            Ok(seen.unwrap_or("none"))
        })();
        result.unwrap_or("unknown")
    }

    /// Whether the firewall is on for the active profile, and what inbound
    /// rules for this executable do there: `blocked` wins over `allowed`, as
    /// it does in the firewall itself.
    fn firewall_state() -> (Option<bool>, &'static str) {
        let result = (|| -> windows::core::Result<(Option<bool>, &'static str)> {
            // SAFETY: plain COM activation on a thread that initialised COM.
            let policy: INetFwPolicy2 =
                unsafe { CoCreateInstance(&NetFwPolicy2, None, CLSCTX_ALL)? };
            let profiles = unsafe { policy.CurrentProfileTypes()? };
            let firewall_on = unsafe {
                policy
                    .get_FirewallEnabled(
                        windows::Win32::NetworkManagement::WindowsFirewall::NET_FW_PROFILE_TYPE2(
                            profiles,
                        ),
                    )
                    .ok()
                    .map(|enabled| enabled.as_bool())
            };

            let Some(exe) = std::env::current_exe()
                .ok()
                .map(|path| path.to_string_lossy().to_lowercase())
            else {
                return Ok((firewall_on, "unknown"));
            };

            let rules = unsafe { policy.Rules()? };
            let enumerator: IEnumVARIANT = unsafe { rules._NewEnum()? }.cast()?;
            let mut allowed = false;
            let mut blocked = false;
            loop {
                let mut slot = [VARIANT::default()];
                let mut fetched = 0;
                let _ = unsafe { enumerator.Next(&mut slot, &mut fetched) };
                if fetched == 0 {
                    break;
                }
                let Ok(dispatch) = windows::Win32::System::Com::IDispatch::try_from(&slot[0])
                else {
                    continue;
                };
                let Ok(rule) = dispatch.cast::<INetFwRule>() else {
                    continue;
                };
                let applies = unsafe {
                    rule.Enabled().map(|value| value.as_bool()).unwrap_or(false)
                        && rule.Direction().ok() == Some(NET_FW_RULE_DIR_IN)
                        && rule.Profiles().map(|p| p & profiles != 0).unwrap_or(false)
                };
                if !applies {
                    continue;
                }
                let name: BSTR = unsafe { rule.ApplicationName() }.unwrap_or_default();
                if name.to_string().to_lowercase() != exe {
                    continue;
                }
                if unsafe { rule.Action() }.ok() == Some(NET_FW_ACTION_BLOCK) {
                    blocked = true;
                } else {
                    allowed = true;
                }
            }
            let state = if blocked {
                "blocked"
            } else if allowed {
                "allowed"
            } else {
                "none"
            };
            Ok((firewall_on, state))
        })();
        result.unwrap_or((None, "unknown"))
    }

    mod adapters {
        use std::net::IpAddr;
        use windows_sys::Win32::Foundation::ERROR_BUFFER_OVERFLOW;
        use windows_sys::Win32::NetworkManagement::IpHelper::{
            GetAdaptersAddresses, GAA_FLAG_SKIP_ANYCAST, GAA_FLAG_SKIP_DNS_SERVER,
            GAA_FLAG_SKIP_MULTICAST, IF_TYPE_PPP, IF_TYPE_PROP_VIRTUAL, IF_TYPE_SOFTWARE_LOOPBACK,
            IF_TYPE_TUNNEL, IP_ADAPTER_ADDRESSES_LH,
        };
        use windows_sys::Win32::NetworkManagement::Ndis::IfOperStatusUp;
        use windows_sys::Win32::Networking::WinSock::{AF_INET, AF_UNSPEC, SOCKADDR_IN};

        #[derive(Default)]
        pub struct Summary {
            pub active_adapters: u64,
            pub virtual_adapters: u64,
            pub vpn_active: bool,
            pub same_subnet: Option<bool>,
        }

        /// Counts adapters and checks the bridge's subnet. Adapter names are
        /// read only to spot virtual and VPN adapters; none are kept.
        pub fn scan(bridge_ip: Option<IpAddr>) -> Summary {
            let mut summary = Summary::default();
            let flags = GAA_FLAG_SKIP_ANYCAST | GAA_FLAG_SKIP_MULTICAST | GAA_FLAG_SKIP_DNS_SERVER;
            let mut size: u32 = 16 * 1024;
            let mut buffer: Vec<u8>;
            loop {
                buffer = vec![0u8; size as usize];
                // SAFETY: the buffer is `size` bytes and outlives the call.
                let result = unsafe {
                    GetAdaptersAddresses(
                        AF_UNSPEC as u32,
                        flags,
                        std::ptr::null(),
                        buffer.as_mut_ptr() as *mut IP_ADAPTER_ADDRESSES_LH,
                        &mut size,
                    )
                };
                if result == ERROR_BUFFER_OVERFLOW {
                    continue;
                }
                if result != 0 {
                    return summary;
                }
                break;
            }

            let bridge_v4 = match bridge_ip {
                Some(IpAddr::V4(address)) => Some(u32::from(address)),
                _ => None,
            };
            let mut subnet_match = false;

            let mut current = buffer.as_ptr() as *const IP_ADAPTER_ADDRESSES_LH;
            while !current.is_null() {
                // SAFETY: GetAdaptersAddresses filled a linked list inside `buffer`.
                let adapter = unsafe { &*current };
                current = adapter.Next;
                if adapter.OperStatus != IfOperStatusUp
                    || adapter.IfType == IF_TYPE_SOFTWARE_LOOPBACK
                {
                    continue;
                }
                summary.active_adapters += 1;
                let description = wide_to_lower(adapter.Description);
                let is_vpn = adapter.IfType == IF_TYPE_PPP
                    || adapter.IfType == IF_TYPE_TUNNEL
                    || [
                        "vpn",
                        "wireguard",
                        "tap-windows",
                        "openvpn",
                        "tailscale",
                        "zerotier",
                    ]
                    .iter()
                    .any(|word| description.contains(word));
                let is_virtual = adapter.IfType == IF_TYPE_PROP_VIRTUAL
                    || ["hyper-v", "virtual", "vmware", "virtualbox", "wsl"]
                        .iter()
                        .any(|word| description.contains(word));
                if is_vpn {
                    summary.vpn_active = true;
                }
                if is_virtual {
                    summary.virtual_adapters += 1;
                }

                let Some(bridge) = bridge_v4 else { continue };
                let mut unicast = adapter.FirstUnicastAddress;
                while !unicast.is_null() {
                    // SAFETY: part of the same list.
                    let entry = unsafe { &*unicast };
                    unicast = entry.Next;
                    let sockaddr = entry.Address.lpSockaddr;
                    if sockaddr.is_null() {
                        continue;
                    }
                    // SAFETY: checked non-null; family says which struct it is.
                    if unsafe { (*sockaddr).sa_family } != AF_INET {
                        continue;
                    }
                    let v4 = unsafe { &*(sockaddr as *const SOCKADDR_IN) };
                    // SAFETY: S_un is a union; S_addr is valid for any IPv4 address.
                    let local = u32::from_be(unsafe { v4.sin_addr.S_un.S_addr });
                    let prefix = u32::from(entry.OnLinkPrefixLength).min(32);
                    let mask = if prefix == 0 {
                        0
                    } else {
                        u32::MAX << (32 - prefix)
                    };
                    if local & mask == bridge & mask {
                        subnet_match = true;
                    }
                }
            }

            if bridge_v4.is_some() {
                summary.same_subnet = Some(subnet_match);
            }
            summary
        }

        fn wide_to_lower(pointer: *const u16) -> String {
            if pointer.is_null() {
                return String::new();
            }
            // SAFETY: a NUL-terminated wide string owned by the adapter list.
            let length = (0..)
                .take_while(|&i| unsafe { *pointer.add(i) } != 0)
                .count();
            let slice = unsafe { std::slice::from_raw_parts(pointer, length) };
            String::from_utf16_lossy(slice).to_lowercase()
        }
    }
}

#[cfg(not(windows))]
mod system {
    use super::Fact;
    use std::collections::BTreeMap;
    use std::net::IpAddr;

    pub fn add_facts(_facts: &mut BTreeMap<&'static str, Fact>, _bridge_ip: Option<IpAddr>) {}
}

#[cfg(test)]
mod tests {
    use super::*;

    fn step(step: &'static str, outcome: &'static str) -> Step {
        Step {
            t: 0,
            step,
            outcome,
            ms: None,
            n: None,
            status: None,
        }
    }

    #[test]
    fn names_both_discovery_stages() {
        let steps = [
            step("mdns_discovery", "empty"),
            step("cloud_lookup", "rate_limited"),
        ];
        assert_eq!(
            failure_code(&steps).as_deref(),
            Some("mdns_empty_cloud_rate_limited")
        );
    }

    #[test]
    fn forgets_a_failure_the_same_step_got_past() {
        let steps = [step("pairing", "button_not_pressed"), step("pairing", "ok")];
        assert_eq!(failure_code(&steps), None);
        assert_eq!(failure_code(&[step("restore", "restored")]), None);
    }

    #[test]
    fn keeps_a_failure_other_steps_did_not_fix() {
        let steps = [
            step("pc_sync_start", "dtls_failed"),
            step("restore", "restored"),
        ];
        assert_eq!(
            failure_code(&steps).as_deref(),
            Some("pc_sync_start_dtls_failed")
        );
    }

    #[cfg(windows)]
    #[test]
    fn reads_the_system_facts() {
        note_device_ip("192.168.5.208");
        let snapshot = snapshot(false);
        for key in [
            "network",
            "firewall_mote_rule",
            "vpn_active",
            "windows_build",
        ] {
            assert!(snapshot.facts.contains_key(key), "missing {key}");
        }
        // Printed for a human check with `cargo test -- --nocapture`.
        for line in describe(&snapshot) {
            println!("{line}");
        }
    }

    #[test]
    fn codes_contain_only_what_the_endpoint_accepts() {
        let code = failure_code(&[step("sync_box_pairing", "timeout")]).unwrap();
        assert!(code.chars().all(|c| c.is_ascii_lowercase() || c == '_'));
    }
}
