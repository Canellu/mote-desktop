use serde::Serialize;

/// The person's Windows region and the formats they chose for it, used as the
/// first-launch defaults for time, measurement and temperature. Every field is
/// `None` when Windows does not say.
#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegionalDefaults {
    /// Two-letter country code, e.g. "NO" or "US", from Settings › Time &
    /// language › Region. The Microsoft Store uses the same region.
    region: Option<String>,
    /// Whether the person's short time format is a 24-hour clock.
    clock24: Option<bool>,
    /// Whether the person's measurement system is metric.
    metric: Option<bool>,
}

#[tauri::command(rename = "get-regional-defaults")]
pub fn get_regional_defaults() -> RegionalDefaults {
    read_regional_defaults()
}

#[cfg(target_os = "windows")]
fn read_regional_defaults() -> RegionalDefaults {
    use windows_registry::CURRENT_USER;

    let Ok(international) = CURRENT_USER.open(r"Control Panel\International") else {
        return RegionalDefaults::default();
    };
    let region = CURRENT_USER
        .open(r"Control Panel\International\Geo")
        .and_then(|geo| geo.get_string("Name"))
        .ok()
        .map(|name| name.trim().to_ascii_uppercase())
        .filter(|name| name.len() == 2 && name.chars().all(|c| c.is_ascii_alphabetic()));
    // "HH:mm" is a 24-hour clock; "h:mm tt" writes an AM/PM marker ("tt").
    let clock24 = international
        .get_string("sShortTime")
        .ok()
        .filter(|pattern| !pattern.is_empty())
        .map(|pattern| !pattern.contains('t'));
    // iMeasure is "0" for metric and "1" for US customary.
    let metric = international
        .get_string("iMeasure")
        .ok()
        .and_then(|value| match value.trim() {
            "0" => Some(true),
            "1" => Some(false),
            _ => None,
        });
    RegionalDefaults {
        region,
        clock24,
        metric,
    }
}

#[cfg(not(target_os = "windows"))]
fn read_regional_defaults() -> RegionalDefaults {
    RegionalDefaults::default()
}
