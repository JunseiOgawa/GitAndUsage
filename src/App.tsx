import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { AppConfig, GitStatus, UsageSnapshot } from "./types";
import { GitGraphPanel } from "./GitGraphPanel";
import { UsagePanel } from "./UsagePanel";
import { SettingsView } from "./SettingsView";

function App() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [gitLoading, setGitLoading] = useState(true);
  const [gitError, setGitError] = useState<string | null>(null);

  const [usageSnapshots, setUsageSnapshots] = useState<UsageSnapshot[]>([]);
  const [usageLoading, setUsageLoading] = useState(true);
  const [usageError, setUsageError] = useState<string | null>(null);

  // Settings modal visibility
  const [showSettings, setShowSettings] = useState(false);

  // Load application configuration
  const loadConfig = useCallback(async () => {
    try {
      const appConfig = await invoke<AppConfig>("get_app_config");
      setConfig(appConfig);
    } catch (err: any) {
      console.error("Failed to load app config:", err);
      setConfigError(err?.message || String(err));
    } finally {
      setConfigLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Fetch functions exposed to allow manual immediate refresh after saving settings
  const fetchGitStatus = useCallback(async (repoPath: string) => {
    try {
      const status = await invoke<GitStatus>("get_git_status", {
        repoPath,
      });
      setGitStatus(status);
      setGitError(null);
    } catch (err: any) {
      console.error("Failed to get git status:", err);
      setGitError(err?.message || String(err));
    } finally {
      setGitLoading(false);
    }
  }, []);

  const fetchUsageSnapshots = useCallback(async (usageJsonPath: string, enabledProviders: string[]) => {
    try {
      const snapshots = await invoke<UsageSnapshot[]>("get_usage_snapshot", {
        jsonPath: usageJsonPath,
      });
      
      const filtered = (enabledProviders && enabledProviders.length > 0)
        ? snapshots.filter(s => enabledProviders.includes(s.provider))
        : snapshots;

      setUsageSnapshots(filtered);
      setUsageError(null);
    } catch (err: any) {
      console.error("Failed to get usage snapshot:", err);
      setUsageError(err?.message || String(err));
    } finally {
      setUsageLoading(false);
    }
  }, []);

  // Sync polling when config is loaded
  useEffect(() => {
    if (!config) return;

    // Initial load
    fetchGitStatus(config.repoPath);
    fetchUsageSnapshots(config.usageJsonPath, config.enabledProviders);

    // Setup polling
    const gitInterval = setInterval(() => {
      fetchGitStatus(config.repoPath);
    }, 10000);

    const usageInterval = setInterval(() => {
      fetchUsageSnapshots(config.usageJsonPath, config.enabledProviders);
    }, 30000);

    return () => {
      clearInterval(gitInterval);
      clearInterval(usageInterval);
    };
  }, [config, fetchGitStatus, fetchUsageSnapshots]);

  // Handle successful save in SettingsView
  const handleSaveSettings = (newConfig: AppConfig) => {
    setConfig(newConfig);
    setShowSettings(false);
    
    // Immediately reload git and usage snapshots
    setGitLoading(true);
    setUsageLoading(true);
    fetchGitStatus(newConfig.repoPath);
    fetchUsageSnapshots(newConfig.usageJsonPath, newConfig.enabledProviders);
  };

  // Dynamic window resizing when settings open/close
  useEffect(() => {
    if (config) {
      invoke("set_window_size_mode", { settingsOpen: showSettings }).catch((err) => {
        console.error("Failed to invoke set_window_size_mode:", err);
      });
    }
  }, [showSettings, config]);

  // Open directory selection dialogue, save to configuration, and reload UI
  const handleOpenFolder = async () => {
    try {
      const selectedFolder = await invoke<string>("open_folder_dialog");
      if (selectedFolder && config) {
        const updatedConfig: AppConfig = {
          ...config,
          repoPath: selectedFolder,
        };

        await invoke("save_app_config", { config: updatedConfig });
        
        setConfig(updatedConfig);
        setGitLoading(true);
        setUsageLoading(true);
        fetchGitStatus(updatedConfig.repoPath);
        fetchUsageSnapshots(updatedConfig.usageJsonPath, updatedConfig.enabledProviders);
      }
    } catch (err: any) {
      console.error("Folder dialogue error:", err);
      // Suppress alert on deliberate user cancellation
      if (err !== "No folder selected" && !String(err).includes("No folder selected")) {
        alert("Failed to configure repository path: " + err);
      }
    }
  };

  // Premium loading screen for initial app configuration load
  if (configLoading) {
    return (
      <div className="loading-overlay">
        <div className="spinner"></div>
        <p style={{ fontFamily: "var(--font-sans)", fontWeight: 500, letterSpacing: "1px", color: "var(--text-secondary)" }}>
          {t("app.initializing")}
        </p>
      </div>
    );
  }

  // Display error if configuration fails to load entirely
  if (configError) {
    return (
      <div className="loading-overlay" style={{ textAlign: "center", padding: "40px" }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger)" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <h2 style={{ marginTop: "16px", color: "var(--text-primary)" }}>{t("app.configError")}</h2>
        <p style={{ color: "var(--text-secondary)", maxWidth: "450px", marginTop: "8px", fontSize: "0.95rem" }}>
          {t("app.configErrorDesc")}
        </p>
        <p style={{ color: "var(--color-danger)", fontFamily: "var(--font-mono)", fontSize: "0.85rem", marginTop: "16px" }}>
          {t("app.details")} {configError}
        </p>
      </div>
    );
  }

  const isUsageOnly = config?.usageOnly || false;

  return (
    <main className={`app-container borderless-canvas ${isUsageOnly ? "usage-only-mode" : ""}`}>
      {/* Floating Gear Settings Toggle */}
      <button 
        className="settings-toggle-floating-btn"
        onClick={() => setShowSettings(true)}
        title={t("settings.title")}
        aria-label={t("settings.title")}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {!isUsageOnly && (
        <GitGraphPanel 
          status={gitStatus} 
          loading={gitLoading} 
          error={gitError} 
          onOpenFolder={handleOpenFolder}
          repoPath={config?.repoPath || ""}
          onRefresh={() => config && fetchGitStatus(config.repoPath)}
        />
      )}
      
      <UsagePanel 
        snapshots={usageSnapshots} 
        loading={usageLoading} 
        error={usageError} 
        config={config}
      />


      {showSettings && config && (
        <SettingsView 
          config={config} 
          onClose={() => setShowSettings(false)}
          onSave={handleSaveSettings}
        />
      )}
    </main>
  );
}

export default App;
