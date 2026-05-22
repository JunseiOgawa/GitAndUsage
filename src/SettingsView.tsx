import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { AppConfig } from "./types";

interface SettingsViewProps {
  config: AppConfig;
  onClose: () => void;
  onSave: (newConfig: AppConfig) => void;
}

const PRESET_COLORS = [
  "#6366f1", // Indigo
  "#10b981", // Emerald
  "#f43f5e", // Rose
  "#8b5cf6", // Violet
  "#f59e0b", // Amber
  "#06b6d4", // Cyan
  "#94a3b8", // Silver
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  config,
  onClose,
  onSave,
}) => {
  const { t, i18n } = useTranslation();
  const [repoPath, setRepoPath] = useState(config.repoPath);
  const [heightRatio, setHeightRatio] = useState(config.heightRatio);
  const [usageOnly, setUsageOnly] = useState(config.usageOnly || false);
  const [accentColor, setAccentColor] = useState(config.accentColor || "#6366f1");
  const [windowOpacity, setWindowOpacity] = useState(config.windowOpacity || 90);
  const usageJsonPath = config.usageJsonPath;
  
  const [codexToken, setCodexToken] = useState(config.codexToken || "");
  const [copilotPat, setCopilotPat] = useState(config.copilotPat || "");
  const [claudeKey, setClaudeKey] = useState(config.claudeKey || "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem("app_lang", lang);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const updatedConfig: AppConfig = {
      ...config,
      repoPath: repoPath,
      heightRatio: heightRatio,
      usageJsonPath: usageJsonPath,
      usageOnly: usageOnly,
      accentColor: accentColor,
      windowOpacity: windowOpacity,
      codexToken: codexToken || undefined,
      copilotPat: copilotPat || undefined,
      claudeKey: claudeKey || undefined,
    };

    try {
      await invoke("save_app_config", { config: updatedConfig });
      onSave(updatedConfig);
    } catch (err: any) {
      console.error("Failed to save configuration:", err);
      setError(err?.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-overlay horizontal-layout" onClick={onClose}>
      <div className="settings-modal horizontal-grid slide-up" onClick={(e) => e.stopPropagation()}>
        {/* Compact Title Row */}
        <div className="settings-header-compact">
          <div className="settings-title-compact">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color)" strokeWidth="2.5">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span>{t("settings.title")}</span>
          </div>
          
          {error && <span className="error-badge-compact">{error}</span>}
          
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {/* Language Selector */}
            <select
              value={i18n.language}
              onChange={(e) => handleLanguageChange(e.target.value)}
              style={{
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "4px",
                color: "var(--text-secondary)",
                fontSize: "0.68rem",
                padding: "2px 6px",
                height: "20px",
                cursor: "pointer",
                outline: "none",
                fontFamily: "var(--font-sans)",
                fontWeight: 600,
                transition: "var(--transition-smooth)"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "rgba(99, 102, 241, 0.4)";
                e.currentTarget.style.color = "var(--text-primary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.1)";
                e.currentTarget.style.color = "var(--text-secondary)";
              }}
            >
              <option value="ja">日本語</option>
              <option value="en">English</option>
            </select>

            <button 
              type="button"
              className="settings-exit-app-btn" 
              onClick={async () => {
                try {
                  await invoke("exit_app");
                } catch (err) {
                  console.error("Failed to exit app:", err);
                }
              }}
              title={t("settings.exitApp")}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: "3px" }}>
                <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                <line x1="12" y1="2" x2="12" y2="12" />
              </svg>
              {t("settings.exitApp")}
            </button>
            
            <button className="settings-close-btn" onClick={onClose} type="button">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* 4-Column Grid Form */}
        <form onSubmit={handleSave} className="grid-form-body">
          {/* Column 1: General Settings */}
          <div className="grid-section">
            <div className="grid-section-title">{t("settings.general.title")}</div>
            
            <div className="form-group-compact">
              <label htmlFor="repo-path">{t("settings.general.repoPath")}</label>
              <input
                id="repo-path"
                type="text"
                value={repoPath}
                onChange={(e) => setRepoPath(e.target.value)}
                placeholder={t("settings.general.repoPathPlaceholder")}
                required
              />
            </div>

            <div className="form-group-compact">
              <label htmlFor="height-ratio">{t("settings.general.heightRatio")}</label>
              <select
                id="height-ratio"
                value={heightRatio}
                onChange={(e) => setHeightRatio(parseFloat(e.target.value))}
              >
                <option value={0.10}>10%</option>
                <option value={0.15}>15%</option>
                <option value={0.20}>20%</option>
                <option value={0.25}>25%</option>
              </select>
            </div>

            <div className="form-group-compact" style={{ display: "flex", alignItems: "center", gap: "6px", margin: "2px 0 0 0" }}>
              <input
                id="usage-only"
                type="checkbox"
                checked={usageOnly}
                onChange={(e) => setUsageOnly(e.target.checked)}
                style={{ width: "auto", height: "auto", cursor: "pointer" }}
              />
              <label htmlFor="usage-only" style={{ cursor: "pointer", fontSize: "0.72rem", userSelect: "none" }}>
                {t("settings.general.usageOnly")}
              </label>
            </div>
          </div>

          {/* Column 2: Design & Theme */}
          <div className="grid-section">
            <div className="grid-section-title">{t("settings.design.title")}</div>
            
            <div className="form-group-compact">
              <label htmlFor="window-opacity">{t("settings.design.opacity")}: {windowOpacity}%</label>
              <input
                id="window-opacity"
                type="range"
                min="20"
                max="100"
                value={windowOpacity}
                onChange={(e) => setWindowOpacity(parseInt(e.target.value))}
                style={{
                  width: "100%",
                  height: "4px",
                  background: "rgba(255, 255, 255, 0.1)",
                  borderRadius: "2px",
                  outline: "none",
                  cursor: "pointer",
                  margin: "4px 0"
                }}
              />
            </div>

            <div className="form-group-compact">
              <label>{t("settings.design.accentColor")}</label>
              <div style={{ display: "flex", gap: "5px", alignItems: "center", marginTop: "3px" }}>
                {PRESET_COLORS.map(color => (
                  <button
                    key={color}
                    type="button"
                    style={{
                      width: "12px",
                      height: "12px",
                      borderRadius: "50%",
                      backgroundColor: color,
                      border: accentColor === color ? "2px solid #ffffff" : "1px solid rgba(255,255,255,0.2)",
                      cursor: "pointer",
                      padding: 0,
                      boxShadow: accentColor === color ? `0 0 6px ${color}` : "none",
                      transition: "all 0.15s ease"
                    }}
                    onClick={() => setAccentColor(color)}
                  />
                ))}
                <div style={{ position: "relative", width: "12px", height: "12px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <input 
                    type="color" 
                    value={accentColor} 
                    onChange={(e) => setAccentColor(e.target.value)} 
                    style={{
                      position: "absolute",
                      opacity: 0,
                      width: "100%",
                      height: "100%",
                      cursor: "pointer"
                    }}
                  />
                  <div style={{
                    width: "12px",
                    height: "12px",
                    borderRadius: "50%",
                    background: "conic-gradient(red, yellow, lime, aqua, blue, magenta, red)",
                    border: !PRESET_COLORS.includes(accentColor) ? "2px solid #ffffff" : "1px solid rgba(255,255,255,0.2)",
                    boxShadow: !PRESET_COLORS.includes(accentColor) ? `0 0 6px ${accentColor}` : "none",
                  }} />
                </div>
              </div>
            </div>
          </div>

          {/* Column 3: Codex & Copilot Tokens */}
          <div className="grid-section">
            <div className="grid-section-title">{t("settings.codex.title")} / {t("settings.copilot.title")}</div>
            
            <div className="form-group-compact">
              <label htmlFor="codex-token">{t("settings.codex.token")}</label>
              <input
                id="codex-token"
                type="password"
                value={codexToken}
                onChange={(e) => setCodexToken(e.target.value)}
                placeholder={t("settings.codex.tokenPlaceholder")}
              />
            </div>

            <div className="form-group-compact" style={{ marginTop: "4px" }}>
              <label htmlFor="copilot-pat">{t("settings.copilot.pat")}</label>
              <input
                id="copilot-pat"
                type="password"
                value={copilotPat}
                onChange={(e) => setCopilotPat(e.target.value)}
                placeholder={t("settings.copilot.patPlaceholder")}
              />
            </div>
          </div>

          {/* Column 4: Claude & Action Buttons */}
          <div className="grid-section">
            <div className="grid-section-title">{t("settings.claude.title")}</div>
            
            <div className="form-group-compact">
              <label htmlFor="claude-key">{t("settings.claude.key")}</label>
              <input
                id="claude-key"
                type="password"
                value={claudeKey}
                onChange={(e) => setClaudeKey(e.target.value)}
                placeholder={t("settings.claude.keyPlaceholder")}
              />
            </div>

            <div className="settings-inline-actions" style={{ marginTop: "8px" }}>
              <button type="button" className="btn-secondary-compact" onClick={onClose}>
                {t("settings.cancel")}
              </button>
              <button type="submit" className="btn-primary-compact" disabled={saving}>
                {saving ? t("settings.saving") : t("settings.save")}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
