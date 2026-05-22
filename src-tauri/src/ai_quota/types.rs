use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ProviderId {
    Claude,
    Codex,
    Copilot,
    Opencode,
}

impl ProviderId {
    pub fn as_str(&self) -> &'static str {
        match self {
            ProviderId::Claude => "claude",
            ProviderId::Codex => "codex",
            ProviderId::Copilot => "copilot",
            ProviderId::Opencode => "opencode",
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum QuotaWindowId {
    #[serde(rename = "5h")]
    Window5h,
    #[serde(rename = "7d")]
    Window7d,
    Session,
    Weekly,
    Monthly,
    Credits,
    Primary,
    Secondary,
    Unknown,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum QuotaUnit {
    Percent,
    Requests,
    Credits,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct QuotaWindow {
    pub id: QuotaWindowId,
    pub label: String,
    pub remaining_percent: Option<f64>,
    pub remaining_value: Option<f64>,
    pub total_value: Option<f64>,
    pub unit: QuotaUnit,
    pub reset_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum QuotaSource {
    Cli,
    CliAuth,
    Statusline,
    LocalFile,
    InternalApi,
    OpencodeQuota,
    Manual,
    Unavailable,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum QuotaReliability {
    High,
    Medium,
    Low,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProviderQuota {
    pub provider: ProviderId,
    pub display_name: String,
    pub cli_installed: bool,
    pub logged_in: bool,
    pub account_label: Option<String>,
    pub windows: Vec<QuotaWindow>,
    pub source: QuotaSource,
    pub reliability: QuotaReliability,
    pub updated_at: String,
    pub warning: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProviderAuthStatus {
    pub provider: String,
    pub logged_in: bool,
    pub cli_installed: bool,
    pub account_label: Option<String>,
    pub error: Option<String>,
}
