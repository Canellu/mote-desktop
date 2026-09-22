//! Asks the home network about devices on it: whether one answers at an
//! address, which hardware address it answers with, and what is on the local
//! network at all.
//!
//! Presence is decided by an ARP exchange sent just now, which a sleeping
//! phone's Wi-Fi still answers, or failing that a ping. Windows keeps an ARP
//! cache, and a phone that left a minute ago can still sit in it, so the
//! cached entry is flushed and asked again rather than read.

use std::net::Ipv4Addr;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Evidence {
    /// It answered an ARP request just now.
    Neighbor,
    /// It answered a ping.
    Ping,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Probe {
    pub seen: Option<Evidence>,
    /// The hardware address that answered, as "aa:bb:cc:dd:ee:ff".
    pub mac: Option<String>,
}

/// Blocks for up to about four seconds; call it off the async runtime.
pub fn probe(ip: Ipv4Addr) -> Probe {
    if let Some(mac) = resolve_mac(ip) {
        return Probe {
            seen: Some(Evidence::Neighbor),
            mac: Some(mac),
        };
    }
    Probe {
        seen: ping(ip).then_some(Evidence::Ping),
        mac: None,
    }
}

/// The hardware address answering at `ip` right now, by a fresh ARP request.
#[cfg(windows)]
pub fn resolve_mac(ip: Ipv4Addr) -> Option<String> {
    use windows_sys::Win32::NetworkManagement::IpHelper::{
        GetBestInterface, ResolveIpNetEntry2, SendARP, MIB_IPNET_ROW2,
    };
    use windows_sys::Win32::Networking::WinSock::AF_INET;

    let destination = u32::from_ne_bytes(ip.octets());
    // Safety: every structure is zeroed, sized by its type, and outlives the call.
    unsafe {
        let mut index = 0u32;
        if GetBestInterface(destination, &mut index) == 0 {
            let mut row: MIB_IPNET_ROW2 = std::mem::zeroed();
            row.Address.Ipv4.sin_family = AF_INET;
            row.Address.Ipv4.sin_addr.S_un.S_addr = destination;
            row.InterfaceIndex = index;
            // Flushes the cached entry and sends a new request.
            if ResolveIpNetEntry2(&mut row, std::ptr::null()) == 0 {
                let length = row.PhysicalAddressLength as usize;
                return (length == 6).then(|| format_mac(&row.PhysicalAddress[..6]));
            }
            return None;
        }
        // No interface reaches it; the old call at least cannot answer wrongly.
        let mut mac = [0u8; 8];
        let mut length = mac.len() as u32;
        (SendARP(destination, 0, mac.as_mut_ptr().cast(), &mut length) == 0 && length == 6)
            .then(|| format_mac(&mac[..6]))
    }
}

#[cfg(not(windows))]
pub fn resolve_mac(_ip: Ipv4Addr) -> Option<String> {
    None
}

#[cfg(windows)]
pub fn ping(ip: Ipv4Addr) -> bool {
    use windows_sys::Win32::NetworkManagement::IpHelper::{
        IcmpCloseHandle, IcmpCreateFile, IcmpSendEcho, ICMP_ECHO_REPLY,
    };
    const TIMEOUT_MS: u32 = 1000;
    // Safety: a handle is checked before use and always closed.
    unsafe {
        let handle = IcmpCreateFile();
        if handle.is_null() || handle as isize == -1 {
            return false;
        }
        let request = *b"mote";
        let mut reply = vec![0u8; std::mem::size_of::<ICMP_ECHO_REPLY>() + request.len() + 8];
        let replies = IcmpSendEcho(
            handle,
            u32::from_ne_bytes(ip.octets()),
            request.as_ptr().cast(),
            request.len() as u16,
            std::ptr::null(),
            reply.as_mut_ptr().cast(),
            reply.len() as u32,
            TIMEOUT_MS,
        );
        let answered = replies > 0 && {
            let first = &*(reply.as_ptr() as *const ICMP_ECHO_REPLY);
            // IP_SUCCESS
            first.Status == 0
        };
        IcmpCloseHandle(handle);
        answered
    }
}

#[cfg(not(windows))]
pub fn ping(_ip: Ipv4Addr) -> bool {
    false
}

/// This PC's own addresses on private networks, with each network's mask.
#[cfg(windows)]
pub fn local_networks() -> Vec<(Ipv4Addr, Ipv4Addr)> {
    use windows_sys::Win32::NetworkManagement::IpHelper::{GetIpAddrTable, MIB_IPADDRTABLE};
    const MIB_IPADDR_DISCONNECTED: u16 = 0x0008;
    let mut size = 0u32;
    // Safety: the first call only reports the size; the buffer is that size.
    unsafe {
        GetIpAddrTable(std::ptr::null_mut(), &mut size, 0);
        if size == 0 {
            return Vec::new();
        }
        let mut buffer = vec![0u64; (size as usize).div_ceil(8)];
        let table = buffer.as_mut_ptr() as *mut MIB_IPADDRTABLE;
        if GetIpAddrTable(table, &mut size, 0) != 0 {
            return Vec::new();
        }
        let rows =
            std::slice::from_raw_parts((*table).table.as_ptr(), (*table).dwNumEntries as usize);
        rows.iter()
            .filter(|row| row.wType & MIB_IPADDR_DISCONNECTED == 0)
            .map(|row| {
                (
                    Ipv4Addr::from(row.dwAddr.to_ne_bytes()),
                    Ipv4Addr::from(row.dwMask.to_ne_bytes()),
                )
            })
            .filter(|(address, _)| address.is_private())
            .collect()
    }
}

#[cfg(not(windows))]
pub fn local_networks() -> Vec<(Ipv4Addr, Ipv4Addr)> {
    Vec::new()
}

/// The router this PC sends internet traffic through.
#[cfg(windows)]
pub fn gateway() -> Option<Ipv4Addr> {
    use windows_sys::Win32::NetworkManagement::IpHelper::{GetBestRoute, MIB_IPFORWARDROW};
    // Safety: a zeroed row the call fills in.
    unsafe {
        let mut row: MIB_IPFORWARDROW = std::mem::zeroed();
        let target = u32::from_ne_bytes([1, 1, 1, 1]);
        (GetBestRoute(target, 0, &mut row) == 0 && row.dwForwardNextHop != 0)
            .then(|| Ipv4Addr::from(row.dwForwardNextHop.to_ne_bytes()))
    }
}

#[cfg(not(windows))]
pub fn gateway() -> Option<Ipv4Addr> {
    None
}

/// What Windows' ARP cache holds: addresses it has recently talked to and the
/// hardware behind each. Only a hint of where to look; it can be stale.
#[cfg(windows)]
pub fn cached_neighbors() -> Vec<(Ipv4Addr, String)> {
    use windows_sys::Win32::NetworkManagement::IpHelper::{GetIpNetTable, MIB_IPNETTABLE};
    const DYNAMIC: u32 = 3;
    let mut size = 0u32;
    // Safety: as for `local_networks`.
    unsafe {
        GetIpNetTable(std::ptr::null_mut(), &mut size, 0);
        if size == 0 {
            return Vec::new();
        }
        let mut buffer = vec![0u64; (size as usize).div_ceil(8)];
        let table = buffer.as_mut_ptr() as *mut MIB_IPNETTABLE;
        if GetIpNetTable(table, &mut size, 0) != 0 {
            return Vec::new();
        }
        let rows =
            std::slice::from_raw_parts((*table).table.as_ptr(), (*table).dwNumEntries as usize);
        rows.iter()
            .filter(|row| row.Anonymous.dwType == DYNAMIC && row.dwPhysAddrLen == 6)
            .filter(|row| row.bPhysAddr[0] & 0x01 == 0)
            .map(|row| {
                (
                    Ipv4Addr::from(row.dwAddr.to_ne_bytes()),
                    format_mac(&row.bPhysAddr[..6]),
                )
            })
            .collect()
    }
}

#[cfg(not(windows))]
pub fn cached_neighbors() -> Vec<(Ipv4Addr, String)> {
    Vec::new()
}

/// The name the local network's DNS gives an address, often what the phone
/// told the router it is called, like "Alexs-iPhone".
#[cfg(windows)]
pub fn reverse_name(ip: Ipv4Addr) -> Option<String> {
    use std::sync::Once;
    use windows_sys::Win32::Networking::WinSock::{
        GetNameInfoW, WSAStartup, AF_INET, NI_NAMEREQD, SOCKADDR, SOCKADDR_IN, WSADATA,
    };
    static STARTED: Once = Once::new();
    // Safety: the address and buffer are sized by their types and outlive the call.
    unsafe {
        STARTED.call_once(|| {
            let mut data: WSADATA = std::mem::zeroed();
            WSAStartup(0x0202, &mut data);
        });
        let mut address: SOCKADDR_IN = std::mem::zeroed();
        address.sin_family = AF_INET;
        address.sin_addr.S_un.S_addr = u32::from_ne_bytes(ip.octets());
        let mut name = [0u16; 256];
        let result = GetNameInfoW(
            &address as *const SOCKADDR_IN as *const SOCKADDR,
            std::mem::size_of::<SOCKADDR_IN>() as i32,
            name.as_mut_ptr(),
            name.len() as u32,
            std::ptr::null_mut(),
            0,
            NI_NAMEREQD as i32,
        );
        if result != 0 {
            return None;
        }
        let length = name
            .iter()
            .position(|unit| *unit == 0)
            .unwrap_or(name.len());
        let full = String::from_utf16_lossy(&name[..length]);
        let host = full.split('.').next().unwrap_or(&full).trim().to_string();
        // A name that is just the address again says nothing.
        (!host.is_empty() && full.parse::<Ipv4Addr>().is_err()).then_some(host)
    }
}

#[cfg(not(windows))]
pub fn reverse_name(_ip: Ipv4Addr) -> Option<String> {
    None
}

pub fn format_mac(bytes: &[u8]) -> String {
    bytes
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<Vec<_>>()
        .join(":")
}

/// A hardware address the device made up for this network, as phones do for
/// privacy, rather than one burned in by its maker.
pub fn is_private_mac(mac: &str) -> bool {
    u8::from_str_radix(mac.get(..2).unwrap_or("00"), 16).is_ok_and(|first| first & 0x02 != 0)
}

/// "AA-BB-CC-DD-EE-FF", "aabb.ccdd.eeff", and the like, as "aa:bb:cc:dd:ee:ff".
pub fn normalize_mac(text: &str) -> Option<String> {
    let hex: String = text
        .chars()
        .filter(|character| !matches!(character, ':' | '-' | '.' | ' '))
        .collect();
    if hex.len() != 12 || !hex.chars().all(|character| character.is_ascii_hexdigit()) {
        return None;
    }
    let bytes: Vec<u8> = (0..6)
        .map(|index| u8::from_str_radix(&hex[index * 2..index * 2 + 2], 16).unwrap_or(0))
        .collect();
    Some(format_mac(&bytes))
}

/// Only addresses a home router hands out: 10/8, 172.16/12, 192.168/16.
pub fn parse_private_ipv4(text: &str) -> Option<Ipv4Addr> {
    let ip: Ipv4Addr = text.trim().parse().ok()?;
    (ip.is_private() && !ip.is_broadcast() && ip.octets()[3] != 0 && ip.octets()[3] != 255)
        .then_some(ip)
}

/// Every host address on the networks this PC is on, but itself. A network
/// larger than a /22 is narrowed to the /24 around this PC, so a sweep stays
/// a few hundred addresses.
pub fn hosts(networks: &[(Ipv4Addr, Ipv4Addr)]) -> Vec<Ipv4Addr> {
    let mut hosts = Vec::new();
    for &(address, mask) in networks {
        let own = u32::from(address);
        let mut mask = u32::from(mask);
        if mask.leading_ones() < 22 {
            mask = 0xFFFF_FF00;
        }
        let network = own & mask;
        let broadcast = network | !mask;
        for host in network.saturating_add(1)..broadcast {
            if host != own {
                hosts.push(Ipv4Addr::from(host));
            }
        }
    }
    hosts.sort();
    hosts.dedup();
    hosts
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn macs_normalize_from_any_common_form() {
        assert_eq!(
            normalize_mac("AA-BB-CC-0D-EE-FF").as_deref(),
            Some("aa:bb:cc:0d:ee:ff")
        );
        assert_eq!(
            normalize_mac("aabb.cc0d.eeff").as_deref(),
            Some("aa:bb:cc:0d:ee:ff")
        );
        assert_eq!(normalize_mac("aa:bb:cc"), None);
        assert_eq!(normalize_mac("zz:bb:cc:dd:ee:ff"), None);
    }

    #[test]
    fn private_addresses_are_the_locally_administered_ones() {
        // A phone's per-network address has the second-lowest bit of its
        // first byte set.
        assert!(is_private_mac("f6:12:34:56:78:9a"));
        assert!(is_private_mac("de:ad:be:ef:00:01"));
        assert!(!is_private_mac("00:17:88:12:34:56"));
        assert!(!is_private_mac("ac:de:48:00:11:22"));
    }

    #[test]
    fn a_sweep_covers_the_network_but_not_this_pc() {
        let networks = [(
            Ipv4Addr::new(192, 168, 1, 20),
            Ipv4Addr::new(255, 255, 255, 0),
        )];
        let found = hosts(&networks);
        assert_eq!(found.len(), 253);
        assert_eq!(found.first(), Some(&Ipv4Addr::new(192, 168, 1, 1)));
        assert_eq!(found.last(), Some(&Ipv4Addr::new(192, 168, 1, 254)));
        assert!(!found.contains(&Ipv4Addr::new(192, 168, 1, 20)));
        // A /16 is narrowed to this PC's /24.
        let wide = hosts(&[(Ipv4Addr::new(10, 0, 7, 9), Ipv4Addr::new(255, 255, 0, 0))]);
        assert_eq!(wide.len(), 253);
        assert!(wide.iter().all(|ip| ip.octets()[2] == 7));
    }

    /// Talks to the real network stack, so it runs only when asked:
    /// `cargo test --lib presence_probe -- --ignored --nocapture`.
    #[cfg(windows)]
    #[test]
    #[ignore]
    fn this_network_answers() {
        assert_eq!(probe(Ipv4Addr::LOCALHOST).seen, Some(Evidence::Ping));
        let networks = local_networks();
        println!("networks {networks:?} gateway {:?}", gateway());
        println!("cached {:?}", cached_neighbors());
        if let Some(router) = gateway() {
            let result = probe(router);
            println!("router {result:?} named {:?}", reverse_name(router));
            assert_eq!(result.seen, Some(Evidence::Neighbor));
        }
    }

    #[test]
    fn only_private_home_addresses_are_accepted() {
        assert!(parse_private_ipv4("192.168.1.42").is_some());
        assert!(parse_private_ipv4(" 10.0.0.7 ").is_some());
        assert!(parse_private_ipv4("172.20.3.4").is_some());
        assert!(parse_private_ipv4("8.8.8.8").is_none());
        assert!(parse_private_ipv4("192.168.1.255").is_none());
        assert!(parse_private_ipv4("192.168.1.0").is_none());
        assert!(parse_private_ipv4("phone.local").is_none());
    }
}
