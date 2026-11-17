use std::mem::size_of;
use windows::Win32::{
    Foundation::{ERROR_BUFFER_OVERFLOW, ERROR_NO_DATA, ERROR_SUCCESS},
    NetworkManagement::{
        IpHelper::{
            GetAdaptersAddresses, GAA_FLAG_INCLUDE_ALL_INTERFACES, GAA_FLAG_SKIP_ANYCAST,
            GAA_FLAG_SKIP_DNS_SERVER, GAA_FLAG_SKIP_MULTICAST, GAA_FLAG_SKIP_UNICAST,
            IP_ADAPTER_ADDRESSES_LH,
        },
        Ndis::IfOperStatusUp,
    },
    Networking::WinSock::AF_UNSPEC,
};

fn matches_vpn(interface_type: u32, name: &str, description: &str) -> bool {
    if matches!(interface_type, 23 | 131) {
        return true;
    }
    let text = format!("{name} {description}").to_ascii_lowercase();
    [
        "vpn",
        "wireguard",
        "openvpn",
        "tailscale",
        "zerotier",
        "anyconnect",
        "fortinet",
        "forticlient",
        "globalprotect",
        "nordvpn",
        "protonvpn",
        "surfshark",
        "expressvpn",
        "outline",
        "cloudflare warp",
        "warp",
        "checkpoint",
        "watchguard",
        "softether",
        "l2tp",
        "pptp",
        "sstp",
        "ikev2",
        "tun",
        "tap",
    ]
    .iter()
    .any(|marker| text.contains(marker))
}

pub fn adapter_names() -> Result<Vec<String>, String> {
    // Читаем адаптеры напрямую: регулярный опрос не запускает PowerShell и консоли.
    let flags = GAA_FLAG_INCLUDE_ALL_INTERFACES
        | GAA_FLAG_SKIP_UNICAST
        | GAA_FLAG_SKIP_ANYCAST
        | GAA_FLAG_SKIP_MULTICAST
        | GAA_FLAG_SKIP_DNS_SERVER;
    let mut bytes = 15_000u32;
    for _ in 0..3 {
        // Типизированный буфер сохраняет выравнивание структур Windows API.
        let count = (bytes as usize).div_ceil(size_of::<IP_ADAPTER_ADDRESSES_LH>());
        let mut buffer = vec![IP_ADAPTER_ADDRESSES_LH::default(); count];
        let head = buffer.as_mut_ptr();
        let mut available = (buffer.len() * size_of::<IP_ADAPTER_ADDRESSES_LH>()) as u32;
        let status = unsafe {
            GetAdaptersAddresses(AF_UNSPEC.0 as u32, flags, None, Some(head), &mut available)
        };
        if status == ERROR_BUFFER_OVERFLOW.0 {
            bytes = available;
            continue;
        }
        if status == ERROR_NO_DATA.0 {
            return Ok(Vec::new());
        }
        if status != ERROR_SUCCESS.0 {
            return Err(format!(
                "Не удалось прочитать сетевые адаптеры: {}",
                std::io::Error::from_raw_os_error(status as i32)
            ));
        }
        let mut names = Vec::new();
        let mut current = head;
        // Указатели и UTF-16 строки принадлежат buffer; он жив до конца обхода.
        while let Some(adapter) = unsafe { current.as_ref() } {
            if adapter.OperStatus == IfOperStatusUp {
                let name = if adapter.FriendlyName.is_null() {
                    String::new()
                } else {
                    unsafe { adapter.FriendlyName.to_string() }.unwrap_or_default()
                };
                let description = if adapter.Description.is_null() {
                    String::new()
                } else {
                    unsafe { adapter.Description.to_string() }.unwrap_or_default()
                };
                if matches_vpn(adapter.IfType, &name, &description) {
                    names.push(if !name.is_empty() {
                        name
                    } else if !description.is_empty() {
                        description
                    } else {
                        "VPN".into()
                    });
                }
            }
            current = adapter.Next;
        }
        return Ok(names);
    }
    Err("Сетевые адаптеры изменились во время проверки. Повторите попытку.".into())
}

#[cfg(test)]
mod tests {
    #[test]
    fn recognizes_tunnels_and_named_vpn_without_matching_regular_adapters() {
        assert!(super::matches_vpn(23, "Подключение", ""));
        assert!(super::matches_vpn(131, "Туннель", ""));
        assert!(super::matches_vpn(6, "Office", "WireGuard Tunnel"));
        assert!(super::matches_vpn(6, "TAILSCALE", ""));
        assert!(!super::matches_vpn(
            6,
            "Ethernet",
            "Intel Ethernet Controller"
        ));
        assert!(!super::matches_vpn(71, "Wi-Fi", "Wireless Adapter"));
    }

    #[test]
    fn reads_real_windows_adapters_repeatedly_without_a_shell() {
        for _ in 0..3 {
            let names = super::adapter_names().expect("Windows API адаптеров должен отвечать");
            assert!(names.iter().all(|name| !name.is_empty()));
        }
    }
}
