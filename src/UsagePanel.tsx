import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { UsageSnapshot, AppConfig, ProviderQuota, QuotaWindow } from "./types";
import { SetupHint } from "./features/ai-quota/SetupHint";

interface UsagePanelProps {
  snapshots: UsageSnapshot[];
  loading: boolean;
  error: string | null;
  config: AppConfig | null;
}

export const UsagePanel: React.FC<UsagePanelProps> = ({
  snapshots: _snapshots,
  loading: _loading,
  error: _error,
  config,
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<string>("codex");
  
  const [quotas, setQuotas] = useState<ProviderQuota[]>([]);
  const [loadingQuotas, setLoadingQuotas] = useState<boolean>(true);
  const [quotasError, setQuotasError] = useState<string | null>(null);

  const loadQuotas = async () => {
    try {
      const data = await invoke<ProviderQuota[]>("get_all_ai_quotas");
      setQuotas(data);
      setQuotasError(null);
    } catch (err: any) {
      console.error("Failed to fetch AI quotas:", err);
      setQuotasError(err?.toString() || "Failed to load usage details");
    } finally {
      setLoadingQuotas(false);
    }
  };

  useEffect(() => {
    loadQuotas();
    const interval = setInterval(loadQuotas, 15000);
    return () => clearInterval(interval);
  }, []);

  const getPercentage = (w: QuotaWindow) => {
    if (w.remainingPercent !== undefined) {
      return w.remainingPercent;
    }
    if (w.remainingValue !== undefined && w.totalValue !== undefined && w.totalValue > 0) {
      return Math.round((w.remainingValue / w.totalValue) * 100);
    }
    return undefined;
  };

  const getStatusClass = (percent?: number) => {
    if (percent === undefined) return "unknown";
    if (percent >= 50) return "ok";
    if (percent >= 20) return "warning";
    return "danger";
  };

  const activeQuota = quotas.find(
    (q) => q.provider.toLowerCase() === activeTab.toLowerCase()
  );

  const tabs = [
    { id: "codex", label: "Codex" },
    { id: "copilot", label: "Copilot" },
    { id: "claude", label: "Claude" }
  ];

  const renderQuotaBar = (label: string, w?: QuotaWindow, isUnlimited = false) => {
    const percent = isUnlimited ? 100 : w ? getPercentage(w) : undefined;
    const statusClass = isUnlimited ? "ok" : getStatusClass(percent);

    const formatValue = () => {
      if (isUnlimited) {
        return "Unlimited";
      }
      if (!w || percent === undefined) {
        return "N/A";
      }
      if (w.unit === "percent") {
        return `${Math.round(percent)}% left`;
      }
      if (w.unit === "requests") {
        return w.remainingValue !== undefined
          ? `${w.remainingValue} / ${w.totalValue ?? "N/A"} requests`
          : "N/A";
      }
      if (w.unit === "credits") {
        return w.remainingValue !== undefined ? `${w.remainingValue} credits` : "N/A";
      }
      return "N/A";
    };

    return (
      <div className="progress-container" style={{ gap: "4px" }}>
        <div className="progress-values" style={{ fontSize: "0.78rem" }}>
          <span className={`progress-percentage ${statusClass}`} style={{ fontWeight: 600 }}>
            {label}
          </span>
          <span className="progress-text" style={{ fontSize: "0.74rem" }}>
            {formatValue()}
          </span>
        </div>
        <div className="progress-track" style={{ height: "4px", background: "rgba(255, 255, 255, 0.05)" }}>
          <div
            className={`progress-bar ${statusClass}`}
            style={{ 
              width: `${percent !== undefined ? percent : 0}%`,
              background: percent === undefined ? "var(--color-unknown)" : undefined
            }}
          />
        </div>
      </div>
    );
  };

  const renderCardContent = () => {
    if (!activeQuota) {
      return (
        <div className="fallback-screen tab-slide-fade-in" key={activeTab} style={{ height: "100%", justifyContent: "center" }}>
          <div className="fallback-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
          </div>
          <h4 style={{ marginBottom: "4px", color: "var(--text-primary)" }}>{activeTab.toUpperCase()} {t("common.offline")}</h4>
          <p className="fallback-text" style={{ fontSize: "0.75rem" }}>{t("usage.noActiveTelemetry")}</p>
        </div>
      );
    }

    if (!activeQuota.cliInstalled || !activeQuota.loggedIn) {
      return (
        <SetupHint
          provider={activeQuota.provider}
          cliInstalled={activeQuota.cliInstalled}
          loggedIn={activeQuota.loggedIn}
        />
      );
    }

    const isCopilot = activeTab.toLowerCase() === "copilot";
    const dailyWindow = activeQuota.windows.find(w => w.id === "5h" || w.id === "primary");
    const weeklyWindow = activeQuota.windows.find(w => w.id === "7d" || w.id === "secondary");

    return (
      <div className="usage-card-borderless tab-slide-fade-in" key={activeQuota.provider} style={{ minHeight: "auto", display: "flex", flexDirection: "column", gap: "16px", justifyContent: "center", height: "100%" }}>
        {renderQuotaBar(t("Daily Limit", { defaultValue: "Daily Limit" }), dailyWindow, isCopilot)}
        {renderQuotaBar(t("Weekly Limit", { defaultValue: "Weekly Limit" }), weeklyWindow, isCopilot)}
      </div>
    );
  };

  return (
    <div className="right-panel">
      {config?.usageOnly && (
        <div 
          data-tauri-drag-region 
          className="usage-drag-handle" 
          style={{
            height: "12px",
            background: "rgba(255, 255, 255, 0.02)",
            borderBottom: "1px solid rgba(255, 255, 255, 0.03)",
            cursor: "move",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "3px"
          }}
          title={t("usage.dragHandle")}
        >
          <div data-tauri-drag-region style={{ width: "16px", height: "2px", background: "rgba(255, 255, 255, 0.15)", borderRadius: "1px" }} />
          <div data-tauri-drag-region style={{ width: "16px", height: "2px", background: "rgba(255, 255, 255, 0.15)", borderRadius: "1px" }} />
        </div>
      )}

      <div className="usage-viewport" style={{ padding: "16px 52px 16px 14px", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        {loadingQuotas && quotas.length === 0 ? (
          <div className="fallback-screen" style={{ height: "100%" }}>
            <div className="spinner"></div>
            <p style={{ marginTop: "12px", fontSize: "0.85rem" }}>{t("usage.updating")}</p>
          </div>
        ) : quotasError && quotas.length === 0 ? (
          <div className="fallback-screen" style={{ height: "100%" }}>
            <div className="fallback-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h4 style={{ marginBottom: "4px" }}>{t("common.failedToLoad")}</h4>
            <p className="fallback-text" style={{ fontSize: "0.75rem" }}>{quotasError}</p>
          </div>
        ) : (
          renderCardContent()
        )}
      </div>

      <div className="usage-tabs-vertical-container">
        <div className="usage-tabs-vertical">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const quota = quotas.find(q => q.provider.toLowerCase() === tab.id);
            const hasData = quota && quota.loggedIn;
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
