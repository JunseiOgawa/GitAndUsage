import React, { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { UsageSnapshot, AppConfig, ProviderQuota, QuotaWindow } from "./types";
import { SetupHint } from "./features/ai-quota/SetupHint";

interface UsagePanelProps {
  snapshots: UsageSnapshot[];
  loading: boolean;
  error: string | null;
  config: AppConfig | null;
  isUsageOnly: boolean;
  isPositionLocked: boolean;
  onToggleLock: () => void;
  onDockChange?: (dock: "left" | "right" | "top" | "bottom" | "floating") => void;
}

export const UsagePanel: React.FC<UsagePanelProps> = ({
  snapshots: _snapshots,
  loading: _loading,
  error: _error,
  config,
  isUsageOnly,
  isPositionLocked,
  onToggleLock,
  onDockChange,
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<string>("codex");

  // Stale-while-revalidate: keep last known quotas while refreshing in background
  const [quotas, setQuotas] = useState<ProviderQuota[]>([]);
  const [loadingQuotas, setLoadingQuotas] = useState<boolean>(true); // only true on first load
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [quotasError, setQuotasError] = useState<string | null>(null);
  const isFirstLoad = useRef(true);

  const loadQuotas = useCallback(async () => {
    const firstLoad = isFirstLoad.current;
    if (firstLoad) {
      setLoadingQuotas(true);
    } else {
      setIsRefreshing(true);
    }

    try {
      const data = await invoke<ProviderQuota[]>("get_all_ai_quotas");
      // Only replace data once the new fetch succeeds
      setQuotas(data);
      setQuotasError(null);
    } catch (err: any) {
      console.error("Failed to fetch AI quotas:", err);
      // On error: keep the old data, just record the error
      setQuotasError(err?.toString() || "Failed to load usage details");
    } finally {
      setLoadingQuotas(false);
      setIsRefreshing(false);
      isFirstLoad.current = false;
    }
  }, []);

  useEffect(() => {
    loadQuotas();
    const interval = setInterval(loadQuotas, 15000);
    // Listen for manual refresh triggered by the refresh button in App.tsx
    const handleManualRefresh = () => loadQuotas();
    window.addEventListener("quota-manual-refresh", handleManualRefresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener("quota-manual-refresh", handleManualRefresh);
    };
  }, [loadQuotas]);

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

  /** Compute human-readable remaining time from ISO reset string */
  const formatTimeRemaining = (isoString?: string): string | null => {
    if (!isoString) return null;
    try {
      const resetDate = new Date(isoString);
      const now = new Date();
      const diffMs = resetDate.getTime() - now.getTime();
      if (diffMs <= 0) return null;

      const totalMinutes = Math.floor(diffMs / 60000);
      const days = Math.floor(totalMinutes / 1440);
      const hours = Math.floor((totalMinutes % 1440) / 60);
      const minutes = totalMinutes % 60;

      if (totalMinutes < 1) return t("quota.resetInLessThanMinute");
      if (days > 0) return t("quota.resetIn", { time: t("quota.resetInDays", { d: days, h: hours, m: minutes }) });
      if (hours > 0) return t("quota.resetIn", { time: t("quota.resetInHours", { h: hours, m: minutes }) });
      return t("quota.resetIn", { time: t("quota.resetInMinutes", { m: minutes }) });
    } catch {
      return null;
    }
  };

  const activeQuota = quotas.find(
    (q) => q.provider.toLowerCase() === activeTab.toLowerCase()
  );

  const dockPosition = config?.dockPosition || "right";
  const isHorizontal = isUsageOnly && (dockPosition === "top" || dockPosition === "bottom");

  const tabs = [
    { id: "codex", label: "Codex" },
    { id: "copilot", label: "Copilot" },
    { id: "claude", label: "Claude" }
  ];

  const renderHorizontalQuotas = () => {
    const activeQuotas = quotas.filter(q => {
      if (config?.enabledProviders && config.enabledProviders.length > 0) {
        return config.enabledProviders.includes(q.provider);
      }
      return true;
    });

    return (
      <div className="usage-horizontal-container" style={{ display: "flex", flex: 1, flexDirection: "row", gap: "24px", alignItems: "center", justifyContent: "space-around", width: "100%", height: "100%" }}>
        {activeQuotas.map((q) => {
          const isCopilot = q.provider.toLowerCase() === "copilot";
          const dailyWindow = q.windows.find(w => w.id === "5h" || w.id === "primary");
          const weeklyWindow = q.windows.find(w => w.id === "7d" || w.id === "secondary");

          if (!q.cliInstalled || !q.loggedIn) {
            return (
              <div key={q.provider} className="usage-horizontal-card offline" style={{ display: "flex", flexDirection: "column", gap: "2px", opacity: 0.5 }}>
                <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)" }}>{q.displayName}</span>
                <span style={{ fontSize: "0.6rem", color: "var(--text-muted)" }}>Offline</span>
              </div>
            );
          }

          return (
            <div key={q.provider} className="usage-horizontal-card" style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--accent-color)" }}>{q.displayName}</span>
                {q.accountLabel && (
                  <span style={{ fontSize: "0.58rem", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {q.accountLabel}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                {renderQuotaBar(t("Daily", { defaultValue: "Daily" }), dailyWindow, isCopilot)}
                {renderQuotaBar(t("Weekly", { defaultValue: "Weekly" }), weeklyWindow, isCopilot)}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderQuotaBar = (label: string, w?: QuotaWindow, isUnlimited = false) => {
    const percent = isUnlimited ? 100 : w ? getPercentage(w) : undefined;
    const statusClass = isUnlimited ? "ok" : getStatusClass(percent);
    const timeRemaining = (!isUnlimited && w) ? formatTimeRemaining(w.resetAt) : null;

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
        {timeRemaining && (
          <span style={{
            fontSize: "0.6rem",
            color: "var(--text-muted)",
            alignSelf: "flex-end",
            fontFamily: "var(--font-mono)",
            lineHeight: 1,
            marginTop: "1px"
          }}>
            {timeRemaining}
          </span>
        )}
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

  // ドラッグハンドラ: usage-only かつロック解除時のみ startDragging() を呼ぶ
  // 公式サンプルに合わせて左クリック時のみ発火させる
  const handleDragMouseDown = (e: React.MouseEvent) => {
    if (!isUsageOnly || isPositionLocked) return;
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, input, select, a")) return;
    getCurrentWindow().startDragging().catch((err) => {
      console.error("Failed to start dragging:", err);
    });
  };

  return (
    <div className={`right-panel ${isHorizontal ? "horizontal-dock-layout" : ""}`} style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      <div style={{ display: "flex", flex: 1, minHeight: 0, flexDirection: isHorizontal ? "row" : "row", height: "100%" }}>
        <div
          className="usage-viewport"
          style={{ flex: 1, minWidth: 0, padding: isHorizontal ? "6px 16px" : "16px 14px", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", cursor: (isUsageOnly && !isPositionLocked) ? "move" : undefined }}
          onMouseDown={handleDragMouseDown}
        >
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
          ) : isHorizontal ? (
            renderHorizontalQuotas()
          ) : (
            renderCardContent()
          )}
        </div>

        {/* Vertical or Horizontal tab/control strip */}
        <div
          className={isHorizontal ? "usage-tabs-horizontal-container" : "usage-tabs-vertical-container"}
          style={isHorizontal ? {
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            padding: "4px 12px",
            borderLeft: "1px solid rgba(255, 255, 255, 0.04)",
            background: "rgba(0, 0, 0, 0.18)",
            gap: "8px",
            height: "100%"
          } : {
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "6px",
            paddingTop: "32px",
            cursor: (isUsageOnly && !isPositionLocked) ? "move" : undefined
          }}
          onMouseDown={handleDragMouseDown}
        >
          {!isHorizontal && (
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
          )}

          {/* Actions: refresh + lock + docking buttons */}
          {config?.usageOnly && (
            <div style={{ display: "flex", flexDirection: isHorizontal ? "row" : "column", gap: "6px", alignItems: "center" }}>
              
              {/* Quick Dock Controller Grid */}
              <div className={`quick-dock-grid ${isHorizontal ? "horizontal" : "vertical"}`} style={{ display: "flex", gap: "2px" }}>
                <button
                  className={`quick-dock-btn ${dockPosition === "left" ? "active" : ""}`}
                  onClick={() => onDockChange?.("left")}
                  title={t("dock.left", { defaultValue: "Dock Left" })}
                  aria-label="Dock Left"
                >
                  ←
                </button>
                <button
                  className={`quick-dock-btn ${dockPosition === "top" ? "active" : ""}`}
                  onClick={() => onDockChange?.("top")}
                  title={t("dock.top", { defaultValue: "Dock Top" })}
                  aria-label="Dock Top"
                >
                  ↑
                </button>
                <button
                  className={`quick-dock-btn ${dockPosition === "bottom" ? "active" : ""}`}
                  onClick={() => onDockChange?.("bottom")}
                  title={t("dock.bottom", { defaultValue: "Dock Bottom" })}
                  aria-label="Dock Bottom"
                >
                  ↓
                </button>
                <button
                  className={`quick-dock-btn ${dockPosition === "right" ? "active" : ""}`}
                  onClick={() => onDockChange?.("right")}
                  title={t("dock.right", { defaultValue: "Dock Right" })}
                  aria-label="Dock Right"
                >
                  →
                </button>
                <button
                  className={`quick-dock-btn ${dockPosition === "floating" ? "active" : ""}`}
                  onClick={() => onDockChange?.("floating")}
                  title={t("dock.floating", { defaultValue: "Float Window" })}
                  aria-label="Float Window"
                  style={{ fontWeight: "bold" }}
                >
                  ✥
                </button>
              </div>

              {/* Refresh button */}
              <button
                className={`position-lock-btn ${isRefreshing ? "locked" : "unlocked"}`}
                onClick={loadQuotas}
                title={t("usage.refresh")}
                aria-label={t("usage.refresh")}
                disabled={isRefreshing}
                style={isHorizontal ? { marginTop: 0 } : undefined}
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ animation: isRefreshing ? "spin 0.8s linear infinite" : "none" }}
                >
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                </svg>
                <span style={{ fontSize: "0.55rem", letterSpacing: "0.3px", fontWeight: 700, lineHeight: 1, marginTop: "1px" }}>
                  {isRefreshing ? t("usage.refreshing").replace("...", "") : t("usage.refresh")}
                </span>
              </button>

              {/* Position lock button */}
              <button
                className={`position-lock-btn ${isPositionLocked ? "locked" : "unlocked"}`}
                onClick={onToggleLock}
                title={isPositionLocked ? t("lock.unlockTooltip") : t("lock.lockTooltip")}
                aria-label={isPositionLocked ? t("lock.unlockTooltip") : t("lock.lockTooltip")}
                style={isHorizontal ? { marginTop: 0 } : undefined}
              >
                {isPositionLocked ? (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                ) : (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                  </svg>
                )}
                <span style={{ fontSize: "0.55rem", letterSpacing: "0.3px", fontWeight: 700, lineHeight: 1, marginTop: "1px" }}>
                  {isPositionLocked ? t("lock.locked") : t("lock.unlocked")}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
