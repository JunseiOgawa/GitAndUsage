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
  codexToken?: string;
  copilotPat?: string;
  claudeKey?: string;
  copilotOrg?: string; // Optional field for form UI
  codexPlan?: string;
  codexAccount?: string;
  copilotPlan?: string;
  copilotAccount?: string;
  claudePlan?: string;
  claudeAccount?: string;
}


