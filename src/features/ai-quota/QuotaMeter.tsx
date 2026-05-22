import React from "react";
import { QuotaWindow } from "../../types";

interface QuotaMeterProps {
  window: QuotaWindow;
}

export const QuotaMeter: React.FC<QuotaMeterProps> = ({ window }) => {
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

  const formatResetTime = (isoString?: string) => {
    if (!isoString) return "";
    try {
      const date = new Date(isoString);
      return `Resets: ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    } catch {
      return "";
    }
  };

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
      {window.resetAt && (
        <span style={{ fontSize: "0.62rem", color: "var(--text-muted)", alignSelf: "flex-end", fontFamily: "var(--font-mono)" }}>
          {formatResetTime(window.resetAt)}
        </span>
      )}
    </div>
  );
};
