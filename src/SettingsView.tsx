import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AppConfig } from "./types";

interface SettingsViewProps {
  config: AppConfig;
  onClose: () => void;
  onSave: (newConfig: AppConfig) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  config,
  onClose,
  onSave,
}) => {
  const [repoPath, setRepoPath] = useState(config.repoPath);
  const [heightRatio, setHeightRatio] = useState(config.heightRatio);
  const usageJsonPath = config.usageJsonPath;
  
  // Subscription Tracking Fields
  const [codexPlan, setCodexPlan] = useState(config.codexPlan || "Plus");
  const [codexAccount, setCodexAccount] = useState(config.codexAccount || "");
  const [codexToken, setCodexToken] = useState(config.codexToken || "");

  const [copilotPlan, setCopilotPlan] = useState(config.copilotPlan || "Individual");
  const [copilotAccount, setCopilotAccount] = useState(config.copilotAccount || "");
  const [copilotPat, setCopilotPat] = useState(config.copilotPat || "");

  const [claudePlan, setClaudePlan] = useState(config.claudePlan || "Pro");
  const [claudeAccount, setClaudeAccount] = useState(config.claudeAccount || "");
  const [claudeKey, setClaudeKey] = useState(config.claudeKey || "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const updatedConfig: AppConfig = {
      ...config,
      repoPath: repoPath,
      heightRatio: heightRatio,
      usageJsonPath: usageJsonPath,
      codexToken: codexToken || undefined,
      copilotPat: copilotPat || undefined,
      claudeKey: claudeKey || undefined,
      codexPlan: codexPlan,
      codexAccount: codexAccount,
      copilotPlan: copilotPlan,
      copilotAccount: copilotAccount,
      claudePlan: claudePlan,
      claudeAccount: claudeAccount,
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
            <span>Telemetry subscription profiles</span>
          </div>
          
          {error && <span className="error-badge-compact">{error}</span>}
          
          <button className="settings-close-btn" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* 4-Column Grid Form */}
        <form onSubmit={handleSave} className="grid-form-body">
          {/* Column 1: General Settings */}
          <div className="grid-section">
            <div className="grid-section-title">General</div>
            
            <div className="form-group-compact">
              <label htmlFor="repo-path">Repo Path</label>
              <input
                id="repo-path"
                type="text"
                value={repoPath}
                onChange={(e) => setRepoPath(e.target.value)}
                placeholder="Path to repository"
                required
              />
            </div>

            <div className="form-group-compact">
              <label htmlFor="height-ratio">Height Ratio</label>
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

            <div className="settings-inline-actions">
              <button type="button" className="btn-secondary-compact" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn-primary-compact" disabled={saving}>
                {saving ? "..." : "Save"}
              </button>
            </div>
          </div>

          {/* Column 2: Codex Settings */}
          <div className="grid-section">
            <div className="grid-section-title">Codex (ChatGPT)</div>
            
            <div className="form-group-compact">
              <label htmlFor="codex-plan">Subscription Plan</label>
              <select
                id="codex-plan"
                value={codexPlan}
                onChange={(e) => setCodexPlan(e.target.value)}
              >
                <option value="Plus">Plus</option>
                <option value="Pro">Pro</option>
                <option value="Team">Team</option>
                <option value="Enterprise">Enterprise</option>
              </select>
            </div>

            <div className="form-group-compact">
              <label htmlFor="codex-account">Account ID / Email</label>
              <input
                id="codex-account"
                type="text"
                value={codexAccount}
                onChange={(e) => setCodexAccount(e.target.value)}
                placeholder="email@domain.com"
              />
            </div>

            <div className="form-group-compact">
              <label htmlFor="codex-token">Session Token</label>
              <input
                id="codex-token"
                type="password"
                value={codexToken}
                onChange={(e) => setCodexToken(e.target.value)}
                placeholder="Session credential"
              />
            </div>
          </div>

          {/* Column 3: Copilot Settings */}
          <div className="grid-section">
            <div className="grid-section-title">GitHub Copilot</div>
            
            <div className="form-group-compact">
              <label htmlFor="copilot-plan">Subscription Plan</label>
              <select
                id="copilot-plan"
                value={copilotPlan}
                onChange={(e) => setCopilotPlan(e.target.value)}
              >
                <option value="Individual">Individual</option>
                <option value="Business">Business</option>
                <option value="Enterprise">Enterprise</option>
              </select>
            </div>

            <div className="form-group-compact">
              <label htmlFor="copilot-account">Org / Enterprise</label>
              <input
                id="copilot-account"
                type="text"
                value={copilotAccount}
                onChange={(e) => setCopilotAccount(e.target.value)}
                placeholder="Organization name"
              />
            </div>

            <div className="form-group-compact">
              <label htmlFor="copilot-pat">GitHub PAT</label>
              <input
                id="copilot-pat"
                type="password"
                value={copilotPat}
                onChange={(e) => setCopilotPat(e.target.value)}
                placeholder="ghp_..."
              />
            </div>
          </div>

          {/* Column 4: Claude Settings */}
          <div className="grid-section">
            <div className="grid-section-title">Claude</div>
            
            <div className="form-group-compact">
              <label htmlFor="claude-plan">Subscription Plan</label>
              <select
                id="claude-plan"
                value={claudePlan}
                onChange={(e) => setClaudePlan(e.target.value)}
              >
                <option value="Pro">Pro</option>
                <option value="Team">Team</option>
                <option value="Enterprise">Enterprise</option>
              </select>
            </div>

            <div className="form-group-compact">
              <label htmlFor="claude-account">Account / Org ID</label>
              <input
                id="claude-account"
                type="text"
                value={claudeAccount}
                onChange={(e) => setClaudeAccount(e.target.value)}
                placeholder="Account identity"
              />
            </div>

            <div className="form-group-compact">
              <label htmlFor="claude-key">Anthropic Key / Log</label>
              <input
                id="claude-key"
                type="password"
                value={claudeKey}
                onChange={(e) => setClaudeKey(e.target.value)}
                placeholder="sk-ant-... or log path"
              />
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
