import React, { useState } from "react";
import { ProviderId } from "../../types";

interface SetupHintProps {
  provider: ProviderId;
  cliInstalled: boolean;
  loggedIn: boolean;
}

export const SetupHint: React.FC<SetupHintProps> = ({ provider, cliInstalled, loggedIn }) => {
  const [copied, setCopied] = useState(false);

  const getHintData = () => {
    switch (provider) {
      case "claude":
        return {
          installCmd: "npm i -g @anthropic-ai/claude-code",
          loginCmd: "claude auth login",
          docsUrl: "https://docs.anthropic.com/claude/docs/claude-code",
          description: "Claude Code is a CLI tool that enables agentic coding agent directly in your terminal.",
        };
      case "codex":
        return {
          installCmd: "npm i -g codex-cli-tool", // Example install cmd
          loginCmd: "codex login",
          docsUrl: "https://codex.example.com",
          description: "Codex CLI provides quick shell access to powerful code generators.",
        };
      case "copilot":
        return {
          installCmd: "winget install GitHub.cli", // For Windows
          loginCmd: "gh auth login",
          docsUrl: "https://github.com/features/copilot",
          description: "GitHub Copilot CLI connects with your GitHub account via standard gh command.",
        };
      case "opencode":
        return {
          installCmd: "npm i -g @opencode/cli @opencode/quota-cli",
          loginCmd: "opencode auth login",
          docsUrl: "https://opencode.example.com",
          description: "OpenCode CLI is an open-source decentralized developer intelligence platform.",
        };
    }
  };

  const hint = getHintData();

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (cliInstalled && loggedIn) return null;

  return (
    <div className="setup-hint-card" style={{
      marginTop: "16px",
      padding: "14px",
      borderRadius: "8px",
      background: "rgba(255, 255, 255, 0.02)",
      border: "1px solid rgba(255, 255, 255, 0.04)",
      fontSize: "0.75rem",
      display: "flex",
      flexDirection: "column",
      gap: "10px"
    }}>
      <p style={{ color: "var(--text-secondary)", lineHeight: "1.4" }}>
        {hint.description}
      </p>

      {!cliInstalled && (
        <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
          <span style={{ color: "var(--color-warning)", fontWeight: 500 }}>
            ⚠️ CLI is not installed or detected
          </span>
          <div className="cmd-box" style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "rgba(0, 0, 0, 0.2)",
            padding: "6px 10px",
            borderRadius: "6px",
            border: "1px solid rgba(255, 255, 255, 0.03)",
            fontFamily: "var(--font-mono)",
            fontSize: "0.7rem",
            color: "#e4e4e7"
          }}>
            <span style={{ overflowX: "auto", whiteSpace: "nowrap", paddingRight: "10px" }}>
              {hint.installCmd}
            </span>
            <button
              onClick={() => handleCopy(hint.installCmd)}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--accent-color)",
                cursor: "pointer",
                padding: "2px 6px",
                fontSize: "0.7rem",
                fontWeight: 500,
                outline: "none"
              }}
            >
              Copy
            </button>
          </div>
        </div>
      )}

      {cliInstalled && !loggedIn && (
        <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
          <span style={{ color: "var(--color-warning)", fontWeight: 500 }}>
            🔑 Authentication Required
          </span>
          <p style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>
            Run the following command in your terminal to sign in:
          </p>
          <div className="cmd-box" style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "rgba(0, 0, 0, 0.2)",
            padding: "6px 10px",
            borderRadius: "6px",
            border: "1px solid rgba(255, 255, 255, 0.03)",
            fontFamily: "var(--font-mono)",
            fontSize: "0.7rem",
            color: "#e4e4e7"
          }}>
            <span style={{ overflowX: "auto", whiteSpace: "nowrap", paddingRight: "10px" }}>
              {hint.loginCmd}
            </span>
            <button
              onClick={() => handleCopy(hint.loginCmd)}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--accent-color)",
                cursor: "pointer",
                padding: "2px 6px",
                fontSize: "0.7rem",
                fontWeight: 500,
                outline: "none"
              }}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
