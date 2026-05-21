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
  const [repoPath, setRepoPath] = useState(config.repo_path);
  const [heightRatio, setHeightRatio] = useState(config.height_ratio);
  const [usageJsonPath, setUsageJsonPath] = useState(config.usage_json_path);
  const [codexToken, setCodexToken] = useState(config.codex_token || "");
  const [copilotPat, setCopilotPat] = useState(config.copilot_pat || "");
  const [claudeKey, setClaudeKey] = useState(config.claude_key || "");
  const [copilotOrg, setCopilotOrg] = useState(config.copilot_org || "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const updatedConfig: AppConfig = {
      ...config,
      repo_path: repoPath,
      height_ratio: heightRatio,
      usage_json_path: usageJsonPath,
      codex_token: codexToken || undefined,
      copilot_pat: copilotPat || undefined,
      claude_key: claudeKey || undefined,
      copilot_org: copilotOrg || undefined,
    };

    try {
      // Clean up extra client-side only properties just in case, although Rust ignores unknown keys
      // The backend save_app_config expects the struct representation
      const payload = {
        repoPath: updatedConfig.repo_path,
        heightRatio: updatedConfig.height_ratio,
        usageJsonPath: updatedConfig.usage_json_path,
        enabledProviders: updatedConfig.enabled_providers,
        codexToken: updatedConfig.codex_token || null,
        copilotPat: updatedConfig.copilot_pat || null,
        claudeKey: updatedConfig.claude_key || null,
      };

      await invoke("save_app_config", { config: payload });
      onSave(updatedConfig);
    } catch (err: any) {
      console.error("Failed to save configuration:", err);
      setError(err?.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-overlay">
      <div className="settings-modal glass-panel slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <div className="settings-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent-color)" }}>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            System Settings
          </div>
          <button className="settings-close-btn" onClick={onClose} aria-label="Close settings">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSave} className="settings-body">
          {error && (
            <div className="settings-error-banner">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: "8px" }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {error}
            </div>
          )}

          {/* General Settings */}
          <div className="settings-section">
            <div className="settings-section-title">General Settings</div>
            
            <div className="form-group">
              <label htmlFor="repo-path">Repository Path</label>
              <input
                id="repo-path"
                type="text"
                value={repoPath}
                onChange={(e) => setRepoPath(e.target.value)}
                placeholder="c:/path/to/repository"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="height-ratio">Bar Height Ratio</label>
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
          </div>

          {/* Codex Auth Settings */}
          <div className="settings-section">
            <div className="settings-section-title">Codex Settings</div>
            
            <div className="form-group">
              <label htmlFor="codex-token">Codex API Token</label>
              <input
                id="codex-token"
                type="password"
                value={codexToken}
                onChange={(e) => setCodexToken(e.target.value)}
                placeholder="Enter Codex Token"
              />
            </div>

            <div className="form-group">
              <label htmlFor="codex-json-path">Manual JSON Path</label>
              <input
                id="codex-json-path"
                type="text"
                value={usageJsonPath}
                onChange={(e) => setUsageJsonPath(e.target.value)}
                placeholder="./usage.json"
              />
            </div>
          </div>

          {/* Copilot Auth Settings */}
          <div className="settings-section">
            <div className="settings-section-title">GitHub Copilot Settings</div>
            
            <div className="form-group">
              <label htmlFor="copilot-pat">GitHub PAT (Personal Access Token)</label>
              <input
                id="copilot-pat"
                type="password"
                value={copilotPat}
                onChange={(e) => setCopilotPat(e.target.value)}
                placeholder="ghp_..."
              />
            </div>

            <div className="form-group">
              <label htmlFor="copilot-org">Organization</label>
              <input
                id="copilot-org"
                type="text"
                value={copilotOrg}
                onChange={(e) => setCopilotOrg(e.target.value)}
                placeholder="Optional org limit filter"
              />
            </div>
          </div>

          {/* Claude Auth Settings */}
          <div className="settings-section">
            <div className="settings-section-title">Claude Settings</div>
            
            <div className="form-group">
              <label htmlFor="claude-key">Anthropic API Key</label>
              <input
                id="claude-key"
                type="password"
                value={claudeKey}
                onChange={(e) => setClaudeKey(e.target.value)}
                placeholder="sk-ant-..."
              />
            </div>

            <div className="form-group">
              <label htmlFor="claude-json-path">Manual JSON Path</label>
              <input
                id="claude-json-path"
                type="text"
                value={usageJsonPath}
                onChange={(e) => setUsageJsonPath(e.target.value)}
                placeholder="./usage.json"
              />
            </div>
          </div>

          {/* Form Actions */}
          <div className="settings-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
