use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UsageSnapshot {
    pub provider: String,
    pub display_name: String,
    pub account_label: String,
    pub plan_label: String,
    pub used: f64,
    pub limit: f64,
    pub unit: String,
    pub status: String,
    pub last_updated_at: String,
}
