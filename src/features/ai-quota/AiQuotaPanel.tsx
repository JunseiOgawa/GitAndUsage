import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { ProviderQuota, ProviderId } from "../../types";
import { QuotaMeter } from "./QuotaMeter";
import { SetupHint } from "./SetupHint";

export const AiQuotaPanel: React.FC = () => {
  const { t } = useTranslation();
  const [quotas, setQuotas] = useState<ProviderQuota[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [expandedProvider, setExpandedProvider] = useState<ProviderId | null>("claude");

  // Load quotas on mount
  const loadQuotas = async () => {
    try {
      setLoading(true);
      setError(null);
      // get_all_ai_quotas returns Vec<ProviderQuota>
      const data = await invoke<ProviderQuota[]>("get_all_ai_quotas");
      setQuotas(data);
    } catch (err: any) {
      console.error("Failed to fetch AI quotas:", err);
      setError(err?.toString() || "Unknown error loading quotas");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQuotas();
  }, []);

  const handleRefreshAll = async () => {
    setLoading(true);
    setError(null);
    try {
      // Refresh individual providers in parallel using Tauri refresh commands
      const providers: ProviderId[] = ["claude", "codex", "copilot", "opencode"];
      
      // We can invoke "refresh_ai_quota" for each and then reload all
      await Promise.all(
        providers.map(p => 
          invoke<ProviderQuota>("refresh_ai_quota", { provider: p })
            .catch(e => console.error(`Failed to refresh ${p}:`, e))
        )
      );
      
      await loadQuotas();
    } catch (err: any) {
      setError(err?.toString() || "Failed to refresh quotas");
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshProvider = async (provider: ProviderId, e: React.MouseEvent) => {
    e.stopPropagation(); // Avoid toggling accordion
    setRefreshing(prev => ({ ...prev, [provider]: true }));
    try {
      const updated = await invoke<ProviderQuota>("refresh_ai_quota", { provider });
      setQuotas(prev => prev.map(q => q.provider === provider ? updated : q));
    } catch (err) {
      console.error(`Failed to refresh ${provider}:`, err);
    } finally {
      setRefreshing(prev => ({ ...prev, [provider]: false }));
    }
  };

  const toggleExpand = (provider: ProviderId) => {
    setExpandedProvider(prev => (prev === provider ? null : provider));
  };

  return (
    <div className="ai-quota-panel" style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      position: "relative"
    }}>
      {/* Header controls inside panel */}
      <div className="panel-header-actions" style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 10px",
        height: "28px",
        minHeight: "28px",
        borderBottom: "1px solid rgba(255, 255, 255, 0.03)",
        background: "rgba(0,0,0,0.15)"
      }}>
        <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--text-secondary)", letterSpacing: "0.5px", textTransform: "uppercase" }}>
          {t("quota.title")}
        </span>
        <button
          onClick={handleRefreshAll}
          disabled={loading}
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.05)",
            color: "var(--text-primary)",
            padding: "2px 8px",
            borderRadius: "4px",
            fontSize: "0.7rem",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            transition: "var(--transition-smooth)"
          }}
          className="refresh-all-btn"
        >
          <svg
            className={loading ? "spin" : ""}
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            style={{ transition: "transform 0.5s ease" }}
          >
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
          </svg>
          {loading ? t("quota.syncing") : t("quota.syncAll")}
        </button>
      </div>

      <div className="ai-quota-list-viewport" style={{
        flex: 1,
        overflowY: "auto",
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: "10px"
      }}>
        {loading && quotas.length === 0 ? (
          <div className="fallback-screen" style={{ height: "200px" }}>
            <div className="spinner"></div>
            <p style={{ marginTop: "12px", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
              {t("quota.scanning")}
            </p>
          </div>
        ) : error && quotas.length === 0 ? (
          <div className="fallback-screen" style={{ height: "200px" }}>
            <span style={{ fontSize: "1.5rem" }}>⚠️</span>
            <p style={{ marginTop: "8px", fontSize: "0.75rem", color: "var(--color-danger)" }}>{error}</p>
          </div>
        ) : (
          quotas.map((quota) => {
            const isExpanded = expandedProvider === quota.provider;
            const isRef = refreshing[quota.provider];
            
            // Calculate primary window percentage for collapsed preview
            const primaryWindow = quota.windows[0];
            const getPreviewPercent = () => {
              if (!quota.loggedIn || !primaryWindow) return undefined;
              if (primaryWindow.remainingPercent !== undefined) return primaryWindow.remainingPercent;
              if (primaryWindow.remainingValue !== undefined && primaryWindow.totalValue !== undefined && primaryWindow.totalValue > 0) {
                return (primaryWindow.remainingValue / primaryWindow.totalValue) * 100;
              }
              return undefined;
            };
            const previewPercent = getPreviewPercent();

            return (
              <div
                key={quota.provider}
                onClick={() => toggleExpand(quota.provider)}
                className={`quota-accordion-card ${isExpanded ? "expanded" : ""}`}
                style={{
                  background: isExpanded ? "rgba(255, 255, 255, 0.03)" : "rgba(255, 255, 255, 0.01)",
                  border: isExpanded ? "1px solid rgba(255, 255, 255, 0.07)" : "1px solid rgba(255, 255, 255, 0.03)",
                  borderRadius: "8px",
                  padding: "12px",
                  cursor: "pointer",
                  transition: "var(--transition-smooth)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px"
                }}
              >
                {/* Header row */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      background: !quota.cliInstalled 
                        ? "var(--color-unknown)" 
                        : !quota.loggedIn 
                          ? "var(--color-warning)" 
                          : "var(--color-ok)",
                      boxShadow: quota.loggedIn ? "0 0 6px var(--color-ok)" : "none"
                    }} />
                    <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)" }}>
                      {quota.displayName}
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {quota.loggedIn && quota.accountLabel && (
                      <span style={{
                        fontSize: "0.68rem",
                        color: "var(--text-muted)",
                        background: "rgba(255,255,255,0.02)",
                        padding: "2px 6px",
                        borderRadius: "4px"
                      }}>
                        {quota.accountLabel}
                      </span>
                    )}

                    <button
                      onClick={(e) => handleRefreshProvider(quota.provider, e)}
                      disabled={isRef || !quota.cliInstalled}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--text-muted)",
                        cursor: quota.cliInstalled ? "pointer" : "not-allowed",
                        padding: "2px",
                        display: "inline-flex",
                        alignItems: "center"
                      }}
                      title={t("quota.syncProvider")}
                    >
                      <svg
                        className={isRef ? "spin" : ""}
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Status/Preview Row (Only shown when collapsed or simple status) */}
                {!isExpanded && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.72rem", color: "var(--text-secondary)" }}>
                    <span>
                      {!quota.cliInstalled 
                        ? t("quota.status.notInstalled") 
                        : !quota.loggedIn 
                          ? t("quota.status.authRequired") 
                          : primaryWindow 
                            ? `${primaryWindow.label}` 
                            : t("quota.status.authenticated")}
                    </span>
                    {quota.loggedIn && previewPercent !== undefined && (
                      <span style={{
                        color: previewPercent >= 50 ? "var(--color-ok)" : previewPercent >= 20 ? "var(--color-warning)" : "var(--color-danger)",
                        fontWeight: 600
                      }}>
                        {t("quota.status.left", { percent: Math.round(previewPercent) })}
                      </span>
                    )}
                  </div>
                )}

                {/* Expanded Details */}
                {isExpanded && (
                  <div 
                    onClick={(e) => e.stopPropagation()} // Avoid closing when clicking inside
                    style={{ 
                      marginTop: "4px",
                      display: "flex",
                      flexDirection: "column",
                      cursor: "default"
                    }}
                  >
                    {!quota.cliInstalled || !quota.loggedIn ? (
                      <SetupHint
                        provider={quota.provider}
                        cliInstalled={quota.cliInstalled}
                        loggedIn={quota.loggedIn}
                      />
                    ) : (
                      <>
                        {/* Windows metrics list */}
                        {quota.windows.map((w, idx) => (
                          <QuotaMeter key={idx} window={w} />
                        ))}

                        {/* Reliability and last synced */}
                        <div style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          fontSize: "0.64rem",
                          color: "var(--text-muted)",
                          borderTop: "1px solid rgba(255,255,255,0.02)",
                          paddingTop: "8px",
                          marginTop: "6px"
                        }}>
                          <span>
                            {t("quota.source", {
                              source: quota.source.toUpperCase().replace("_", " "),
                              reliability: t(`quota.reliability.${quota.reliability}`, { defaultValue: quota.reliability })
                            })}
                          </span>
                          <span>
                            {t("quota.synced", {
                              time: new Date(quota.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            })}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
