//! Finds the devices on the home network, so a phone can be picked from a list
//! rather than typed in, and finds a phone again when the router gives it a
//! new address.
//!
//! A sweep asks every address on this PC's home network, the one its router
//! is on, with a fresh ARP request. Nothing leaves the local network, and
//! nothing found is kept except the phones the person picks.

use std::collections::HashMap;
use std::net::Ipv4Addr;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;

use super::presence_probe::{
    cached_neighbors, gateway, hosts, is_private_mac, local_networks, resolve_mac, reverse_name,
};

/// ARP requests in flight at once; an address that does not answer holds its
/// thread for a few seconds.
const SWEEP_THREADS: usize = 128;
const NAME_THREADS: usize = 16;
/// Apple devices announce their own name, like "Alex's iPhone".
const APPLE_NAMES: &str = "_companion-link._tcp.local.";
const MDNS_LISTEN: Duration = Duration::from_millis(2500);

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FoundDevice {
    pub ip: String,
    pub mac: String,
    /// What the device calls itself, when it says.
    pub name: Option<String>,
    /// A hardware address made up for this network, as phones use.
    pub private_address: bool,
    /// "router" or "hue" for devices that are certainly not a phone.
    pub kind: Option<&'static str>,
}

/// The addresses a sweep covers: the network the router is on, or every
/// private network this PC is on when it has no router.
fn sweep_hosts() -> Vec<Ipv4Addr> {
    let networks = local_networks();
    let router = gateway();
    let home: Vec<_> = networks
        .iter()
        .copied()
        .filter(|(address, mask)| {
            router.is_some_and(|router| {
                u32::from(*address) & u32::from(*mask) == u32::from(router) & u32::from(*mask)
            })
        })
        .collect();
    hosts(if home.is_empty() { &networks } else { &home })
}

/// Every address that answers a fresh ARP request, with its hardware address.
/// Blocks for several seconds.
fn sweep(targets: &[Ipv4Addr]) -> Vec<(Ipv4Addr, String)> {
    let next = AtomicUsize::new(0);
    let found = Mutex::new(Vec::new());
    std::thread::scope(|scope| {
        for _ in 0..SWEEP_THREADS.min(targets.len()) {
            scope.spawn(|| loop {
                let index = next.fetch_add(1, Ordering::Relaxed);
                let Some(ip) = targets.get(index) else {
                    break;
                };
                if let Some(mac) = resolve_mac(*ip) {
                    found.lock().expect("sweep lock poisoned").push((*ip, mac));
                }
            });
        }
    });
    let mut found = found.into_inner().expect("sweep lock poisoned");
    found.sort();
    found
}

/// The names Apple devices announce over mDNS, by address.
fn announced_names() -> HashMap<Ipv4Addr, String> {
    let mut names = HashMap::new();
    let Ok(mdns) = mdns_sd::ServiceDaemon::new() else {
        return names;
    };
    if let Ok(receiver) = mdns.browse(APPLE_NAMES) {
        let started = Instant::now();
        while started.elapsed() < MDNS_LISTEN {
            if let Ok(mdns_sd::ServiceEvent::ServiceResolved(info)) =
                receiver.recv_timeout(Duration::from_millis(100))
            {
                let name = info
                    .get_fullname()
                    .split("._companion-link")
                    .next()
                    .unwrap_or_default()
                    .replace("\\032", " ")
                    .trim()
                    .to_string();
                for address in info.get_addresses() {
                    if let Ok(ip) = address.to_string().parse::<Ipv4Addr>() {
                        if !name.is_empty() {
                            names.insert(ip, name.clone());
                        }
                    }
                }
            }
        }
    }
    let _ = mdns.shutdown();
    names
}

/// Reverse DNS names for `ips`, looked up a few at a time.
fn dns_names(ips: &[Ipv4Addr]) -> HashMap<Ipv4Addr, String> {
    let next = AtomicUsize::new(0);
    let names = Mutex::new(HashMap::new());
    std::thread::scope(|scope| {
        for _ in 0..NAME_THREADS.min(ips.len()) {
            scope.spawn(|| loop {
                let index = next.fetch_add(1, Ordering::Relaxed);
                let Some(ip) = ips.get(index) else {
                    break;
                };
                if let Some(name) = reverse_name(*ip) {
                    names.lock().expect("name lock poisoned").insert(*ip, name);
                }
            });
        }
    });
    names.into_inner().expect("name lock poisoned")
}

/// Signify (Philips Hue) hardware prefixes.
fn is_hue(mac: &str) -> bool {
    ["00:17:88", "ec:b5:fa", "c4:29:96"]
        .iter()
        .any(|prefix| mac.starts_with(prefix))
}

/// Everything on the home network now, likely phones first. Blocks for about
/// ten seconds; call it off the async runtime.
pub fn scan(bridge_ip: Option<Ipv4Addr>) -> Vec<FoundDevice> {
    let (answered, announced) = std::thread::scope(|scope| {
        let names = scope.spawn(announced_names);
        let answered = sweep(&sweep_hosts());
        (answered, names.join().unwrap_or_default())
    });
    let unnamed: Vec<Ipv4Addr> = answered
        .iter()
        .map(|(ip, _)| *ip)
        .filter(|ip| !announced.contains_key(ip))
        .collect();
    let named = dns_names(&unnamed);
    let router = gateway();
    let mut devices: Vec<FoundDevice> = answered
        .into_iter()
        .map(|(ip, mac)| FoundDevice {
            name: announced.get(&ip).or_else(|| named.get(&ip)).cloned(),
            private_address: is_private_mac(&mac),
            kind: if Some(ip) == router {
                Some("router")
            } else if Some(ip) == bridge_ip || is_hue(&mac) {
                Some("hue")
            } else {
                None
            },
            ip: ip.to_string(),
            mac,
        })
        .collect();
    devices.sort_by_key(|device| {
        (
            device.kind.is_some(),
            !device.private_address,
            device.name.is_none(),
            device
                .ip
                .parse::<Ipv4Addr>()
                .map(u32::from)
                .unwrap_or(u32::MAX),
        )
    });
    devices
}

/// Where each of `macs` is now, for the ones that answer. The cache is tried
/// first; with `sweep_network` set, one sweep covers every device the cache
/// does not know. Blocks.
pub fn locate_all(macs: &[String], sweep_network: bool) -> HashMap<String, Ipv4Addr> {
    let mut found = HashMap::new();
    for mac in macs {
        if let Some(ip) = locate(mac, false) {
            found.insert(mac.clone(), ip);
        }
    }
    if sweep_network && found.len() < macs.len() {
        for (ip, mac) in sweep(&sweep_hosts()) {
            if macs.contains(&mac) {
                found.entry(mac).or_insert(ip);
            }
        }
    }
    found
}

/// Where the device with `mac` is now. Windows' ARP cache is tried first,
/// each hit confirmed by a fresh request; with `sweep` set, the whole network
/// is asked when the cache does not know. Blocks.
pub fn locate(mac: &str, sweep_network: bool) -> Option<Ipv4Addr> {
    for (ip, cached) in cached_neighbors() {
        if cached == mac && resolve_mac(ip).as_deref() == Some(mac) {
            return Some(ip);
        }
    }
    if !sweep_network {
        return None;
    }
    sweep(&sweep_hosts())
        .into_iter()
        .find(|(_, found)| found == mac)
        .map(|(ip, _)| ip)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hue_hardware_is_recognized() {
        assert!(is_hue("00:17:88:01:02:03"));
        assert!(is_hue("ec:b5:fa:90:34:89"));
        assert!(!is_hue("f6:12:34:56:78:9a"));
    }

    /// Sweeps the real network, so it runs only when asked:
    /// `cargo test --lib presence_scan -- --ignored --nocapture`.
    #[cfg(windows)]
    #[test]
    #[ignore]
    fn this_network_is_found() {
        let started = Instant::now();
        let found = scan(None);
        println!("scanned in {:?}", started.elapsed());
        for device in &found {
            println!("{device:?}");
        }
        assert!(found.iter().any(|device| device.kind == Some("router")));
        println!(
            "cached after {:?}",
            super::super::presence_probe::cached_neighbors()
        );
        if let Some(device) = found.first() {
            let located = locate(&device.mac, false);
            println!("located {} at {located:?}", device.mac);
        }
    }
}
