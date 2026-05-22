import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { ProviderId } from "../../types";

interface SetupHintProps {
  provider: ProviderId;
  cliInstalled: boolean;
  loggedIn: boolean;
}

export const SetupHint: React.FC<SetupHintProps> = ({ provider, cliInstalled, loggedIn }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const getHintData = () => {
    switch (provider) {
      case "claude":
        return {
          installCmd: "npm i -g @anthropic-ai/claude-code",
          loginCmd: "claude auth login",
          docsUrl: "https://docs.anthropic.com/claude/docs/claude-code",
          description: t("setup.claude.desc"),
        };
      case "codex":
        return {
          installCmd: "npm i -g codex-cli-tool", // Example install cmd
          loginCmd: "codex login",
          docsUrl: "https://codex.example.com",
          description: t("setup.codex.desc"),
        };
      case "copilot":
        return {
          installCmd: "winget install GitHub.cli", // For Windows
          loginCmd: "gh auth login",
          docsUrl: "https://github.com/features/copilot",
          description: t("setup.copilot.desc"),
        };
      case "opencode":
        return {
          installCmd: "npm i -g @opencode/cli @opencode/quota-cli",
          loginCmd: "opencode auth login",
          docsUrl: "https://opencode.example.com",
          description: t("setup.opencode.desc"),
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
            {t("setup.cliNotDetected")}
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
              {copied ? t("common.copied") : t("common.copy")}
            </button>
          </div>
        </div>
      )}

      {cliInstalled && !loggedIn && (
        <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
          <span style={{ color: "var(--color-warning)", fontWeight: 500 }}>
            {t("setup.authRequired")}
          </span>
          <p style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>
            {t("setup.signInInstruction")}
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
              {copied ? t("common.copied") : t("common.copy")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
