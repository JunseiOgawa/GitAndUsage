import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { AppConfig } from "./types";

interface SettingsViewProps {
  config: AppConfig;
  onClose: () => void;
  onSave: (newConfig: AppConfig) => void;
  /** Called while the user drags the slider so the parent can update CSS in real-time */
  onPreviewOpacity?: (opacity: number) => void;
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
  onPreviewOpacity,
}) => {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<"general" | "design" | "about">("general");

  const [repoPath, setRepoPath] = useState(config.repoPath);
  const [heightRatio, setHeightRatio] = useState(config.heightRatio);
  const [usageOnly, setUsageOnly] = useState(config.usageOnly || false);
  const [accentColor, setAccentColor] = useState(config.accentColor || "#6366f1");
  const [windowOpacity, setWindowOpacity] = useState(config.windowOpacity || 90);
  // Keep the original opacity so we can restore it on cancel
  const originalOpacity = config.windowOpacity ?? 90;
  const usageJsonPath = config.usageJsonPath;
  
  // Retain hidden credential state so we don't clear them in config on save
  const [codexToken] = useState(config.codexToken || "");
  const [copilotPat] = useState(config.copilotPat || "");
  const [claudeKey] = useState(config.claudeKey || "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem("app_lang", lang);
  };

  const handleOpacityChange = (value: number) => {
    setWindowOpacity(value);
    onPreviewOpacity?.(value);
  };

  const handleCancel = () => {
    // Restore the original opacity preview before closing without saving
    onPreviewOpacity?.(originalOpacity);
    onClose();
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
    <div className="settings-fullscreen-overlay tab-slide-fade-in" onClick={onClose}>
      <div className="settings-window-panel" onClick={(e) => e.stopPropagation()}>
        
        {/* Sidebar Left */}
        <aside className="settings-sidebar">
          <div className="settings-sidebar-header">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color)" strokeWidth="2.5" style={{ filter: "drop-shadow(0 0 6px var(--accent-glow))" }}>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span className="settings-sidebar-brand">{t("settings.title")}</span>
          </div>

          <nav className="settings-sidebar-nav">
            <button
              type="button"
              className={`settings-nav-btn ${activeTab === "general" ? "active" : ""}`}
              onClick={() => setActiveTab("general")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 3v18M15 3v18" />
              </svg>
              <span>{t("settings.general.title")}</span>
            </button>
            
            <button
              type="button"
              className={`settings-nav-btn ${activeTab === "design" ? "active" : ""}`}
              onClick={() => setActiveTab("design")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                <path d="M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
              </svg>
              <span>{t("settings.design.title")}</span>
            </button>

            <button
              type="button"
              className={`settings-nav-btn ${activeTab === "about" ? "active" : ""}`}
              onClick={() => setActiveTab("about")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <span>{t("settings.about.title")}</span>
            </button>
          </nav>

          <div className="settings-sidebar-footer">
            <div className="settings-sidebar-lang">
              <label>{t("settings.general.language")}</label>
              <select
                value={i18n.language}
                onChange={(e) => handleLanguageChange(e.target.value)}
              >
                <option value="ja">日本語</option>
                <option value="en">English</option>
              </select>
            </div>

            <button 
              type="button"
              className="settings-exit-btn-spacious" 
              onClick={async () => {
                try {
                  await invoke("exit_app");
                } catch (err) {
                  console.error("Failed to exit app:", err);
                }
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                <line x1="12" y1="2" x2="12" y2="12" />
              </svg>
              <span>{t("settings.exitApp")}</span>
            </button>
          </div>
        </aside>

        {/* Main Content Area Right */}
        <main className="settings-main-content">
          <header className="settings-content-header">
            <h2>
              {activeTab === "general"
                ? t("settings.general.title")
                : activeTab === "design"
                ? t("settings.design.title")
                : t("settings.about.title")}
            </h2>
            {error && <span className="settings-error-badge">{error}</span>}
            <button className="settings-header-close-btn" onClick={onClose} type="button" title={t("settings.cancel")}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </header>

          <form onSubmit={handleSave} className="settings-form">
            <div className="settings-scroll-body">
              {activeTab === "general" && (
                <div className="settings-tab-pane tab-slide-fade-in">
                  <div className="settings-field-group">
                    <label htmlFor="repo-path">{t("settings.general.repoPath")}</label>
                    <p className="field-description">Gitワークスペースとして監視するリポジトリのパスを指定します。</p>
                    <input
                      id="repo-path"
                      type="text"
                      value={repoPath}
                      onChange={(e) => setRepoPath(e.target.value)}
                      placeholder={t("settings.general.repoPathPlaceholder")}
                      required
                    />
                  </div>

                  <div className="settings-field-group">
                    <label htmlFor="height-ratio">{t("settings.general.heightRatio")}</label>
                    <p className="field-description">画面全体に対するウィンドウ表示領域のデフォルト割合を設定します。</p>
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

                  <div className="settings-checkbox-card" onClick={() => setUsageOnly(!usageOnly)}>
                    <input
                      id="usage-only"
                      type="checkbox"
                      checked={usageOnly}
                      onChange={(e) => setUsageOnly(e.target.checked)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="checkbox-text-wrapper">
                      <label htmlFor="usage-only" onClick={(e) => e.stopPropagation()}>
                        {t("settings.general.usageOnly")}
                      </label>
                      <p className="field-description" style={{ margin: 0, marginTop: "2px" }}>
                        Git履歴などを非表示にして、CLI使用状況・制限メータのみの省スペース表示モードにします。
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "design" && (
                <div className="settings-tab-pane tab-slide-fade-in">
                  <div className="settings-field-group">
                    <label htmlFor="window-opacity">{t("settings.design.opacity")}: {windowOpacity}%</label>
                    <p className="field-description">アプリケーションウィンドウの背景透過度を調節できます。</p>
                    <div className="slider-wrapper">
                      <input
                        id="window-opacity"
                        type="range"
                        min="20"
                        max="100"
                        value={windowOpacity}
                        onChange={(e) => handleOpacityChange(parseInt(e.target.value))}
                        className="spacious-range-slider"
                      />
                    </div>
                  </div>

                  <div className="settings-field-group">
                    <label>{t("settings.design.accentColor")}</label>
                    <p className="field-description">UI全体のアクセントカラー（ネオンハイライト）をお好みの色に変更できます。</p>
                    
                    <div className="accent-picker-container">
                      <div className="color-presets-grid">
                        {PRESET_COLORS.map(color => (
                          <button
                            key={color}
                            type="button"
                            className={`preset-color-dot ${accentColor === color ? "active" : ""}`}
                            style={{
                              backgroundColor: color,
                              boxShadow: accentColor === color ? `0 0 10px ${color}` : "none",
                            }}
                            onClick={() => setAccentColor(color)}
                            title={color}
                          />
                        ))}
                      </div>

                      <div className="custom-color-picker-wrapper">
                        <span className="picker-label">カスタム色:</span>
                        <div className="custom-color-indicator-circle">
                          <input 
                            type="color" 
                            value={accentColor} 
                            onChange={(e) => setAccentColor(e.target.value)} 
                          />
                          <div 
                            className={`picker-preview-dot ${!PRESET_COLORS.includes(accentColor) ? "active" : ""}`}
                            style={{
                              background: !PRESET_COLORS.includes(accentColor) ? accentColor : "conic-gradient(red, yellow, lime, aqua, blue, magenta, red)",
                              boxShadow: !PRESET_COLORS.includes(accentColor) ? `0 0 10px ${accentColor}` : "none"
                            }} 
                          />
                        </div>
                        <span className="hex-value-display">{accentColor}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "about" && (
                <div className="settings-tab-pane tab-slide-fade-in">
                  <div className="about-app-card">
                    <div className="about-app-branding">
                      <div className="about-app-logo">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color)" strokeWidth="2.5" style={{ filter: "drop-shadow(0 0 6px var(--accent-glow))" }}>
                          <circle cx="12" cy="12" r="3" />
                          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                        </svg>
                      </div>
                      <div className="about-app-name-ver">
                        <h3>{t("settings.about.appName")}</h3>
                        <span className="about-app-version" style={{ background: "var(--accent-glow)" }}>
                          {t("settings.about.version")}
                        </span>
                      </div>
                    </div>
                    
                    <p className="about-app-desc">
                      {t("settings.about.desc")}
                    </p>
                    
                    <div className="about-app-divider" />
                    
                    <div className="about-app-tech-grid">
                      <div className="tech-item">
                        <span className="tech-label">Framework</span>
                        <span className="tech-val">Tauri v2 + React</span>
                      </div>
                      <div className="tech-item">
                        <span className="tech-label">Language</span>
                        <span className="tech-val">TypeScript / Rust</span>
                      </div>
                      <div className="tech-item">
                        <span className="tech-label">Styling</span>
                        <span className="tech-val">Vanilla CSS</span>
                      </div>
                      <div className="tech-item">
                        <span className="tech-label">State Management</span>
                        <span className="tech-val">Rust commands</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <footer className="settings-form-footer">
              <button type="button" className="settings-btn-secondary" onClick={handleCancel}>
                {t("settings.cancel")}
              </button>
              <button type="submit" className="settings-btn-primary" disabled={saving}>
                {saving ? t("settings.saving") : t("settings.save")}
              </button>
            </footer>
          </form>
        </main>

      </div>
    </div>
  );
};
