import React from "react";
import { GitStatus } from "./types";

interface GitGraphPanelProps {
  status: GitStatus | null;
  loading: boolean;
  error: string | null;
}

export const GitGraphPanel: React.FC<GitGraphPanelProps> = ({ status, loading, error }) => {
  // If not a git repository or status is completely missing after loading
  const isNotGitRepo = !status || !status.repo_name;

  const renderGitGraph = (graphText: string) => {
    if (!graphText) return null;
    
    const lines = graphText.split("\n");
    return lines.map((line, idx) => {
      // Highlight lines containing HEAD reference
      const hasHead = line.includes("HEAD") || line.includes("->");
      const isHighlighted = hasHead;
      
      return (
        <span 
          key={idx} 
          className={isHighlighted ? "git-graph-line-highlight" : ""}
        >
          {line}
        </span>
      );
    });
  };

  return (
    <div className="left-panel glass-panel">
      <div className="panel-header">
        <div className="panel-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent-color)" }}>
            <circle cx="18" cy="18" r="3" />
            <circle cx="6" cy="6" r="3" />
            <circle cx="6" cy="18" r="3" />
            <path d="M18 15V9a4 4 0 0 0-4-4H9" />
            <line x1="6" y1="9" x2="6" y2="15" />
          </svg>
          Git Workspace
        </div>
        {status && status.repo_name && (
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
            {status.repo_name}
          </span>
        )}
      </div>

      <div className="panel-content">
        {loading && !status ? (
          <div className="fallback-screen">
            <div className="spinner"></div>
            <p style={{ marginTop: "16px" }}>Analyzing Git repository...</p>
          </div>
        ) : error || isNotGitRepo ? (
          <div className="fallback-screen">
            <div className="fallback-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <h3 style={{ marginBottom: "8px", color: "var(--text-primary)" }}>Not a Git Repository</h3>
            <p className="fallback-text">
              Please initialize git or check your configured repository path in the application.
            </p>
            {error && (
              <p style={{ marginTop: "12px", color: "var(--color-danger)", fontSize: "0.85rem", fontFamily: "var(--font-mono)" }}>
                Error: {error}
              </p>
            )}
          </div>
        ) : (
          <div className="git-graph-container">
            <div className="git-metadata">
              <div className="git-meta-row">
                <span className="git-repo-name">{status.repo_name}</span>
                <span className="git-branch-badge">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: "4px", verticalAlign: "middle" }}>
                    <line x1="6" y1="3" x2="6" y2="15" />
                    <circle cx="18" cy="6" r="3" />
                    <circle cx="6" cy="18" r="3" />
                    <path d="M18 9a9 9 0 0 1-9 9" />
                  </svg>
                  {status.current_branch}
                </span>

                {status.upstream && (
                  <span className="git-upstream">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle" }}>
                      <path d="m12 19-7-7 7-7" />
                      <path d="M19 12H5" />
                    </svg>
                    {status.upstream}
                  </span>
                )}

                {status.ahead > 0 && (
                  <span className="git-sync-badge ahead">
                    Ahead {status.ahead}
                  </span>
                )}
                {status.behind > 0 && (
                  <span className="git-sync-badge behind">
                    Behind {status.behind}
                  </span>
                )}
              </div>

              <div className="git-changes">
                {status.staged > 0 && (
                  <span className="badge badge-staged">
                    Staged: {status.staged}
                  </span>
                )}
                {status.modified > 0 && (
                  <span className="badge badge-modified">
                    Modified: {status.modified}
                  </span>
                )}
                {status.untracked > 0 && (
                  <span className="badge badge-untracked">
                    Untracked: {status.untracked}
                  </span>
                )}
                {status.conflict > 0 && (
                  <span className="badge badge-conflict">
                    Conflict: {status.conflict}
                  </span>
                )}
                {status.staged === 0 && status.modified === 0 && status.untracked === 0 && status.conflict === 0 && (
                  <span className="badge" style={{ background: "rgba(16, 185, 129, 0.05)", borderColor: "rgba(16, 185, 129, 0.15)", color: "#10b981", fontWeight: "normal" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: "4px", verticalAlign: "middle" }}>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Working tree clean
                  </span>
                )}
              </div>
            </div>

            <div className="git-graph-wrapper">
              <pre className="git-graph">
                <code>{renderGitGraph(status.commit_graph)}</code>
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
