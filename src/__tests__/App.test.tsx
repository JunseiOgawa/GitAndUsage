import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import App from "../App";
import type { AppConfig, GitStatus, UsageSnapshot, ProviderQuota } from "../types";

function createConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    repoPath: "C:\\repo",
    heightRatio: 0.2,
    usageJsonPath: "./usage.json",
    enabledProviders: ["claude", "copilot", "codex"],
    usageOnly: false,
    codexToken: undefined,
    copilotPat: undefined,
    claudeKey: undefined,
    accentColor: "#ff0000",
    windowOpacity: 80,
    dockPosition: "right",
    normalDockPosition: "floating",
    controllerWidth: 380,
    controllerHeight: 96,
    ...overrides,
  };
}

const gitStatus: GitStatus = {
  repoName: "repo",
  currentBranch: "main",
  upstream: "origin/main",
  ahead: 0,
  behind: 0,
  modified: 0,
  staged: 0,
  untracked: 0,
  conflict: 0,
  commitGraph: "",
  files: [],
  branches: ["main"],
};

const usageSnapshots: UsageSnapshot[] = [
  {
    provider: "codex",
    displayName: "Codex",
    accountLabel: "test",
    planLabel: "Pro",
    used: 1,
    limit: 2,
    unit: "requests",
    status: "ok",
    lastUpdatedAt: "2026-05-25T00:00:00Z",
  },
];

const quotas: ProviderQuota[] = [
  {
    provider: "claude",
    displayName: "Claude Code",
    cliInstalled: true,
    loggedIn: true,
    accountLabel: "claude@example.com",
    windows: [],
    source: "manual",
    reliability: "high",
    updatedAt: "2026-05-25T00:00:00Z",
  },
  {
    provider: "codex",
    displayName: "Codex CLI",
    cliInstalled: true,
    loggedIn: true,
    accountLabel: "codex@example.com",
    windows: [],
    source: "manual",
    reliability: "high",
    updatedAt: "2026-05-25T00:00:00Z",
  },
  {
    provider: "copilot",
    displayName: "GitHub Copilot",
    cliInstalled: true,
    loggedIn: true,
    accountLabel: "copilot@example.com",
    windows: [],
    source: "manual",
    reliability: "high",
    updatedAt: "2026-05-25T00:00:00Z",
  },
  {
    provider: "opencode",
    displayName: "OpenCode",
    cliInstalled: true,
    loggedIn: true,
    accountLabel: "opencode@example.com",
    windows: [],
    source: "manual",
    reliability: "high",
    updatedAt: "2026-05-25T00:00:00Z",
  },
];

describe("App", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.spyOn(window, "alert").mockImplementation(() => {});
  });

  it("applies CSS variables from config", async () => {
    vi.mocked(invoke).mockImplementation(async (command: string) => {
      if (command === "get_app_config") return createConfig();
      if (command === "get_git_status") return gitStatus;
      if (command === "get_usage_snapshot") return usageSnapshots;
      if (command === "get_all_ai_quotas") return quotas;
      if (command === "get_commit_log") return [];
      return undefined;
    });

    render(<App />);

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue("--accent-color")).toBe("#ff0000");
      expect(document.documentElement.style.getPropertyValue("--window-opacity")).toBe("0.8");
    });

    expect(screen.getByLabelText("Switch to Child Window Mode")).toBeInTheDocument();
  });

  it("saves usageOnly changes and updates window size mode", async () => {
    const user = userEvent.setup();
    vi.mocked(invoke).mockImplementation(async (command: string) => {
      if (command === "get_app_config") return createConfig();
      if (command === "get_git_status") return gitStatus;
      if (command === "get_usage_snapshot") return usageSnapshots;
      if (command === "get_all_ai_quotas") return quotas;
      if (command === "get_commit_log") return [];
      if (command === "open_folder_dialog") return null;
      if (command === "save_app_config" || command === "set_window_size_mode") return undefined;
      return undefined;
    });

    render(<App />);

    const toggle = await screen.findByLabelText("Switch to Child Window Mode");
    await user.click(toggle);

    expect(invoke).toHaveBeenCalledWith(
      "save_app_config",
      expect.objectContaining({
        config: expect.objectContaining({ usageOnly: true }),
      })
    );
    expect(invoke).toHaveBeenCalledWith("set_window_size_mode", {
      settingsOpen: false,
      usageOnly: true,
    });
  });

  it("suppresses alert when folder dialog is cancelled", async () => {
    const user = userEvent.setup();
    const nonRepoStatus: GitStatus = {
      ...gitStatus,
      repoName: "Not a Git Repository",
    };
    vi.mocked(invoke).mockImplementation(async (command: string) => {
      if (command === "get_app_config") return createConfig();
      if (command === "get_git_status") return nonRepoStatus;
      if (command === "get_usage_snapshot") return usageSnapshots;
      if (command === "get_all_ai_quotas") return quotas;
      if (command === "get_commit_log") return [];
      if (command === "open_folder_dialog") throw "No folder selected";
      return undefined;
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText("Switch to Child Window Mode")).toBeInTheDocument();
    });

    await user.click(await screen.findByText("git.openFolder"));

    expect(window.alert).not.toHaveBeenCalled();
  });
});
