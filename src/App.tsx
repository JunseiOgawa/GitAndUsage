import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AppConfig, GitStatus, UsageSnapshot } from "./types";
import { GitGraphPanel } from "./GitGraphPanel";
import { UsagePanel } from "./UsagePanel";

function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [gitLoading, setGitLoading] = useState(true);
  const [gitError, setGitError] = useState<string | null>(null);

  const [usageSnapshots, setUsageSnapshots] = useState<UsageSnapshot[]>([]);
  const [usageLoading, setUsageLoading] = useState(true);
  const [usageError, setUsageError] = useState<string | null>(null);

  // 1. Load application configuration on mount
  useEffect(() => {
    async function loadConfig() {
      try {
        const appConfig = await invoke<AppConfig>("get_app_config");
        setConfig(appConfig);
      } catch (err: any) {
        console.error("Failed to load app config:", err);
        setConfigError(err?.message || String(err));
      } finally {
        setConfigLoading(false);
      }
    }
    loadConfig();
  }, []);

  // 2. Fetch Git status periodically
  useEffect(() => {
    if (!config) return;

    let isMounted = true;

    async function fetchGitStatus() {
      try {
        const status = await invoke<GitStatus>("get_git_status", {
          repoPath: config.repo_path,
        });
        if (isMounted) {
          setGitStatus(status);
          setGitError(null);
        }
      } catch (err: any) {
        console.error("Failed to get git status:", err);
        if (isMounted) {
          setGitError(err?.message || String(err));
        }
      } finally {
        if (isMounted) {
          setGitLoading(false);
        }
      }
    }

    // Initial fetch
    fetchGitStatus();

    // 10 seconds polling
    const interval = setInterval(fetchGitStatus, 10000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [config]);

  // 3. Fetch Usage snapshots periodically
  useEffect(() => {
    if (!config) return;

    let isMounted = true;

    async function fetchUsageSnapshots() {
      try {
        const snapshots = await invoke<UsageSnapshot[]>("get_usage_snapshot", {
          jsonPath: config.usage_json_path,
        });
        
        // Filter by enabled_providers if list is present and not empty
        const filtered = (config.enabled_providers && config.enabled_providers.length > 0)
          ? snapshots.filter(s => config.enabled_providers.includes(s.provider))
          : snapshots;

        if (isMounted) {
          setUsageSnapshots(filtered);
          setUsageError(null);
        }
      } catch (err: any) {
        console.error("Failed to get usage snapshot:", err);
        if (isMounted) {
          setUsageError(err?.message || String(err));
        }
      } finally {
        if (isMounted) {
          setUsageLoading(false);
        }
      }
    }

    // Initial fetch
    fetchUsageSnapshots();

    // 30 seconds polling
    const interval = setInterval(fetchUsageSnapshots, 30000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [config]);

  // Premium loading screen for initial app configuration load
  if (configLoading) {
    return (
      <div className="loading-overlay">
        <div className="spinner"></div>
        <p style={{ fontFamily: "var(--font-sans)", fontWeight: 500, letterSpacing: "1px", color: "var(--text-secondary)" }}>
          INITIALIZING SYSTEM CONFIG
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
        <h2 style={{ marginTop: "16px", color: "var(--text-primary)" }}>Configuration Error</h2>
        <p style={{ color: "var(--text-secondary)", maxWidth: "450px", marginTop: "8px", fontSize: "0.95rem" }}>
          Could not load the Tauri backend application configuration. Ensure the backend is active.
        </p>
        <p style={{ color: "var(--color-danger)", fontFamily: "var(--font-mono)", fontSize: "0.85rem", marginTop: "16px" }}>
          Details: {configError}
        </p>
      </div>
    );
  }

  return (
    <main className="app-container">
      <GitGraphPanel 
        status={gitStatus} 
        loading={gitLoading} 
        error={gitError} 
      />
      <UsagePanel 
        snapshots={usageSnapshots} 
        loading={usageLoading} 
        error={usageError} 
      />
    </main>
  );
}

export default App;
