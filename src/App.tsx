import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, currentMonitor, primaryMonitor } from "@tauri-apps/api/window";
import { useTranslation } from "react-i18next";
import { AppConfig, GitStatus, UsageSnapshot } from "./types";
import { GitGraphPanel } from "./GitGraphPanel";
import { UsagePanel } from "./UsagePanel";
import { SettingsView } from "./SettingsView";

function App() {
  const { t, i18n } = useTranslation();
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
  const [showGearMenu, setShowGearMenu] = useState(false);

  // Window position lock — session only (resets on app restart)
  const [isPositionLocked, setIsPositionLocked] = useState(false);
  const handleToggleLock = () => setIsPositionLocked(prev => !prev);

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

  // Dynamic CSS variables injector for Accent Color and Transparency
  useEffect(() => {
    if (!config) return;
    const root = document.documentElement;
    const opacity = (config.windowOpacity ?? 90) / 100;
    root.style.setProperty("--window-opacity", opacity.toString());
    
    const accentColor = config.accentColor ?? "#6366f1";
    root.style.setProperty("--accent-color", accentColor);
    
    // Handle accent glow (converting hex to rgba with alpha)
    let glowColor = "rgba(99, 102, 241, 0.25)";
    if (accentColor.startsWith("#")) {
      const hex = accentColor.replace("#", "");
      if (hex.length === 6) {
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        glowColor = `rgba(${r}, ${g}, ${b}, 0.25)`;
      } else if (hex.length === 3) {
        const r = parseInt(hex.substring(0, 1).repeat(2), 16);
        const g = parseInt(hex.substring(1, 2).repeat(2), 16);
        const b = parseInt(hex.substring(2, 3).repeat(2), 16);
        glowColor = `rgba(${r}, ${g}, ${b}, 0.25)`;
      }
    }
    root.style.setProperty("--accent-glow", glowColor);
  }, [config]);

  // Handle outside clicks to close the floating gear menu
  useEffect(() => {
    if (!showGearMenu) return;

    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".settings-toggle-floating-btn") && !target.closest(".gear-dropdown-menu")) {
        setShowGearMenu(false);
      }
    };

    document.addEventListener("click", handleOutsideClick);
    return () => {
      document.removeEventListener("click", handleOutsideClick);
    };
  }, [showGearMenu]);

  const handleToggleUsageOnly = async () => {
    if (!config) return;
    const nextUsageOnly = !config.usageOnly;
    const updatedConfig: AppConfig = { ...config, usageOnly: nextUsageOnly };
    // Optimistically update UI immediately so the toggle feels instant
    setConfig(updatedConfig);
    setShowGearMenu(false);
    try {
      await invoke("save_app_config", { config: updatedConfig });
      await invoke("set_window_size_mode", { settingsOpen: false, usageOnly: nextUsageOnly });
    } catch (err) {
      console.error("Failed to toggle usage only mode:", err);
      // Revert on failure
      setConfig(config);
    }
  };

  const handleCoinDockChange = async (dock: "left" | "right" | "top" | "bottom" | "floating") => {
    if (!config) return;
    // Coin (usage-only) mode: update dockPosition only
    const updatedConfig: AppConfig = { ...config, dockPosition: dock };
    setConfig(updatedConfig);
    try {
      await invoke("save_app_config", { config: updatedConfig });
      await invoke("set_window_size_mode", { settingsOpen: false, usageOnly: updatedConfig.usageOnly ?? false });
    } catch (err) {
      console.error("Failed to update coin dock position:", err);
      setConfig(config);
    }
  };

  const handleNormalDockChange = async (dock: "left" | "right" | "top" | "bottom" | "floating") => {
    if (!config) return;
    // Normal mode: update normalDockPosition only — never touches coin mode's dockPosition
    const updatedConfig: AppConfig = { ...config, normalDockPosition: dock };
    setConfig(updatedConfig);
    try {
      await invoke("save_app_config", { config: updatedConfig });
      await invoke("set_window_size_mode", { settingsOpen: false, usageOnly: false });
    } catch (err) {
      console.error("Failed to update normal dock position:", err);
      setConfig(config);
    }
  };

  // Convenience: route to the correct handler based on current mode
  const handleDockChange = (dock: "left" | "right" | "top" | "bottom" | "floating") => {
    if (config?.usageOnly) {
      handleCoinDockChange(dock);
    } else {
      handleNormalDockChange(dock);
    }
  };

  // Drag-to-Snap (Magnetic snap) implementation — Coin mode only
  useEffect(() => {
    if (!config || !config.usageOnly || isPositionLocked) return;

    let debounceTimer: any = null;
    let unlisten: (() => void) | null = null;

    const setupListener = async () => {
      const appWindow = getCurrentWindow();
      
      unlisten = await appWindow.onMoved(async () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        
        debounceTimer = setTimeout(async () => {
          const monitor = (await currentMonitor()) || (await primaryMonitor());
          if (!monitor) return;
          
          const scaleFactor = monitor.scaleFactor;
          const monitorSize = monitor.size;
          const pos = await appWindow.outerPosition();
          
          const threshold = 60 * scaleFactor; // 60 pixels edge snapping threshold
          
          let targetDock: "left" | "right" | "top" | "bottom" | null = null;
          
          if (pos.x <= threshold) {
            targetDock = "left";
          } else if (pos.x >= monitorSize.width - (380 * scaleFactor) - threshold) {
            targetDock = "right";
          } else if (pos.y <= threshold) {
            targetDock = "top";
          } else if (pos.y >= monitorSize.height - (96 * scaleFactor) - threshold) {
            targetDock = "bottom";
          }
          
          if (targetDock && config.dockPosition !== targetDock) {
            handleCoinDockChange(targetDock);
          }
        }, 400); // 400ms after move stops
      });
    };

    setupListener();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      if (unlisten) unlisten();
    };
  }, [config?.usageOnly, isPositionLocked, config?.dockPosition, config]);

  const handleExitApp = () => {
    invoke("exit_app").catch((err) => {
      console.error("Failed to exit app:", err);
    });
  };

  const handleMoveMonitor = (direction: "left" | "right") => {
    invoke("move_to_next_monitor", { direction }).catch((err) => {
      console.error("Failed to move monitor:", err);
    });
  };


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

  // Called while the user drags the opacity slider — update CSS immediately without saving
  const handlePreviewOpacity = (opacity: number) => {
    document.documentElement.style.setProperty("--window-opacity", (opacity / 100).toString());
  };

  // Dynamic window resizing when settings open/close
  useEffect(() => {
    if (config) {
      // Pass usageOnly so Rust doesn't re-read config from disk (eliminates resize lag)
      invoke("set_window_size_mode", { settingsOpen: showSettings, usageOnly: config.usageOnly ?? false }).catch((err) => {
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
  const normalDockPosition = config?.normalDockPosition || "floating";

  return (
    <main
      className={`app-container borderless-canvas ${isUsageOnly ? "usage-only-mode" : `normal-dock-${normalDockPosition}`}`}
    >
      {/* Floating controls: child mode toggle + gear settings */}
      <div style={{ position: "absolute", top: "6px", right: "6px", zIndex: 100, display: "flex", alignItems: "center", gap: "4px" }}>
        {/* Child Window Mode Toggle Button */}
        <button
          className={`settings-toggle-floating-btn ${isUsageOnly ? "active" : ""}`}
          onClick={handleToggleUsageOnly}
          title={i18n.language === "ja" ? (isUsageOnly ? "通常モードに切り替え" : "子ウィンドウモードに切り替え") : (isUsageOnly ? "Switch to Normal Mode" : "Switch to Child Window Mode")}
          aria-label={isUsageOnly ? "Switch to Normal Mode" : "Switch to Child Window Mode"}
          style={{ position: "static" }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8M12 17v4" />
          </svg>
        </button>

        {/* Settings Gear */}
        <button
          className={`settings-toggle-floating-btn ${showGearMenu ? "active" : ""}`}
          onClick={() => setShowGearMenu(!showGearMenu)}
          title={t("settings.title")}
          aria-label={t("settings.title")}
          style={{ position: "static" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>

        {showGearMenu && (
          <div className="gear-dropdown-menu tab-slide-fade-in">
            <button className="gear-dropdown-item" onClick={() => { setShowSettings(true); setShowGearMenu(false); }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: "6px", color: "var(--text-secondary)" }}>
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              <span style={{ flex: 1, textAlign: "left" }}>{t("settings.gearMenu.settings")}</span>
            </button>
            <button className="gear-dropdown-item danger" onClick={handleExitApp}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: "6px" }}>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span style={{ flex: 1, textAlign: "left" }}>{t("settings.gearMenu.exitApp")}</span>
            </button>
          </div>
        )}
      </div>

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
        isUsageOnly={isUsageOnly}
        isPositionLocked={isPositionLocked}
        onToggleLock={handleToggleLock}
        onDockChange={handleDockChange}
        onMoveMonitor={handleMoveMonitor}
      />


      {showSettings && config && (
        <SettingsView 
          config={config} 
          onClose={() => setShowSettings(false)}
          onSave={handleSaveSettings}
          onPreviewOpacity={handlePreviewOpacity}
        />
      )}
    </main>
  );
}

export default App;
