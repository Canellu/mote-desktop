//! Feedback submission.
//!
//! The webview never talks to the network here. Everything a reporter typed
//! passes through this module first, which is what lets the app promise that
//! the text it previews is the text that leaves the machine, and what keeps a
//! restrictive Tauri CSP achievable.
//!
//! The hosted side redacts again as a backstop. That is deliberate duplication:
//! this pass means an address or a bridge IP never travels over the wire at
//! all, rather than being scrubbed after it arrives.

use std::{sync::OnceLock, time::Duration};

use regex::Regex;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

const ENDPOINT: &str = "https://motedesktop.com/api/feedback";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);

const MAX_MESSAGE_CHARS: usize = 4_000;
const MAX_EMAIL_CHARS: usize = 254;

/// Injected at build time. It is not a secret in any meaningful sense — a token
/// inside a shipped binary can be extracted — and the server does not treat it
/// as one. It keeps the endpoint from being an open write target for anyone who
/// merely finds the URL. Absent in a plain `cargo` build, which is why the
/// command fails loudly rather than posting without it.
const APP_TOKEN: Option<&str> = option_env!("MOTE_FEEDBACK_APP_TOKEN");

// A debug build without the token is ordinary — a contributor who has never
// seen the secret should still be able to run the app. A *release* build
// without it is a silent disaster: it compiles, installs, and then tells every
// reporter to send an email instead, and nobody finds out until a customer
// tries. So make it unbuildable rather than merely documented.
#[cfg(not(debug_assertions))]
const _: () = {
    if APP_TOKEN.is_none() {
        panic!(
            "MOTE_FEEDBACK_APP_TOKEN must be set when building a release. \
             Put it in .env.local and build through `bun tauri build`, which loads it. \
             See AGENTS.md, Build-Time Configuration."
        );
    }
};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum FeedbackCategory {
    Bug,
    Feature,
    General,
}

impl FeedbackCategory {
    fn as_wire(self) -> &'static str {
        match self {
            Self::Bug => "bug",
            Self::Feature => "feature",
            Self::General => "general",
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ContactPreference {
    None,
    Reply,
    Updates,
}

impl ContactPreference {
    fn as_wire(self) -> &'static str {
        match self {
            Self::None => "none",
            Self::Reply => "reply",
            Self::Updates => "updates",
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackDraft {
    pub category: FeedbackCategory,
    pub message: String,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default = "default_contact_preference")]
    pub contact_preference: ContactPreference,
}

fn default_contact_preference() -> ContactPreference {
    ContactPreference::None
}

/// Exactly what a submission will contain, for the dialog to show before the
/// reporter commits to sending it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackPreview {
    pub message: String,
    pub redacted: bool,
    pub contact_email: Option<String>,
    pub app_version: String,
    pub platform: String,
    pub release_channel: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackReceipt {
    pub report_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HostedResponse {
    #[serde(default)]
    report_id: Option<String>,
    #[serde(default)]
    error: Option<String>,
}

/// Compiled once. Order matches the hosted pass so both produce the same text:
/// paths before the number rules, so a path full of digits is not half-eaten.
fn redaction_rules() -> &'static [(Regex, &'static str)] {
    static RULES: OnceLock<Vec<(Regex, &'static str)>> = OnceLock::new();

    RULES.get_or_init(|| {
        let patterns: &[(&str, &str)] = &[
            (r#"(?:[A-Za-z]:\\|\\\\)[^\s"'<>|]*"#, "[path]"),
            (r"[\w.!#$%&'*+/=?^`{|}~-]+@[\w-]+(?:\.[\w-]+)+", "[email]"),
            (
                r"(?i)\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b",
                "[id]",
            ),
            (r"\b(?:\d{1,3}\.){3}\d{1,3}\b", "[ip]"),
            (r"(?i)\b(?:[0-9a-f]{1,4}:){3,7}[0-9a-f]{1,4}\b", "[ip]"),
            (
                r"(?i)\b(?:bearer|token|api[_-]?key|password|secret)\s*[:=]\s*\S+",
                "[credential]",
            ),
            // The hosted pass uses a lookahead to require a digit; Rust's regex
            // crate has no lookaround, so the digit requirement is applied as a
            // second check in `redact` instead.
            (r"\b[A-Za-z0-9]{32,}\b", "[token]"),
            (r"\+?\d(?:[ ().-]?\d){8,}", "[phone]"),
        ];

        patterns
            .iter()
            .map(|(pattern, replacement)| {
                (
                    Regex::new(pattern).expect("feedback redaction pattern must compile"),
                    *replacement,
                )
            })
            .collect()
    })
}

fn redact(text: &str) -> String {
    let mut output = text.to_string();

    for (pattern, replacement) in redaction_rules() {
        output = if *replacement == "[token]" {
            // Only opaque-looking runs, so a long ordinary word survives.
            pattern
                .replace_all(&output, |captures: &regex::Captures| {
                    let matched = &captures[0];
                    if matched.chars().any(|character| character.is_ascii_digit()) {
                        (*replacement).to_string()
                    } else {
                        matched.to_string()
                    }
                })
                .into_owned()
        } else {
            pattern.replace_all(&output, *replacement).into_owned()
        };
    }

    output
}

fn normalise_email(value: Option<&str>) -> Option<String> {
    let candidate = value?.trim().to_lowercase();

    if candidate.is_empty() || candidate.chars().count() > MAX_EMAIL_CHARS {
        return None;
    }

    // Syntactic only. The address exists so a human can reply to one report; it
    // is never verified, enriched, or looked up.
    let (local, domain) = candidate.split_once('@')?;
    let valid = !local.is_empty()
        && domain.contains('.')
        && !domain.starts_with('.')
        && !domain.ends_with('.')
        && !domain.contains("..")
        && !candidate.contains(char::is_whitespace);

    valid.then_some(candidate)
}

fn release_channel() -> &'static str {
    if cfg!(debug_assertions) {
        "development"
    } else {
        "stable"
    }
}

fn platform() -> String {
    format!("{} {}", std::env::consts::OS, std::env::consts::ARCH)
}

fn build_preview(app: &AppHandle, draft: &FeedbackDraft) -> Result<FeedbackPreview, String> {
    let trimmed = draft.message.trim();

    if trimmed.is_empty() {
        return Err("Write a little about what happened before sending.".to_string());
    }

    let message = redact(trimmed);

    if message.chars().count() > MAX_MESSAGE_CHARS {
        return Err(format!(
            "Feedback is limited to {MAX_MESSAGE_CHARS} characters."
        ));
    }

    let contact_email = match draft.contact_preference {
        ContactPreference::None => None,
        ContactPreference::Reply | ContactPreference::Updates => {
            match normalise_email(draft.email.as_deref()) {
                Some(email) => Some(email),
                None => {
                    return Err(
                        "Add a valid email address, or choose not to receive a reply.".to_string(),
                    )
                }
            }
        }
    };

    Ok(FeedbackPreview {
        redacted: message != trimmed,
        message,
        contact_email,
        app_version: app.package_info().version.to_string(),
        platform: platform(),
        release_channel: release_channel().to_string(),
    })
}

#[tauri::command(rename = "preview-feedback")]
pub fn preview_feedback(app: AppHandle, draft: FeedbackDraft) -> Result<FeedbackPreview, String> {
    build_preview(&app, &draft)
}

#[tauri::command(rename = "submit-feedback")]
pub async fn submit_feedback(
    app: AppHandle,
    draft: FeedbackDraft,
) -> Result<FeedbackReceipt, String> {
    let preview = build_preview(&app, &draft)?;

    let Some(token) = APP_TOKEN else {
        return Err(
            "This build cannot send feedback. Email support@motedesktop.com instead.".to_string(),
        );
    };

    let client = reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|_| "Couldn't prepare the request. Try again.".to_string())?;

    let response = client
        .post(ENDPOINT)
        .header("x-mote-app-token", token)
        .json(&serde_json::json!({
            "category": draft.category.as_wire(),
            "message": preview.message,
            "email": preview.contact_email,
            "contactPreference": draft.contact_preference.as_wire(),
            "appVersion": preview.app_version,
            "platform": preview.platform,
            "releaseChannel": preview.release_channel,
            "source": "app",
        }))
        .send()
        .await
        .map_err(|_| {
            // Never surface the transport error: it can carry the endpoint,
            // proxy details, or the local address.
            "Couldn't reach Mote. Check your connection and try again.".to_string()
        })?;

    let status = response.status();
    let parsed = response.json::<HostedResponse>().await.ok();

    if status.is_success() {
        return parsed
            .and_then(|body| body.report_id)
            .map(|report_id| FeedbackReceipt { report_id })
            .ok_or_else(|| "The report was sent but no reference came back.".to_string());
    }

    if status.as_u16() == 429 {
        return Err("A few reports have already gone through. Try again a bit later.".to_string());
    }

    // A 4xx carries a validation message worth showing; a 5xx does not.
    let hosted_message = parsed.and_then(|body| body.error);

    Err(match (status.is_client_error(), hosted_message) {
        (true, Some(message)) => message,
        _ => "Something went wrong sending that. Try again shortly.".to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::{normalise_email, redact};

    #[test]
    fn strips_the_identifiers_a_hue_user_is_likely_to_paste() {
        let redacted = redact(
            "Bridge 192.168.1.64 dropped light 0a1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9. \
             Log: C:\\Users\\anna\\mote\\log.txt. Mail anna@example.com or +47 912 34 567.",
        );

        assert!(redacted.contains("[ip]"));
        assert!(redacted.contains("[id]"));
        assert!(redacted.contains("[path]"));
        assert!(redacted.contains("[email]"));
        assert!(redacted.contains("[phone]"));
        assert!(!redacted.contains("192.168.1.64"));
        assert!(!redacted.contains("anna"));
    }

    #[test]
    fn leaves_ordinary_bug_prose_alone() {
        let prose = "Dragging brightness past 80% snaps back to 40% after 2-3 seconds \
                     on version 0.1.0, every time, even at 14:32:05.";

        assert_eq!(redact(prose), prose);
    }

    #[test]
    fn keeps_long_hyphenated_words_but_redacts_opaque_keys() {
        assert_eq!(
            redact("the colour-temperature-slider-tooltip is wrong"),
            "the colour-temperature-slider-tooltip is wrong"
        );
        assert_eq!(
            redact("key aBcD3fGhIjKlMnOpQrStUvWxYz0123456789AbCd here"),
            "key [token] here"
        );
    }

    #[test]
    fn redaction_is_idempotent() {
        let once = redact("bridge 10.0.0.2 went away");
        assert_eq!(redact(&once), once);
    }

    #[test]
    fn accepts_only_syntactically_valid_addresses() {
        assert_eq!(
            normalise_email(Some("  Anna@Example.COM ")),
            Some("anna@example.com".to_string())
        );
        assert_eq!(normalise_email(Some("not-an-address")), None);
        assert_eq!(normalise_email(Some("anna@localhost")), None);
        assert_eq!(normalise_email(Some("anna@example..com")), None);
        assert_eq!(normalise_email(Some("")), None);
        assert_eq!(normalise_email(None), None);
    }
}
