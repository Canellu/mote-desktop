use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::services::automations::calendar::{
    self, CalendarFeed, CalendarRule, CalendarService, CalendarSettings, CalendarStatus, EventMatch,
};
use crate::services::automations::runtime::AutomationRuntime;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarData {
    pub settings: CalendarSettings,
    pub status: CalendarStatus,
}

fn service(app: &AppHandle) -> Result<State<'_, CalendarService>, String> {
    app.try_state::<CalendarService>()
        .ok_or_else(|| "Calendars are not ready yet.".to_string())
}

fn data(app: &AppHandle) -> CalendarData {
    match app.try_state::<CalendarService>() {
        Some(service) => CalendarData {
            settings: service.settings(),
            status: service.published(),
        },
        None => CalendarData {
            settings: calendar::load(app),
            status: CalendarStatus::default(),
        },
    }
}

#[tauri::command(rename = "get-calendar-data")]
pub fn get_calendar_data(app: AppHandle) -> CalendarData {
    data(&app)
}

/// Adds a calendar by its iCal address, after checking it answers with a
/// calendar. The address goes to the keyring, never to the settings file.
/// Returns how many events it has over the next week, with the new settings.
#[tauri::command(rename = "add-calendar-feed")]
pub async fn add_calendar_feed(
    app: AppHandle,
    id: String,
    name: String,
    url: String,
) -> Result<(CalendarData, usize), String> {
    let service = service(&app)?;
    let mut settings = service.settings();
    if id.is_empty() || id.len() > 120 || settings.feeds.iter().any(|feed| feed.id == id) {
        return Err("This calendar could not be added.".into());
    }
    let url = calendar::normalize_url(&url)?;
    let events = calendar::check_url(&url).await?;
    settings.feeds.push(CalendarFeed {
        id: id.clone(),
        name: name.trim().to_string(),
        enabled: true,
    });
    settings.validate()?;
    calendar::save_url(&id, &url)?;
    if let Err(error) = calendar::save(&app, &settings) {
        calendar::forget_url(&id);
        return Err(error);
    }
    service.set_settings(settings);
    Ok((data(&app), events))
}

/// Removes a calendar and its address. Rules that named only it keep their
/// other calendars; a rule left with none follows every calendar.
#[tauri::command(rename = "remove-calendar-feed")]
pub fn remove_calendar_feed(app: AppHandle, id: String) -> Result<CalendarData, String> {
    let service = service(&app)?;
    let mut settings = service.settings();
    settings.feeds.retain(|feed| feed.id != id);
    for rule in &mut settings.rules {
        rule.feed_ids.retain(|feed| feed != &id);
    }
    calendar::save(&app, &settings)?;
    calendar::forget_url(&id);
    service.set_settings(settings);
    Ok(data(&app))
}

/// Saves rules and calendar names. Calendars themselves are added and removed
/// only through their own commands, which handle their addresses.
#[tauri::command(rename = "set-calendar-settings")]
pub fn set_calendar_settings(
    app: AppHandle,
    settings: CalendarSettings,
) -> Result<CalendarData, String> {
    let service = service(&app)?;
    let current = service.settings();
    let same_feeds = settings.feeds.len() == current.feeds.len()
        && settings
            .feeds
            .iter()
            .all(|feed| current.feeds.iter().any(|known| known.id == feed.id));
    if !same_feeds {
        return Err("The calendars changed meanwhile. Try again.".into());
    }
    let mut settings = settings;
    for feed in &mut settings.feeds {
        feed.name = feed.name.trim().to_string();
    }
    for rule in &mut settings.rules {
        rule.name = rule.name.trim().to_string();
    }
    settings.validate()?;
    calendar::save(&app, &settings)?;
    service.set_settings(settings);
    crate::services::automations::runtime::signal(
        crate::services::automations::runtime::Signal::SettingsChanged,
    );
    Ok(data(&app))
}

#[tauri::command(rename = "refresh-calendars")]
pub fn refresh_calendars(app: AppHandle) -> Result<(), String> {
    service(&app)?.refresh();
    Ok(())
}

/// The events over the next week a rule being edited would act on.
#[tauri::command(rename = "preview-calendar-rule")]
pub fn preview_calendar_rule(
    app: AppHandle,
    rule: CalendarRule,
) -> Result<Vec<EventMatch>, String> {
    Ok(service(&app)?.upcoming(&rule, chrono::Utc::now()))
}

/// Shows a rule's look on its lights while the editor renews the preview;
/// `None` ends it and the lights go back.
#[tauri::command(rename = "preview-calendar-look")]
pub async fn preview_calendar_look(
    app: AppHandle,
    rule: Option<CalendarRule>,
) -> Result<(), String> {
    let runtime = app
        .try_state::<AutomationRuntime>()
        .ok_or("Automations are not ready yet.")?;
    runtime
        .show_preview(&app, rule.map(|rule| rule.desire()))
        .await
}
