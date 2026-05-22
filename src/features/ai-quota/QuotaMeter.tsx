import React from "react";
import { useTranslation } from "react-i18next";
import { QuotaWindow } from "../../types";

interface QuotaMeterProps {
  window: QuotaWindow;
}

export const QuotaMeter: React.FC<QuotaMeterProps> = ({ window }) => {
  const { t } = useTranslation();

  const getPercentage = () => {
    if (window.remainingPercent !== undefined) {
      return window.remainingPercent;
    }
    if (window.remainingValue !== undefined && window.totalValue !== undefined && window.totalValue > 0) {
      return Math.round((window.remainingValue / window.totalValue) * 100);
    }
    return undefined;
  };

  const percent = getPercentage();

  const getStatusClass = (val?: number) => {
    if (val === undefined) return "unknown";
    if (val >= 50) return "ok";
    if (val >= 20) return "warning";
    return "danger";
  };

  const statusClass = getStatusClass(percent);

  const formatValue = () => {
    if (percent === undefined) {
      return "unavailable";
    }
    if (window.unit === "percent") {
      return `${percent}% left`;
    }
    if (window.unit === "requests") {
      return window.remainingValue !== undefined
        ? `${window.remainingValue} / ${window.totalValue ?? "N/A"} requests`
        : "unavailable";
    }
    if (window.unit === "credits") {
      return window.remainingValue !== undefined ? `${window.remainingValue} credits` : "unavailable";
    }
    return "unavailable";
  };

  /** Convert ISO reset time to a human-readable "Xd Xh Xm" remaining string */
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

      if (totalMinutes < 1) {
        return t("quota.resetInLessThanMinute");
      }
      if (days > 0) {
        const timeStr = t("quota.resetInDays", { d: days, h: hours, m: minutes });
        return t("quota.resetIn", { time: timeStr });
      }
      if (hours > 0) {
        const timeStr = t("quota.resetInHours", { h: hours, m: minutes });
        return t("quota.resetIn", { time: timeStr });
      }
      const timeStr = t("quota.resetInMinutes", { m: minutes });
      return t("quota.resetIn", { time: timeStr });
    } catch {
      return null;
    }
  };

  const timeRemaining = formatTimeRemaining(window.resetAt);

  return (
    <div className="progress-container" style={{ margin: "14px 0", gap: "5px" }}>
      <div className="progress-values" style={{ fontSize: "0.78rem" }}>
        <span className={`progress-percentage ${statusClass}`} style={{ fontWeight: 600 }}>
          {window.label}
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
          fontSize: "0.62rem",
          color: "var(--text-muted)",
          alignSelf: "flex-end",
          fontFamily: "var(--font-mono)",
          marginTop: "1px"
        }}>
          {timeRemaining}
        </span>
      )}
    </div>
  );
};
