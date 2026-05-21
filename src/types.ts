export interface GitStatus {
  repo_name: string;
  current_branch: string;
  upstream: string;
  ahead: number;
  behind: number;
  modified: number;
  staged: number;
  untracked: number;
  conflict: number;
  commit_graph: string;
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
  repo_path: string;
  height_ratio: number;
  usage_json_path: string;
  enabled_providers: string[];
  codex_token?: string;
  copilot_pat?: string;
  claude_key?: string;
  copilot_org?: string; // Optional field for form UI
}

