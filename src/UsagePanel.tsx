import React, { useState, useEffect } from "react";
import { UsageSnapshot } from "./types";

interface UsagePanelProps {
  snapshots: UsageSnapshot[];
  loading: boolean;
  error: string | null;
}

export const UsagePanel: React.FC<UsagePanelProps> = ({ snapshots, loading, error }) => {
  const [activeTab, setActiveTab] = useState<string>("codex");

  // Keep activeTab in sync with available snapshots if necessary, or just default to "codex"
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

  // Find the snapshot for the active tab
  const activeSnapshot = snapshots.find(
    (s) => s.provider.toLowerCase() === activeTab.toLowerCase()
  );

  const tabs = [
    { id: "codex", label: "Codex" },
    { id: "copilot", label: "Copilot" },
    { id: "claude", label: "Claude" }
  ];

  return (
    <div className="right-panel glass-panel">
      <div className="panel-header" style={{ flexDirection: "column", alignItems: "stretch", gap: "12px" }}>
        <div className="panel-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent-color)" }}>
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
          Resource Usage
        </div>
        
        {/* Stylish Tab Buttons */}
        <div className="usage-tabs">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const hasData = snapshots.some(s => s.provider.toLowerCase() === tab.id);
            return (
              <button
                key={tab.id}
                className={`usage-tab-btn ${isActive ? "active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
                {hasData && <span className="tab-indicator-dot" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="panel-content" style={{ padding: "16px", display: "flex", flexDirection: "column" }}>
        {loading && snapshots.length === 0 ? (
          <div className="fallback-screen" style={{ height: "80%" }}>
            <div className="spinner"></div>
            <p style={{ marginTop: "16px" }}>Updating resource snapshots...</p>
          </div>
        ) : error && snapshots.length === 0 ? (
          <div className="fallback-screen" style={{ height: "80%" }}>
            <div className="fallback-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h3 style={{ marginBottom: "8px" }}>Failed to Load Usage</h3>
            <p className="fallback-text">{error}</p>
          </div>
        ) : !activeSnapshot ? (
          <div className="fallback-screen tab-fade-in" key={activeTab} style={{ height: "80%", justifyContent: "center" }}>
            <div className="fallback-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
            </div>
            <h4 style={{ marginBottom: "6px", color: "var(--text-primary)" }}>No Data for {activeTab.toUpperCase()}</h4>
            <p className="fallback-text" style={{ fontSize: "0.8rem" }}>
              This provider is either disabled or has no usage snapshots recorded.
            </p>
          </div>
        ) : (
          <div className="usage-card tab-fade-in" key={activeSnapshot.provider} style={{ flex: 1, minHeight: 0, justifyContent: "space-between" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div className="usage-card-header">
                <div className="usage-provider-info">
                  <span className="usage-provider-name" style={{ fontSize: "1.1rem" }}>
                    {activeSnapshot.displayName}
                  </span>
                  <div className="usage-provider-labels" style={{ marginTop: "4px" }}>
                    {activeSnapshot.accountLabel && (
                      <span className="usage-label">{activeSnapshot.accountLabel}</span>
                    )}
                    {activeSnapshot.planLabel && (
                      <span className="usage-label" style={{ borderColor: "rgba(99, 102, 241, 0.2)", color: "#a5b4fc" }}>
                        {activeSnapshot.planLabel}
                      </span>
                    )}
                  </div>
                </div>
                <span className={`status-dot status-${activeSnapshot.status}`} title={`Status: ${activeSnapshot.status}`} />
              </div>

              <div className="progress-container" style={{ gap: "10px", marginTop: "10px" }}>
                {(() => {
                  const hasLimit = activeSnapshot.limit !== undefined && activeSnapshot.limit !== null && activeSnapshot.limit > 0;
                  const hasUsed = activeSnapshot.used !== undefined && activeSnapshot.used !== null;
                  const percent = getPercentage(activeSnapshot.used, activeSnapshot.limit);

                  return (
                    <>
                      <div className="progress-track" style={{ height: "8px" }}>
                        <div
                          className={`progress-bar ${activeSnapshot.status}`}
                          style={{ width: `${hasLimit ? percent : 100}%` }}
                        />
                      </div>
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
                    </>
                  );
                })()}
              </div>
            </div>

            <div className="usage-footer" style={{ marginTop: "auto" }}>
              <span>{activeSnapshot.provider}</span>
              <span>Updated {formatTime(activeSnapshot.lastUpdatedAt)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
