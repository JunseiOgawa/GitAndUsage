import React from "react";
import { UsageSnapshot } from "./types";

interface UsagePanelProps {
  snapshots: UsageSnapshot[];
  loading: boolean;
  error: string | null;
}

export const UsagePanel: React.FC<UsagePanelProps> = ({ snapshots, loading, error }) => {
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

  return (
    <div className="right-panel glass-panel">
      <div className="panel-header">
        <div className="panel-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent-color)" }}>
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
          Resource Usage
        </div>
      </div>

      <div className="panel-content" style={{ padding: "16px" }}>
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
        ) : snapshots.length === 0 ? (
          <div className="fallback-screen" style={{ height: "80%" }}>
            <div className="fallback-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
              </svg>
            </div>
            <h3 style={{ marginBottom: "8px" }}>No Data Available</h3>
            <p className="fallback-text">Check if the snapshot providers are configured and running.</p>
          </div>
        ) : (
          <div className="usage-list">
            {snapshots.map((item) => {
              const hasLimit = item.limit !== undefined && item.limit !== null && item.limit > 0;
              const hasUsed = item.used !== undefined && item.used !== null;
              const percent = getPercentage(item.used, item.limit);

              return (
                <div key={item.provider} className="usage-card">
                  <div className="usage-card-header">
                    <div className="usage-provider-info">
                      <span className="usage-provider-name">{item.displayName}</span>
                      <div className="usage-provider-labels">
                        {item.accountLabel && (
                          <span className="usage-label">{item.accountLabel}</span>
                        )}
                        {item.planLabel && (
                          <span className="usage-label" style={{ borderColor: "rgba(99, 102, 241, 0.2)", color: "#a5b4fc" }}>
                            {item.planLabel}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={`status-dot status-${item.status}`} title={`Status: ${item.status}`} />
                  </div>

                  <div className="progress-container">
                    <div className="progress-track">
                      <div
                        className={`progress-bar ${item.status}`}
                        style={{ width: `${hasLimit ? percent : 100}%` }}
                      />
                    </div>
                    <div className="progress-values">
                      <span className="progress-percentage">
                        {hasLimit ? `${percent}%` : "No Limit"}
                      </span>
                      <span className="progress-text">
                        {hasUsed ? (
                          <>
                            {item.used}
                            {hasLimit ? ` / ${item.limit}` : ""} {item.unit}
                          </>
                        ) : (
                          "N/A"
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="usage-footer">
                    <span>{item.provider}</span>
                    <span>Updated {formatTime(item.lastUpdatedAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
