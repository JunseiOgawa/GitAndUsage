import React, { useState, useEffect } from "react";
import { GitStatus } from "./types";

interface GitGraphPanelProps {
  status: GitStatus | null;
  loading: boolean;
  error: string | null;
  onOpenFolder: () => void;
}

interface TreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  status?: string;
  children: { [key: string]: TreeNode };
}

export const GitGraphPanel: React.FC<GitGraphPanelProps> = ({
  status,
  loading,
  error,
  onOpenFolder,
}) => {
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});

  // Toggle folder expansion
  const toggleFolder = (path: string) => {
    setOpenFolders((prev) => ({
      ...prev,
      [path]: !prev[path],
    }));
  };

  // Build tree from flat files array
  const buildTree = (filesList: Array<{ path: string; status: string }>): TreeNode => {
    const root: TreeNode = { name: "root", path: "", isFolder: true, children: {} };

    filesList.forEach((file) => {
      // Split path and filter out empty segments
      const parts = file.path.split(/[/\\]/).filter(Boolean);
      let current = root;
      let currentPath = "";

      parts.forEach((part, index) => {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const isLast = index === parts.length - 1;

        if (!current.children[part]) {
          current.children[part] = {
            name: part,
            path: currentPath,
            isFolder: !isLast,
            status: isLast ? file.status : undefined,
            children: {},
          };
        }
        current = current.children[part];
      });
    });

    return root;
  };

  // Automatically expand top-level folders on data load
  useEffect(() => {
    if (status?.files) {
      const initialOpen: Record<string, boolean> = {};
      status.files.forEach((file) => {
        const parts = file.path.split(/[/\\]/).filter(Boolean);
        if (parts.length > 1) {
          initialOpen[parts[0]] = true;
        }
      });
      setOpenFolders(initialOpen);
    }
  }, [status]);

  const getStatusBadgeClass = (statusChar?: string) => {
    if (!statusChar) return "";
    const char = statusChar.trim().toUpperCase();
    if (char === "M") return "tree-badge-modified";
    if (char === "A") return "tree-badge-added";
    if (char === "D") return "tree-badge-deleted";
    if (char === "??") return "tree-badge-untracked";
    return "tree-badge-generic";
  };

  // Recursive Tree Node Renderer
  const renderNode = (node: TreeNode, depth: number = 0) => {
    // Sort children: Folders first, then Files
    const sortedKeys = Object.keys(node.children).sort((a, b) => {
      const childA = node.children[a];
      const childB = node.children[b];
      if (childA.isFolder && !childB.isFolder) return -1;
      if (!childA.isFolder && childB.isFolder) return 1;
      return a.localeCompare(b);
    });

    return sortedKeys.map((key) => {
      const child = node.children[key];
      const isOpen = !!openFolders[child.path];
      const hasChildren = Object.keys(child.children).length > 0;

      if (child.isFolder) {
        return (
          <div key={child.path} className="tree-node-wrapper">
            <div
              className="tree-node folder"
              style={{ paddingLeft: `${depth * 14 + 8}px` }}
              onClick={() => toggleFolder(child.path)}
            >
              <span className={`folder-arrow ${isOpen ? "open" : ""}`}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </span>
              <span className="folder-icon">
                {isOpen ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                )}
              </span>
              <span className="node-name">{child.name}</span>
            </div>
            {isOpen && hasChildren && (
              <div className="tree-children-container">
                {renderNode(child, depth + 1)}
              </div>
            )}
          </div>
        );
      } else {
        return (
          <div
            key={child.path}
            className="tree-node file"
            style={{ paddingLeft: `${depth * 14 + 22}px` }}
          >
            <span className="file-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </span>
            <span className="node-name">{child.name}</span>
            {child.status && (
              <span className={`tree-badge ${getStatusBadgeClass(child.status)}`}>
                {child.status}
              </span>
            )}
          </div>
        );
      }
    });
  };

  const renderGitGraph = (graphText: string) => {
    if (!graphText) return null;
    const lines = graphText.split("\n");
    return lines.map((line, idx) => {
      const hasHead = line.includes("HEAD") || line.includes("->");
      return (
        <span key={idx} className={hasHead ? "git-graph-line-highlight" : ""}>
          {line}
        </span>
      );
    });
  };

  const isNotGitRepo = !status || !status.repoName;
  const fileTree = status?.files ? buildTree(status.files) : null;

  return (
    <div className="left-panel">
      {/* Top Header Section with Folder Open Button */}
      <div className="canvas-header">
        <div className="canvas-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="18" r="3" />
            <circle cx="6" cy="6" r="3" />
            <circle cx="6" cy="18" r="3" />
            <path d="M18 15V9a4 4 0 0 0-4-4H9" />
            <line x1="6" y1="9" x2="6" y2="15" />
          </svg>
          Git workspace
          {status && status.repoName && (
            <span className="canvas-subtitle">{status.repoName}</span>
          )}
        </div>

        <button 
          onClick={onOpenFolder}
          className="open-folder-btn"
          title="Open Repository"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          Open Folder
        </button>
      </div>

      {/* Main Content Pane */}
      <div className="canvas-body">
        {loading && !status ? (
          <div className="fallback-screen">
            <div className="spinner"></div>
            <p style={{ marginTop: "16px" }}>Analyzing Git workspace...</p>
          </div>
        ) : error || isNotGitRepo ? (
          <div className="fallback-screen">
            <div className="fallback-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <h3 style={{ marginBottom: "8px" }}>Not a Git Repository</h3>
            <p className="fallback-text">
              Configure a valid repository path or open a folder using the button above.
            </p>
            {error && (
              <p style={{ marginTop: "12px", color: "var(--color-danger)", fontSize: "0.85rem", fontFamily: "var(--font-mono)" }}>
                {error}
              </p>
            )}
          </div>
        ) : (
          <div className="split-view-container">
            {/* Left Side: Git Graph */}
            <div className="split-column graph-column">
              <div className="column-header">
                <div className="column-title-text">
                  <span className="git-branch-badge" style={{ marginLeft: 0 }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: "4px" }}>
                      <line x1="6" y1="3" x2="6" y2="15" />
                      <circle cx="18" cy="6" r="3" />
                      <circle cx="6" cy="18" r="3" />
                      <path d="M18 9a9 9 0 0 1-9 9" />
                    </svg>
                    {status.currentBranch}
                  </span>
                  {status.upstream && (
                    <span className="git-upstream">
                      via {status.upstream}
                    </span>
                  )}
                </div>
                
                <div style={{ display: "flex", gap: "6px" }}>
                  {status.ahead > 0 && <span className="git-sync-badge ahead">+{status.ahead} ahead</span>}
                  {status.behind > 0 && <span className="git-sync-badge behind">-{status.behind} behind</span>}
                </div>
              </div>

              <div className="graph-code-view">
                <pre className="git-graph">
                  <code>{renderGitGraph(status.commitGraph)}</code>
                </pre>
              </div>
            </div>

            {/* Right Side: GitLens File Tree */}
            <div className="split-column tree-column">
              <div className="column-header">
                <span className="column-header-title">Changes ({status.files ? status.files.length : 0})</span>
                <div className="git-changes" style={{ gap: "4px" }}>
                  {status.staged > 0 && <span className="badge badge-staged">{status.staged}</span>}
                  {status.modified > 0 && <span className="badge badge-modified">{status.modified}</span>}
                  {status.untracked > 0 && <span className="badge badge-untracked">{status.untracked}</span>}
                  {status.conflict > 0 && <span className="badge badge-conflict">{status.conflict}</span>}
                </div>
              </div>

              <div className="tree-viewport">
                {fileTree && Object.keys(fileTree.children).length > 0 ? (
                  <div className="tree-root-container">
                    {renderNode(fileTree)}
                  </div>
                ) : (
                  <div className="tree-empty-state">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>No uncommitted changes</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
