//! A small iCalendar (RFC 5545) reader: enough of VEVENT, RRULE, and
//! VTIMEZONE to know when the events on a subscribed calendar happen over the
//! next few days.
//!
//! Recurrences are expanded in the event's own wall-clock time and converted
//! afterwards, so a weekly 09:00 meeting stays at 09:00 across a daylight
//! saving change. Time zones come from the feed's VTIMEZONE blocks; a zone the
//! feed does not describe falls back to this PC's local time.

use std::collections::HashMap;

use chrono::{
    DateTime, Datelike, Duration, NaiveDate, NaiveDateTime, NaiveTime, TimeZone, Utc, Weekday,
};

/// Every expansion stops here, whatever a feed asks for.
const MAX_STEPS: usize = 5000;

#[derive(Debug, Clone, PartialEq)]
pub struct Occurrence {
    pub uid: String,
    pub title: String,
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
    pub all_day: bool,
    /// False for events marked free (TRANSP:TRANSPARENT).
    pub busy: bool,
}

/// Turns this PC's wall-clock time into UTC; a parameter so tests can fix it.
pub type LocalZone<'a> = &'a dyn Fn(NaiveDateTime) -> DateTime<Utc>;

/// The PC's own time zone.
pub fn system_zone(local: NaiveDateTime) -> DateTime<Utc> {
    use chrono::offset::LocalResult;
    match chrono::Local.from_local_datetime(&local) {
        LocalResult::Single(at) => at.with_timezone(&Utc),
        // The later of an hour that happens twice, like most calendars.
        LocalResult::Ambiguous(_, later) => later.with_timezone(&Utc),
        // A time skipped by a clock change runs an hour later.
        LocalResult::None => chrono::Local
            .from_local_datetime(&(local + Duration::hours(1)))
            .earliest()
            .map_or_else(
                || Utc.from_utc_datetime(&local),
                |at| at.with_timezone(&Utc),
            ),
    }
}

#[derive(Debug, Clone)]
struct Property {
    name: String,
    params: HashMap<String, String>,
    value: String,
}

/// Unfolds continuation lines and splits each into name, parameters, value.
fn properties(text: &str) -> Vec<Property> {
    let mut lines: Vec<String> = Vec::new();
    for raw in text.split('\n') {
        let line = raw.strip_suffix('\r').unwrap_or(raw);
        if let Some(rest) = line.strip_prefix([' ', '\t']) {
            if let Some(last) = lines.last_mut() {
                last.push_str(rest);
                continue;
            }
        }
        if !line.is_empty() {
            lines.push(line.to_string());
        }
    }
    lines
        .into_iter()
        .filter_map(|line| {
            // The value starts at the first colon outside a quoted parameter.
            let mut quoted = false;
            let split = line.char_indices().find_map(|(index, character)| {
                match character {
                    '"' => quoted = !quoted,
                    ':' if !quoted => return Some(index),
                    _ => {}
                }
                None
            })?;
            let (head, value) = (&line[..split], &line[split + 1..]);
            let mut parts = head.split(';');
            let name = parts.next()?.trim().to_ascii_uppercase();
            let params = parts
                .filter_map(|part| {
                    let (key, value) = part.split_once('=')?;
                    Some((
                        key.trim().to_ascii_uppercase(),
                        value.trim().trim_matches('"').to_string(),
                    ))
                })
                .collect();
            Some(Property {
                name,
                params,
                value: value.to_string(),
            })
        })
        .collect()
}

fn unescape(text: &str) -> String {
    let mut result = String::with_capacity(text.len());
    let mut characters = text.chars();
    while let Some(character) = characters.next() {
        if character == '\\' {
            match characters.next() {
                Some('n' | 'N') => result.push(' '),
                Some(other) => result.push(other),
                None => {}
            }
        } else {
            result.push(character);
        }
    }
    result.trim().to_string()
}

/// A moment as a feed writes it.
#[derive(Debug, Clone, Copy, PartialEq)]
enum When {
    Date(NaiveDate),
    Utc(NaiveDateTime),
    /// Wall-clock time; `zone` indexes the zones the feed described, or `None`
    /// for floating time and zones it did not describe.
    Local(NaiveDateTime, Option<usize>),
}

impl When {
    fn naive(self) -> NaiveDateTime {
        match self {
            Self::Date(date) => date.and_time(NaiveTime::MIN),
            Self::Utc(at) | Self::Local(at, _) => at,
        }
    }

    fn with_naive(self, at: NaiveDateTime) -> Self {
        match self {
            Self::Date(_) => Self::Date(at.date()),
            Self::Utc(_) => Self::Utc(at),
            Self::Local(_, zone) => Self::Local(at, zone),
        }
    }
}

fn parse_date(text: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(text.get(..8)?, "%Y%m%d").ok()
}

fn parse_naive(text: &str) -> Option<NaiveDateTime> {
    let text = text.trim_end_matches('Z');
    NaiveDateTime::parse_from_str(text, "%Y%m%dT%H%M%S")
        .or_else(|_| NaiveDateTime::parse_from_str(text, "%Y%m%dT%H%M"))
        .ok()
}

fn parse_when(value: &str, params: &HashMap<String, String>, zones: &[Zone]) -> Option<When> {
    let value = value.trim();
    if params
        .get("VALUE")
        .is_some_and(|kind| kind.eq_ignore_ascii_case("DATE"))
        || value.len() == 8
    {
        return parse_date(value).map(When::Date);
    }
    let at = parse_naive(value)?;
    if value.ends_with('Z') {
        return Some(When::Utc(at));
    }
    let zone = params.get("TZID").and_then(|id| {
        zones
            .iter()
            .position(|zone| zone.id.eq_ignore_ascii_case(id.trim_start_matches('/')))
    });
    Some(When::Local(at, zone))
}

/// ISO 8601 durations as iCalendar uses them: P1W, P1D, PT1H30M, -PT15M.
fn parse_duration(text: &str) -> Option<Duration> {
    let text = text.trim();
    let (negative, text) = match text.strip_prefix('-') {
        Some(rest) => (true, rest),
        None => (false, text.strip_prefix('+').unwrap_or(text)),
    };
    let text = text.strip_prefix('P')?;
    let mut total = Duration::zero();
    let mut number = String::new();
    let mut in_time = false;
    for character in text.chars() {
        match character {
            'T' => in_time = true,
            digit if digit.is_ascii_digit() => number.push(digit),
            unit => {
                let amount: i64 = number.parse().ok()?;
                number.clear();
                total += match (unit, in_time) {
                    ('W', _) => Duration::weeks(amount),
                    ('D', _) => Duration::days(amount),
                    ('H', true) => Duration::hours(amount),
                    ('M', true) => Duration::minutes(amount),
                    ('S', true) => Duration::seconds(amount),
                    _ => return None,
                };
            }
        }
    }
    Some(if negative { -total } else { total })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Freq {
    Daily,
    Weekly,
    Monthly,
    Yearly,
}

#[derive(Debug, Clone, PartialEq)]
struct Rule {
    freq: Freq,
    interval: u32,
    count: Option<u32>,
    until: Option<When>,
    /// Weekdays, with an ordinal like 2 (second) or -1 (last) when given.
    by_day: Vec<(Option<i32>, Weekday)>,
    by_month_day: Vec<i32>,
    by_month: Vec<u32>,
    by_set_pos: Vec<i32>,
}

fn weekday(code: &str) -> Option<Weekday> {
    Some(match code {
        "MO" => Weekday::Mon,
        "TU" => Weekday::Tue,
        "WE" => Weekday::Wed,
        "TH" => Weekday::Thu,
        "FR" => Weekday::Fri,
        "SA" => Weekday::Sat,
        "SU" => Weekday::Sun,
        _ => return None,
    })
}

fn parse_rule(text: &str, zones: &[Zone]) -> Option<Rule> {
    let mut rule = Rule {
        freq: Freq::Daily,
        interval: 1,
        count: None,
        until: None,
        by_day: Vec::new(),
        by_month_day: Vec::new(),
        by_month: Vec::new(),
        by_set_pos: Vec::new(),
    };
    let mut freq = None;
    for part in text.split(';') {
        let (key, value) = part.split_once('=')?;
        let list = || value.split(',').map(str::trim);
        match key.trim().to_ascii_uppercase().as_str() {
            "FREQ" => {
                freq = Some(match value.to_ascii_uppercase().as_str() {
                    "DAILY" => Freq::Daily,
                    "WEEKLY" => Freq::Weekly,
                    "MONTHLY" => Freq::Monthly,
                    "YEARLY" => Freq::Yearly,
                    // Hourly and finer are not calendar events worth lighting.
                    _ => return None,
                })
            }
            "INTERVAL" => rule.interval = value.parse().ok().filter(|n| *n > 0)?,
            "COUNT" => rule.count = value.parse().ok(),
            "UNTIL" => rule.until = parse_when(value, &HashMap::new(), zones),
            "BYDAY" => {
                rule.by_day = list()
                    .filter_map(|item| {
                        let item = item.to_ascii_uppercase();
                        let split = item.len().checked_sub(2)?;
                        let ordinal = &item[..split];
                        Some((
                            (!ordinal.is_empty())
                                .then(|| ordinal.parse().ok())
                                .flatten(),
                            weekday(&item[split..])?,
                        ))
                    })
                    .collect()
            }
            "BYMONTHDAY" => rule.by_month_day = list().filter_map(|n| n.parse().ok()).collect(),
            "BYMONTH" => rule.by_month = list().filter_map(|n| n.parse().ok()).collect(),
            "BYSETPOS" => rule.by_set_pos = list().filter_map(|n| n.parse().ok()).collect(),
            _ => {}
        }
    }
    rule.freq = freq?;
    Some(rule)
}

fn days_in_month(year: i32, month: u32) -> u32 {
    let (next_year, next_month) = if month == 12 {
        (year + 1, 1)
    } else {
        (year, month + 1)
    };
    NaiveDate::from_ymd_opt(next_year, next_month, 1)
        .and_then(|first| first.pred_opt())
        .map_or(28, |last| last.day())
}

/// The days of one month a MONTHLY (or month-scoped YEARLY) rule picks.
fn month_days(rule: &Rule, year: i32, month: u32, anchor: NaiveDate) -> Vec<NaiveDate> {
    let length = days_in_month(year, month) as i32;
    let day = |n: i32| NaiveDate::from_ymd_opt(year, month, n as u32);
    let mut days: Vec<NaiveDate> = Vec::new();
    if !rule.by_month_day.is_empty() {
        for &n in &rule.by_month_day {
            let n = if n < 0 { length + n + 1 } else { n };
            if (1..=length).contains(&n) {
                days.extend(day(n));
            }
        }
    }
    if !rule.by_day.is_empty() {
        let mut picked: Vec<NaiveDate> = Vec::new();
        for &(ordinal, wanted) in &rule.by_day {
            let matching: Vec<NaiveDate> = (1..=length)
                .filter_map(day)
                .filter(|date| date.weekday() == wanted)
                .collect();
            match ordinal {
                None => picked.extend(matching),
                Some(n) if n > 0 => picked.extend(matching.get(n as usize - 1).copied()),
                Some(n) => picked.extend(
                    matching
                        .len()
                        .checked_sub(n.unsigned_abs() as usize)
                        .and_then(|index| matching.get(index).copied()),
                ),
            }
        }
        days = if rule.by_month_day.is_empty() {
            picked
        } else {
            days.into_iter()
                .filter(|date| picked.contains(date))
                .collect()
        };
    }
    if rule.by_month_day.is_empty() && rule.by_day.is_empty() {
        // A month without that day (the 31st in April) is skipped.
        days.extend(day(anchor.day() as i32));
    }
    days
}

/// Keeps the BYSETPOS picks of one period's sorted candidates.
fn set_positions(rule: &Rule, mut candidates: Vec<NaiveDateTime>) -> Vec<NaiveDateTime> {
    candidates.sort();
    candidates.dedup();
    if rule.by_set_pos.is_empty() {
        return candidates;
    }
    let length = candidates.len() as i32;
    let mut picked: Vec<NaiveDateTime> = rule
        .by_set_pos
        .iter()
        .filter_map(|&position| {
            let index = if position < 0 {
                length + position
            } else {
                position - 1
            };
            (0..length)
                .contains(&index)
                .then(|| candidates[index as usize])
        })
        .collect();
    picked.sort();
    picked
}

/// Starts of a recurring event, in its own wall-clock time, from `start` until
/// `horizon` or the rule runs out.
fn expand(
    rule: &Rule,
    start: NaiveDateTime,
    horizon: NaiveDateTime,
    until: Option<NaiveDateTime>,
) -> Vec<NaiveDateTime> {
    let time = start.time();
    let date = start.date();
    let mut result = Vec::new();
    let mut emitted = 0u32;
    let interval = rule.interval.max(1) as i64;
    let in_month = |candidate: &NaiveDate| {
        rule.by_month.is_empty() || rule.by_month.contains(&candidate.month())
    };
    for step in 0..MAX_STEPS as i64 {
        let candidates: Vec<NaiveDateTime> = match rule.freq {
            Freq::Daily => {
                let day = date + Duration::days(step * interval);
                let matches = in_month(&day)
                    && (rule.by_month_day.is_empty()
                        || rule.by_month_day.contains(&(day.day() as i32)))
                    && (rule.by_day.is_empty()
                        || rule
                            .by_day
                            .iter()
                            .any(|(_, weekday)| *weekday == day.weekday()));
                if matches {
                    vec![day.and_time(time)]
                } else {
                    Vec::new()
                }
            }
            Freq::Weekly => {
                let week_start = date
                    - Duration::days(date.weekday().num_days_from_monday() as i64)
                    + Duration::weeks(step * interval);
                let days: Vec<Weekday> = if rule.by_day.is_empty() {
                    vec![date.weekday()]
                } else {
                    rule.by_day.iter().map(|(_, weekday)| *weekday).collect()
                };
                days.into_iter()
                    .map(|weekday| {
                        week_start + Duration::days(weekday.num_days_from_monday() as i64)
                    })
                    .filter(in_month)
                    .map(|day| day.and_time(time))
                    .collect()
            }
            Freq::Monthly => {
                let months = date.month0() as i64 + step * interval;
                let year = date.year() + (months / 12) as i32;
                let month = (months % 12) as u32 + 1;
                if rule.by_month.is_empty() || rule.by_month.contains(&month) {
                    month_days(rule, year, month, date)
                        .into_iter()
                        .map(|day| day.and_time(time))
                        .collect()
                } else {
                    Vec::new()
                }
            }
            Freq::Yearly => {
                let year = date.year() + (step * interval) as i32;
                let months: Vec<u32> = if rule.by_month.is_empty() {
                    vec![date.month()]
                } else {
                    rule.by_month.clone()
                };
                months
                    .into_iter()
                    .flat_map(|month| {
                        if rule.by_day.is_empty() && rule.by_month_day.is_empty() {
                            NaiveDate::from_ymd_opt(year, month, date.day())
                                .into_iter()
                                .collect()
                        } else {
                            month_days(rule, year, month, date)
                        }
                    })
                    .map(|day| day.and_time(time))
                    .collect()
            }
        };
        let mut period_past_horizon = true;
        for candidate in set_positions(rule, candidates) {
            if candidate < start {
                period_past_horizon = false;
                continue;
            }
            if until.is_some_and(|until| candidate > until) {
                return result;
            }
            if rule.count.is_some_and(|count| emitted >= count) {
                return result;
            }
            emitted += 1;
            if candidate > horizon {
                return result;
            }
            period_past_horizon = false;
            result.push(candidate);
        }
        // A period entirely past the horizon ends it, even with no picks.
        let period_start = match rule.freq {
            Freq::Daily => date + Duration::days(step * interval),
            Freq::Weekly => date + Duration::weeks(step * interval),
            Freq::Monthly => date + Duration::days(step * interval * 28),
            Freq::Yearly => date + Duration::days(step * interval * 365),
        };
        if period_past_horizon && period_start.and_time(NaiveTime::MIN) > horizon {
            return result;
        }
    }
    result
}

/// One STANDARD or DAYLIGHT part of a VTIMEZONE.
#[derive(Debug, Clone)]
struct Observance {
    start: NaiveDateTime,
    offset_to: i32,
    rule: Option<Rule>,
}

#[derive(Debug, Clone)]
struct Zone {
    id: String,
    observances: Vec<Observance>,
}

fn parse_offset(text: &str) -> Option<i32> {
    let text = text.trim();
    let (sign, digits) = match text.split_at_checked(1)? {
        ("+", rest) => (1, rest),
        ("-", rest) => (-1, rest),
        _ => return None,
    };
    let hours: i32 = digits.get(..2)?.parse().ok()?;
    let minutes: i32 = digits.get(2..4)?.parse().ok()?;
    let seconds: i32 = digits.get(4..6).and_then(|s| s.parse().ok()).unwrap_or(0);
    Some(sign * (hours * 3600 + minutes * 60 + seconds))
}

impl Zone {
    /// The UTC offset in force at a wall-clock time: the observance whose
    /// latest onset at or before it is the most recent.
    fn offset_at(&self, local: NaiveDateTime) -> Option<i32> {
        self.observances
            .iter()
            .filter_map(|observance| {
                let onset = match &observance.rule {
                    None => Some(observance.start).filter(|start| *start <= local),
                    // Yearly from the zone's first onset: a few dozen steps.
                    Some(rule) => expand(rule, observance.start, local, None)
                        .into_iter()
                        .last(),
                }?;
                Some((onset, observance.offset_to))
            })
            .max_by_key(|(onset, _)| *onset)
            .map(|(_, offset)| offset)
    }
}

fn to_utc(when: When, zones: &[Zone], local: LocalZone) -> DateTime<Utc> {
    match when {
        When::Utc(at) => Utc.from_utc_datetime(&at),
        When::Date(date) => local(date.and_time(NaiveTime::MIN)),
        When::Local(at, Some(zone)) => match zones[zone].offset_at(at) {
            Some(offset) => Utc.from_utc_datetime(&(at - Duration::seconds(offset as i64))),
            None => local(at),
        },
        When::Local(at, None) => local(at),
    }
}

#[derive(Debug, Clone, Default)]
struct RawEvent {
    uid: String,
    summary: String,
    start: Option<(String, HashMap<String, String>)>,
    end: Option<(String, HashMap<String, String>)>,
    duration: Option<String>,
    rrule: Option<String>,
    exdates: Vec<(String, HashMap<String, String>)>,
    recurrence_id: Option<(String, HashMap<String, String>)>,
    cancelled: bool,
    transparent: bool,
}

/// Every event in `text` that overlaps `from..to`, recurrences expanded and
/// moved or cancelled instances applied.
pub fn occurrences(
    text: &str,
    from: DateTime<Utc>,
    to: DateTime<Utc>,
    local: LocalZone,
) -> Vec<Occurrence> {
    let properties = properties(text);

    // Zones first: events may refer to a zone described after them.
    let mut zones: Vec<Zone> = Vec::new();
    let mut zone: Option<Zone> = None;
    let mut observance: Option<(NaiveDateTime, Option<i32>, Option<String>)> = None;
    for property in &properties {
        match (
            property.name.as_str(),
            property.value.trim().to_ascii_uppercase().as_str(),
        ) {
            ("BEGIN", "VTIMEZONE") => {
                zone = Some(Zone {
                    id: String::new(),
                    observances: Vec::new(),
                })
            }
            ("BEGIN", "STANDARD" | "DAYLIGHT") if zone.is_some() => {
                observance = Some((NaiveDateTime::MIN, None, None))
            }
            ("END", "STANDARD" | "DAYLIGHT") => {
                if let (Some(zone), Some((start, Some(offset_to), rule))) =
                    (zone.as_mut(), observance.take())
                {
                    zone.observances.push(Observance {
                        start,
                        offset_to,
                        rule: rule.and_then(|rule| parse_rule(&rule, &[])),
                    });
                }
            }
            ("END", "VTIMEZONE") => zones.extend(zone.take().filter(|zone| !zone.id.is_empty())),
            ("TZID", _) if observance.is_none() => {
                if let Some(zone) = zone.as_mut() {
                    zone.id = property.value.trim().trim_start_matches('/').to_string();
                }
            }
            ("DTSTART", _) => {
                if let Some(observance) = observance.as_mut() {
                    observance.0 = parse_naive(&property.value).unwrap_or(NaiveDateTime::MIN);
                }
            }
            ("TZOFFSETTO", _) => {
                if let Some(observance) = observance.as_mut() {
                    observance.1 = parse_offset(&property.value);
                }
            }
            ("RRULE", _) => {
                if let Some(observance) = observance.as_mut() {
                    observance.2 = Some(property.value.clone());
                }
            }
            _ => {}
        }
    }

    let mut events: Vec<RawEvent> = Vec::new();
    let mut current: Option<RawEvent> = None;
    let mut depth = 0usize;
    for property in &properties {
        let value = property.value.trim();
        match property.name.as_str() {
            "BEGIN" if value.eq_ignore_ascii_case("VEVENT") => {
                current = Some(RawEvent::default());
                depth = 0;
            }
            // Alarms inside an event have properties of their own.
            "BEGIN" if current.is_some() => depth += 1,
            "END" if current.is_some() && depth > 0 => depth -= 1,
            "END" if value.eq_ignore_ascii_case("VEVENT") => events.extend(current.take()),
            name if depth == 0 => {
                let Some(event) = current.as_mut() else {
                    continue;
                };
                let pair = || (value.to_string(), property.params.clone());
                match name {
                    "UID" => event.uid = value.to_string(),
                    "SUMMARY" => event.summary = unescape(&property.value),
                    "DTSTART" => event.start = Some(pair()),
                    "DTEND" => event.end = Some(pair()),
                    "DURATION" => event.duration = Some(value.to_string()),
                    "RRULE" => event.rrule = Some(value.to_string()),
                    "EXDATE" => {
                        for item in value.split(',') {
                            event
                                .exdates
                                .push((item.to_string(), property.params.clone()));
                        }
                    }
                    "RECURRENCE-ID" => event.recurrence_id = Some(pair()),
                    "STATUS" => event.cancelled = value.eq_ignore_ascii_case("CANCELLED"),
                    "TRANSP" => event.transparent = value.eq_ignore_ascii_case("TRANSPARENT"),
                    _ => {}
                }
            }
            _ => {}
        }
    }

    // Instances that were moved or cancelled, by event and original start.
    let mut replaced: HashMap<String, Vec<DateTime<Utc>>> = HashMap::new();
    for event in &events {
        if let Some((value, params)) = &event.recurrence_id {
            if let Some(original) = parse_when(value, params, &zones) {
                replaced
                    .entry(event.uid.clone())
                    .or_default()
                    .push(to_utc(original, &zones, local));
            }
        }
    }

    let mut result = Vec::new();
    for event in &events {
        if event.cancelled {
            continue;
        }
        let Some(start) = event
            .start
            .as_ref()
            .and_then(|(value, params)| parse_when(value, params, &zones))
        else {
            continue;
        };
        let all_day = matches!(start, When::Date(_));
        let end = event
            .end
            .as_ref()
            .and_then(|(value, params)| parse_when(value, params, &zones));
        // Length in wall-clock terms, so a recurring instance keeps its hours.
        let length = match end {
            Some(end) => end.naive() - start.naive(),
            None => match event.duration.as_deref().and_then(parse_duration) {
                Some(duration) => duration,
                None if all_day => Duration::days(1),
                None => Duration::zero(),
            },
        }
        .max(Duration::zero());

        let excluded: Vec<DateTime<Utc>> = event
            .exdates
            .iter()
            .filter_map(|(value, params)| parse_when(value, params, &zones))
            .map(|when| to_utc(when, &zones, local))
            .collect();
        let moved = if event.recurrence_id.is_none() {
            replaced.get(&event.uid).cloned().unwrap_or_default()
        } else {
            Vec::new()
        };

        let starts: Vec<When> = match event
            .rrule
            .as_deref()
            .filter(|_| event.recurrence_id.is_none())
            .and_then(|rule| parse_rule(rule, &zones))
        {
            None => vec![start],
            Some(rule) => {
                // Generous in wall-clock terms: zones can be up to a day apart.
                let horizon = to.naive_utc() + Duration::days(2);
                let until = rule.until.map(|until| match (until, start) {
                    (When::Utc(at), When::Local(_, _) | When::Date(_)) => {
                        // In the event's own wall-clock time, near enough.
                        let offset = to_utc(start, &zones, local).naive_utc() - start.naive();
                        at - offset
                    }
                    (until, _) => until.naive(),
                });
                let until = until.map(|until| {
                    // A date-only UNTIL includes that whole day.
                    if matches!(rule.until, Some(When::Date(_))) {
                        until + Duration::days(1) - Duration::seconds(1)
                    } else {
                        until
                    }
                });
                expand(&rule, start.naive(), horizon, until)
                    .into_iter()
                    .map(|at| start.with_naive(at))
                    .collect()
            }
        };

        for instance in starts {
            let begins = to_utc(instance, &zones, local);
            if excluded.contains(&begins) || moved.contains(&begins) {
                continue;
            }
            let ends = to_utc(
                instance.with_naive(instance.naive() + length),
                &zones,
                local,
            );
            if ends <= from && !(ends == begins && begins >= from) || begins >= to {
                continue;
            }
            result.push(Occurrence {
                uid: event.uid.clone(),
                title: event.summary.clone(),
                start: begins,
                end: ends,
                all_day,
                busy: !event.transparent,
            });
        }
    }
    result.sort_by_key(|occurrence| occurrence.start);
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A fixed UTC+1 "local" time for floating and all-day events.
    fn plus_one(local: NaiveDateTime) -> DateTime<Utc> {
        Utc.from_utc_datetime(&(local - Duration::hours(1)))
    }

    fn at(text: &str) -> DateTime<Utc> {
        Utc.from_utc_datetime(&NaiveDateTime::parse_from_str(text, "%Y-%m-%d %H:%M").unwrap())
    }

    fn feed(events: &str) -> String {
        format!("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n{NEW_YORK}{events}END:VCALENDAR\r\n")
    }

    const NEW_YORK: &str = "BEGIN:VTIMEZONE\r\nTZID:America/New_York\r\nBEGIN:DAYLIGHT\r\nTZOFFSETFROM:-0500\r\nTZOFFSETTO:-0400\r\nDTSTART:19700308T020000\r\nRRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU\r\nEND:DAYLIGHT\r\nBEGIN:STANDARD\r\nTZOFFSETFROM:-0400\r\nTZOFFSETTO:-0500\r\nDTSTART:19701101T020000\r\nRRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU\r\nEND:STANDARD\r\nEND:VTIMEZONE\r\n";

    fn titles(found: &[Occurrence]) -> Vec<(String, DateTime<Utc>)> {
        found.iter().map(|o| (o.title.clone(), o.start)).collect()
    }

    #[test]
    fn a_single_event_in_a_described_zone() {
        let text = feed("BEGIN:VEVENT\r\nUID:1\r\nSUMMARY:Stand-up\\, team\r\nDTSTART;TZID=America/New_York:20260915T093000\r\nDTEND;TZID=America/New_York:20260915T100000\r\nEND:VEVENT\r\n");
        let found = occurrences(
            &text,
            at("2026-09-14 00:00"),
            at("2026-09-20 00:00"),
            &plus_one,
        );
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].title, "Stand-up, team");
        // September is daylight time: 09:30 -04:00.
        assert_eq!(found[0].start, at("2026-09-15 13:30"));
        assert_eq!(found[0].end, at("2026-09-15 14:00"));
        assert!(found[0].busy && !found[0].all_day);
    }

    #[test]
    fn a_weekly_meeting_keeps_its_hour_across_the_clock_change() {
        let text = feed("BEGIN:VEVENT\r\nUID:2\r\nSUMMARY:Review\r\nDTSTART;TZID=America/New_York:20261026T090000\r\nDURATION:PT1H\r\nRRULE:FREQ=WEEKLY;BYDAY=MO\r\nEND:VEVENT\r\n");
        let found = occurrences(
            &text,
            at("2026-10-25 00:00"),
            at("2026-11-10 00:00"),
            &plus_one,
        );
        assert_eq!(
            found.iter().map(|o| o.start).collect::<Vec<_>>(),
            vec![
                at("2026-10-26 13:00"),
                at("2026-11-02 14:00"),
                at("2026-11-09 14:00")
            ]
        );
    }

    #[test]
    fn folded_lines_alarms_and_free_time() {
        let text = feed("BEGIN:VEVENT\r\nUID:3\r\nSUMMARY:Very long\r\n  title\r\nTRANSP:TRANSPARENT\r\nDTSTART:20260915T080000Z\r\nDTEND:20260915T083000Z\r\nBEGIN:VALARM\r\nTRIGGER:-PT15M\r\nSUMMARY:Not the title\r\nEND:VALARM\r\nEND:VEVENT\r\n");
        let found = occurrences(
            &text,
            at("2026-09-15 00:00"),
            at("2026-09-16 00:00"),
            &plus_one,
        );
        assert_eq!(found[0].title, "Very long title");
        assert!(!found[0].busy);
    }

    #[test]
    fn exdates_and_moved_instances_replace_the_series() {
        let text = feed("BEGIN:VEVENT\r\nUID:4\r\nSUMMARY:Daily\r\nDTSTART:20260914T070000Z\r\nDTEND:20260914T071500Z\r\nRRULE:FREQ=DAILY;COUNT=5\r\nEXDATE:20260915T070000Z\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:4\r\nRECURRENCE-ID:20260916T070000Z\r\nSUMMARY:Daily (moved)\r\nDTSTART:20260916T090000Z\r\nDTEND:20260916T091500Z\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:4\r\nRECURRENCE-ID:20260917T070000Z\r\nSTATUS:CANCELLED\r\nDTSTART:20260917T070000Z\r\nEND:VEVENT\r\n");
        let found = occurrences(
            &text,
            at("2026-09-14 00:00"),
            at("2026-09-30 00:00"),
            &plus_one,
        );
        assert_eq!(
            titles(&found),
            vec![
                ("Daily".into(), at("2026-09-14 07:00")),
                ("Daily (moved)".into(), at("2026-09-16 09:00")),
                ("Daily".into(), at("2026-09-18 07:00")),
            ]
        );
    }

    #[test]
    fn monthly_ordinals_and_set_positions() {
        // Second Tuesday, and the last weekday of the month.
        let text = feed("BEGIN:VEVENT\r\nUID:5\r\nSUMMARY:Board\r\nDTSTART:20260101T150000Z\r\nDTEND:20260101T160000Z\r\nRRULE:FREQ=MONTHLY;BYDAY=2TU\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:6\r\nSUMMARY:Payday\r\nDTSTART:20260101T120000Z\r\nDTEND:20260101T121500Z\r\nRRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1\r\nEND:VEVENT\r\n");
        let found = occurrences(
            &text,
            at("2026-10-01 00:00"),
            at("2026-11-01 00:00"),
            &plus_one,
        );
        assert_eq!(
            titles(&found),
            vec![
                ("Board".into(), at("2026-10-13 15:00")),
                ("Payday".into(), at("2026-10-30 12:00")),
            ]
        );
    }

    #[test]
    fn all_day_and_floating_events_use_local_time() {
        let text = feed("BEGIN:VEVENT\r\nUID:7\r\nSUMMARY:Holiday\r\nDTSTART;VALUE=DATE:20260918\r\nDTEND;VALUE=DATE:20260919\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:8\r\nSUMMARY:Floating\r\nDTSTART:20260918T100000\r\nDTEND:20260918T110000\r\nEND:VEVENT\r\n");
        let found = occurrences(
            &text,
            at("2026-09-17 00:00"),
            at("2026-09-20 00:00"),
            &plus_one,
        );
        assert_eq!(found[0].title, "Holiday");
        assert!(found[0].all_day);
        assert_eq!(found[0].start, at("2026-09-17 23:00"));
        assert_eq!(found[0].end, at("2026-09-18 23:00"));
        assert_eq!(found[1].start, at("2026-09-18 09:00"));
    }

    #[test]
    fn until_and_interval_end_a_series() {
        let text = feed("BEGIN:VEVENT\r\nUID:9\r\nSUMMARY:Fortnightly\r\nDTSTART:20260901T080000Z\r\nDTEND:20260901T090000Z\r\nRRULE:FREQ=WEEKLY;INTERVAL=2;UNTIL=20260930T235959Z\r\nEND:VEVENT\r\n");
        let found = occurrences(
            &text,
            at("2026-09-01 00:00"),
            at("2026-12-01 00:00"),
            &plus_one,
        );
        assert_eq!(
            found.iter().map(|o| o.start).collect::<Vec<_>>(),
            vec![
                at("2026-09-01 08:00"),
                at("2026-09-15 08:00"),
                at("2026-09-29 08:00")
            ]
        );
    }

    #[test]
    fn an_event_already_under_way_is_found() {
        let text = feed("BEGIN:VEVENT\r\nUID:10\r\nSUMMARY:Workshop\r\nDTSTART:20260918T080000Z\r\nDTEND:20260918T120000Z\r\nEND:VEVENT\r\n");
        let found = occurrences(
            &text,
            at("2026-09-18 10:00"),
            at("2026-09-19 00:00"),
            &plus_one,
        );
        assert_eq!(found.len(), 1);
        let none = occurrences(
            &text,
            at("2026-09-18 12:00"),
            at("2026-09-19 00:00"),
            &plus_one,
        );
        assert!(none.is_empty());
    }

    /// Reads a real feed saved to disk, when asked:
    /// `MOTE_ICS_FILE=feed.ics cargo test --lib ics -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn a_real_feed_reads() {
        let Ok(path) = std::env::var("MOTE_ICS_FILE") else {
            return;
        };
        let text = std::fs::read_to_string(path).unwrap();
        let now = Utc::now();
        let found = occurrences(&text, now, now + Duration::days(120), &system_zone);
        for occurrence in &found {
            println!("{} {} {}", occurrence.start, occurrence.all_day, occurrence.title);
        }
        assert!(!found.is_empty());
    }

    #[test]
    fn durations_parse() {
        assert_eq!(parse_duration("PT1H30M"), Some(Duration::minutes(90)));
        assert_eq!(parse_duration("P1D"), Some(Duration::days(1)));
        assert_eq!(parse_duration("P2W"), Some(Duration::weeks(2)));
        assert_eq!(parse_duration("-PT15M"), Some(Duration::minutes(-15)));
        assert_eq!(parse_duration("1H"), None);
    }
}
