export interface GitFileInfo {
  path: string;
  status: string;
}

export interface GitStatus {
  repoName: string;
  currentBranch: string;
  upstream: string;
  ahead: number;
  behind: number;
  modified: number;
  staged: number;
  untracked: number;
  conflict: number;
  commitGraph: string;
  files: GitFileInfo[];
  branches: string[];
}

export interface UsageSnapshot {
  provider: string;
  displayName: string;
  accountLabel?: string;
  planLabel?: string;
  used?: number;
  limit?: number;
  unit: string;
  status: "ok" | "warning" | "danger" | "limited" | "unknown" | "error";
  lastUpdatedAt: string;
}

export interface AppConfig {
  repoPath: string;
  heightRatio: number;
  usageJsonPath: string;
  enabledProviders: string[];
  usageOnly?: boolean;
  codexToken?: string;
  copilotPat?: string;
  claudeKey?: string;
  accentColor?: string;
  windowOpacity?: number;
  /** Dock position for coin (usage-only) mode */
  dockPosition?: "left" | "right" | "top" | "bottom" | "floating";
  /** Dock position for normal (non-coin) window mode — independent from dockPosition */
  normalDockPosition?: "left" | "right" | "top" | "bottom" | "floating";
  controllerWidth?: number;
  controllerHeight?: number;
}

export type ProviderId = "claude" | "codex" | "copilot" | "opencode";

export type QuotaWindowId =
  | "5h"
  | "7d"
  | "session"
  | "weekly"
  | "monthly"
  | "credits"
  | "primary"
  | "secondary"
  | "unknown";

export interface QuotaWindow {
  id: QuotaWindowId;
  label: string;
  remainingPercent?: number;
  remainingValue?: number;
  totalValue?: number;
  unit: "percent" | "requests" | "credits";
  resetAt?: string;
}

export interface ProviderQuota {
  provider: ProviderId;
  displayName: string;
  cliInstalled: boolean;
  loggedIn: boolean;
  accountLabel?: string;
  windows: QuotaWindow[];
  source:
    | "cli"
    | "cliAuth"
    | "statusline"
    | "localFile"
    | "internalApi"
    | "opencodeQuota"
    | "manual"
    | "unavailable";
  reliability: "high" | "medium" | "low";
  updatedAt: string;
  warning?: string;
  error?: string;
}

export interface ProviderAuthStatus {
  provider: string;
  loggedIn: boolean;
  cliInstalled: boolean;
  accountLabel?: string;
  error?: string;
}



