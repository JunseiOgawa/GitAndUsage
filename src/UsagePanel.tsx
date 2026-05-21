import React, { useState } from "react";
import { UsageSnapshot, AppConfig } from "./types";

interface UsagePanelProps {
  snapshots: UsageSnapshot[];
  loading: boolean;
  error: string | null;
  config: AppConfig | null;
}

export const UsagePanel: React.FC<UsagePanelProps> = ({
  snapshots,
  loading,
  error,
  config,
}) => {
  const [activeTab, setActiveTab] = useState<string>("codex");

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) {
      return isoString;
    }
  };

  const getPercentage = (used?: number, limit?: number) => {
    if (used === undefined || limit === undefined || limit <= 0) return 0;
    return Math.min(100, Math.round((used / limit) * 100));
  };

  const activeSnapshot = snapshots.find(
    (s) => s.provider.toLowerCase() === activeTab.toLowerCase()
  );

  // Extract personalized subscription configurations
  const getSubscriptionDetails = () => {
    if (!config) return { plan: undefined, account: undefined };
    
    if (activeTab === "codex") {
      return {
        plan: config.codexPlan,
        account: config.codexAccount
      };
    } else if (activeTab === "copilot") {
      return {
        plan: config.copilotPlan,
        account: config.copilotAccount
      };
    } else if (activeTab === "claude") {
      return {
        plan: config.claudePlan,
        account: config.claudeAccount
      };
    }
    return { plan: undefined, account: undefined };
  };

  const subDetails = getSubscriptionDetails();

  // Prefer configured custom plan/account information, fallback to telemetry snapshots
  const activePlanLabel = subDetails.plan || (activeSnapshot ? activeSnapshot.planLabel : undefined);
  const activeAccountLabel = subDetails.account || (activeSnapshot ? activeSnapshot.accountLabel : undefined);

  const tabs = [
    { id: "codex", label: "Codex" },
    { id: "copilot", label: "Copilot" },
    { id: "claude", label: "Claude" }
  ];

  return (
    <div className="right-panel">
      <div className="usage-viewport">
        {loading && snapshots.length === 0 ? (
          <div className="fallback-screen" style={{ height: "100%" }}>
            <div className="spinner"></div>
            <p style={{ marginTop: "12px", fontSize: "0.85rem" }}>Updating usage snapshots...</p>
          </div>
        ) : error && snapshots.length === 0 ? (
          <div className="fallback-screen" style={{ height: "100%" }}>
            <div className="fallback-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h4 style={{ marginBottom: "4px" }}>Failed to Load</h4>
            <p className="fallback-text" style={{ fontSize: "0.75rem" }}>{error}</p>
          </div>
        ) : !activeSnapshot ? (
          <div className="fallback-screen tab-slide-fade-in" key={activeTab} style={{ height: "100%", justifyContent: "center" }}>
            <div className="fallback-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
            </div>
            <h4 style={{ marginBottom: "4px", color: "var(--text-primary)" }}>{activeTab.toUpperCase()} Offline</h4>
            <p className="fallback-text" style={{ fontSize: "0.75rem" }}>No active telemetry data</p>
          </div>
        ) : (
          <div className="usage-card-borderless tab-slide-fade-in" key={activeSnapshot.provider}>
            <div className="usage-card-top">
              <div className="provider-header-row">
                <div className="provider-brand">
                  <span className="provider-logo-indicator" style={{ background: `var(--status-${activeSnapshot.status})` }} />
                  <span className="provider-title">{activeSnapshot.displayName}</span>
                </div>
                <span className={`status-dot status-${activeSnapshot.status}`} title={`Status: ${activeSnapshot.status}`} />
              </div>

              {/* Dynamic Personalized Labels */}
              <div className="provider-meta-row" style={{ marginTop: "8px" }}>
                {activeAccountLabel && (
                  <span className="usage-label" title="Account profile">
                    {activeAccountLabel}
                  </span>
                )}
                {activePlanLabel && (
                  <span className="usage-label active-plan" title="Subscription tier">
                    {activePlanLabel}
                  </span>
                )}
              </div>

              <div className="progress-container" style={{ marginTop: "20px", gap: "6px" }}>
                {(() => {
                  const hasLimit = activeSnapshot.limit !== undefined && activeSnapshot.limit !== null && activeSnapshot.limit > 0;
                  const hasUsed = activeSnapshot.used !== undefined && activeSnapshot.used !== null;
                  const percent = getPercentage(activeSnapshot.used, activeSnapshot.limit);

                  return (
                    <>
                      <div className="progress-values" style={{ fontSize: "0.85rem" }}>
                        <span className="progress-percentage">
                          {hasLimit ? `${percent}%` : "No Limit"}
                        </span>
                        <span className="progress-text">
                          {hasUsed ? (
                            <>
                              {activeSnapshot.used}
                              {hasLimit ? ` / ${activeSnapshot.limit}` : ""} {activeSnapshot.unit}
                            </>
                          ) : (
                            "N/A"
                          )}
                        </span>
                      </div>
                      <div className="progress-track" style={{ height: "5px" }}>
                        <div
                          className={`progress-bar ${activeSnapshot.status}`}
                          style={{ width: `${hasLimit ? percent : 100}%` }}
                        />
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            <div className="usage-card-bottom">
              <span>Telemetry: {activeSnapshot.provider}</span>
              <span>Updated {formatTime(activeSnapshot.lastUpdatedAt)}</span>
            </div>
          </div>
        )}
      </div>

      <div className="usage-tabs-vertical-container">
        <div className="usage-tabs-vertical">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const hasData = snapshots.some(s => s.provider.toLowerCase() === tab.id);
            return (
              <button
                key={tab.id}
                className={`usage-tab-vertical-btn ${isActive ? "active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
                {hasData && <span className="tab-indicator-dot" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
