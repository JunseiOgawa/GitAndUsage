import React, { useState, useEffect } from "react";
import { GitStatus } from "./types";
import { invoke } from "@tauri-apps/api/core";

interface GitGraphPanelProps {
  status: GitStatus | null;
  loading: boolean;
  error: string | null;
  onOpenFolder: () => void;
  repoPath: string;
  onRefresh?: () => void;
}

interface TreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  status?: string;
  children: { [key: string]: TreeNode };
}

interface BranchTreeNode {
  name: string;
  fullName: string;
  isFolder: boolean;
  isCurrent: boolean;
  children: { [key: string]: BranchTreeNode };
}

export const GitGraphPanel: React.FC<GitGraphPanelProps> = ({
  status,
  loading,
  error,
  onOpenFolder,
  repoPath,
  onRefresh,
}) => {
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [openBranchFolders, setOpenBranchFolders] = useState<Record<string, boolean>>({
    "Local": true,
    "Remote": true,
  });
  const [activeTab, setActiveTab] = useState<"branches" | "changes">("branches");
  const [changesView, setChangesView] = useState<"tree" | "list">("tree");
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  // Toggle folder expansion in changes tree
  const toggleFolder = (path: string) => {
    setOpenFolders((prev) => ({
      ...prev,
      [path]: !prev[path],
    }));
  };

  // Toggle folder expansion in branches tree
  const toggleBranchFolder = (path: string) => {
    setOpenBranchFolders((prev) => ({
      ...prev,
      [path]: !prev[path],
    }));
  };

  // Build directory tree from flat files array
  const buildTree = (filesList: Array<{ path: string; status: string }>): TreeNode => {
    const root: TreeNode = { name: "root", path: "", isFolder: true, children: {} };

    filesList.forEach((file) => {
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

  // Build branch tree from flat branches array
  const buildBranchTree = (branchesList: string[], currentBranch: string): BranchTreeNode => {
    const root: BranchTreeNode = { name: "root", fullName: "", isFolder: true, isCurrent: false, children: {} };

    branchesList.forEach((branch) => {
      const isCurrent = branch === currentBranch;
      
      let category = "Local";
      let displayBranch = branch;
      if (branch.startsWith("origin/")) {
        category = "Remote";
      }

      const parts = [category, ...displayBranch.split("/").filter(Boolean)];
      
      let current = root;

      parts.forEach((part, index) => {
        const isLast = index === parts.length - 1;

        if (!current.children[part]) {
          current.children[part] = {
            name: part,
            fullName: isLast ? branch : "",
            isFolder: !isLast,
            isCurrent: isLast && isCurrent,
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

  // Recursive Directory Tree Node Renderer (for Changes)
  const renderNode = (node: TreeNode, depth: number = 0) => {
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

  // Flat List Renderer for changes
  const renderFlatList = (filesList: Array<{ path: string; status: string }>) => {
    return filesList.map((file) => {
      const parts = file.path.split(/[/\\]/);
      const fileName = parts[parts.length - 1];
      const dirPath = parts.slice(0, parts.length - 1).join("/");

      return (
        <div key={file.path} className="flat-file-node">
          <span className="file-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </span>
          <div className="flat-file-info">
            <span className="node-name">{fileName}</span>
            {dirPath && <span className="flat-file-path">{dirPath}</span>}
          </div>
          <span className={`tree-badge ${getStatusBadgeClass(file.status)}`}>
            {file.status}
          </span>
        </div>
      );
    });
  };

  // Recursive Branch Tree Node Renderer
  const renderBranchNode = (node: BranchTreeNode, depth: number = 0, currentPath: string = "") => {
    const sortedKeys = Object.keys(node.children).sort((a, b) => {
      const childA = node.children[a];
      const childB = node.children[b];
      if (childA.isFolder && !childB.isFolder) return -1;
      if (!childA.isFolder && childB.isFolder) return 1;
      return a.localeCompare(b);
    });

    return sortedKeys.map((key) => {
      const child = node.children[key];
      const nodePath = currentPath ? `${currentPath}/${key}` : key;
      const isOpen = !!openBranchFolders[nodePath];
      const hasChildren = Object.keys(child.children).length > 0;

      if (child.isFolder) {
        return (
          <div key={nodePath} className="branch-tree-node-wrapper">
            <div
              className="branch-node folder"
              style={{ paddingLeft: `${depth * 12 + 8}px` }}
              onClick={() => toggleBranchFolder(nodePath)}
            >
              <span className={`folder-arrow ${isOpen ? "open" : ""}`}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </span>
              <span className="folder-icon">
                {isOpen ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                )}
              </span>
              <span className="node-name">{child.name}</span>
            </div>
            {isOpen && hasChildren && (
              <div className="branch-tree-children">
                {renderBranchNode(child, depth + 1, nodePath)}
              </div>
            )}
          </div>
        );
      } else {
        return (
          <div
            key={nodePath}
            className={`branch-node branch ${child.isCurrent ? "current" : ""}`}
            style={{ paddingLeft: `${depth * 12 + 22}px` }}
            onClick={() => !child.isCurrent && handleCheckoutBranch(child.fullName)}
          >
            <span className="branch-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={child.isCurrent ? "#c7d2fe" : "var(--text-secondary)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="6" y1="3" x2="6" y2="15" />
                <circle cx="18" cy="6" r="3" />
                <circle cx="6" cy="18" r="3" />
                <path d="M18 9a9 9 0 0 1-9 9" />
              </svg>
            </span>
            <span className="node-name">{child.name}</span>
            {child.isCurrent && (
              <span className="current-badge">active</span>
            )}
          </div>
        );
      }
    });
  };

  // Branch checkout logic
  const handleCheckoutBranch = async (branchName: string) => {
    if (!repoPath) return;
    setCheckoutLoading(true);
    try {
      await invoke("checkout_branch", {
        repoPath,
        branchName,
      });
      if (onRefresh) {
        onRefresh();
      }
    } catch (err: any) {
      console.error("Checkout failed:", err);
      alert(`Failed to checkout branch "${branchName}":\n${err}`);
    } finally {
      setCheckoutLoading(false);
    }
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

  const isNotGitRepo = !status || !status.repoName || status.repoName === "Not a Git Repository";
  const fileTree = status?.files ? buildTree(status.files) : null;
  const branchTree = status?.branches ? buildBranchTree(status.branches, status.currentBranch) : null;

  return (
    <div className="left-panel">
      {/* Top Header Section with Folder Open Button */}
      <div className="canvas-header" data-tauri-drag-region>
        <div className="canvas-title" data-tauri-drag-region>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="18" r="3" />
            <circle cx="6" cy="6" r="3" />
            <circle cx="6" cy="18" r="3" />
            <path d="M18 15V9a4 4 0 0 0-4-4H9" />
            <line x1="6" y1="9" x2="6" y2="15" />
          </svg>
          Git workspace
          {status && status.repoName && !isNotGitRepo && (
            <span className="canvas-subtitle" data-tauri-drag-region>{status.repoName}</span>
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

      {/* Workspace Outer Container combining Vertical Tabs & Content Body */}
      <div className="git-workspace-layout-container">
        {/* Left Side: Premium Vertical Tabs */}
        {!isNotGitRepo && (
          <div className="git-workspace-vertical-tabs">
            <button 
              className={`git-workspace-tab-btn ${activeTab === "branches" ? "active" : ""}`}
              onClick={() => setActiveTab("branches")}
              title="Branches & Commit Graph"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="6" y1="3" x2="6" y2="15" />
                <circle cx="18" cy="6" r="3" />
                <circle cx="6" cy="18" r="3" />
                <path d="M18 9a9 9 0 0 1-9 9" />
              </svg>
              <span className="tab-label">Branches</span>
            </button>
            <button 
              className={`git-workspace-tab-btn ${activeTab === "changes" ? "active" : ""}`}
              onClick={() => setActiveTab("changes")}
              title={`Uncommitted Changes (${status?.files?.length || 0})`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              {status?.files && status.files.length > 0 && (
                <span className="tab-badge">{status.files.length}</span>
              )}
              <span className="tab-label">Changes</span>
            </button>
          </div>
        )}

        {/* Right Side: Main Content Viewport */}
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
              {checkoutLoading && (
                <div className="checkout-overlay">
                  <div className="spinner"></div>
                  <p style={{ marginTop: "12px", fontSize: "0.85rem", fontWeight: 500 }}>
                    Switching branches...
                  </p>
                </div>
              )}

              {activeTab === "branches" ? (
                /* =========================================
                   BRANCHES TAB VIEW (Split: Tree on Left, Graph on Right)
                   ========================================= */
                <>
                  {/* Left Column: Branch Tree Switcher */}
                  <div className="split-column tree-column branch-switcher-column">
                    <div className="column-header">
                      <span className="column-header-title">Branches ({status.branches ? status.branches.length : 0})</span>
                      <span className="git-branch-badge-pill">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: "3px" }}>
                          <line x1="6" y1="3" x2="6" y2="15" />
                          <circle cx="18" cy="6" r="3" />
                          <circle cx="6" cy="18" r="3" />
                          <path d="M18 9a9 9 0 0 1-9 9" />
                        </svg>
                        {status.currentBranch}
                      </span>
                    </div>

                    <div className="tree-viewport branch-tree-viewport">
                      {branchTree && Object.keys(branchTree.children).length > 0 ? (
                        <div className="tree-root-container branch-tree-root">
                          {renderBranchNode(branchTree)}
                        </div>
                      ) : (
                        <div className="tree-empty-state">
                          <span>No branches found</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Git Graph */}
                  <div className="split-column graph-column branch-graph-column">
                    <div className="column-header">
                      <div className="column-title-text">
                        <span className="column-header-title">Commit History Graph</span>
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
                </>
              ) : (
                /* =========================================
                   CHANGES TAB VIEW (Split: File Tree/List on Left, Graph on Right)
                   ========================================= */
                <>
                  {/* Left Column: File Tree or List view */}
                  <div className="split-column tree-column">
                    <div className="column-header">
                      <div className="column-title-text">
                        <span className="column-header-title">Changes ({status.files ? status.files.length : 0})</span>
                        <div className="view-toggle-buttons">
                          <button 
                            className={`view-toggle-btn ${changesView === "tree" ? "active" : ""}`}
                            onClick={() => setChangesView("tree")}
                            title="Tree View"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                            </svg>
                          </button>
                          <button 
                            className={`view-toggle-btn ${changesView === "list" ? "active" : ""}`}
                            onClick={() => setChangesView("list")}
                            title="Flat List View"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="8" y1="6" x2="21" y2="6" />
                              <line x1="8" y1="12" x2="21" y2="12" />
                              <line x1="8" y1="18" x2="21" y2="18" />
                              <line x1="3" y1="6" x2="3.01" y2="6" />
                              <line x1="3" y1="12" x2="3.01" y2="12" />
                              <line x1="3" y1="18" x2="3.01" y2="18" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      <div className="git-changes" style={{ gap: "4px" }}>
                        {status.staged > 0 && <span className="badge badge-staged">{status.staged}</span>}
                        {status.modified > 0 && <span className="badge badge-modified">{status.modified}</span>}
                        {status.untracked > 0 && <span className="badge badge-untracked">{status.untracked}</span>}
                        {status.conflict > 0 && <span className="badge badge-conflict">{status.conflict}</span>}
                      </div>
                    </div>

                    <div className="tree-viewport">
                      {status.files && status.files.length > 0 ? (
                        changesView === "tree" ? (
                          fileTree && Object.keys(fileTree.children).length > 0 ? (
                            <div className="tree-root-container">
                              {renderNode(fileTree)}
                            </div>
                          ) : null
                        ) : (
                          <div className="flat-list-container">
                            {renderFlatList(status.files)}
                          </div>
                        )
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

                  {/* Right Column: Git Graph (Consistency & Context) */}
                  <div className="split-column graph-column">
                    <div className="column-header">
                      <span className="column-header-title">Commit history graph</span>
                      <span className="git-branch-badge" style={{ fontSize: "0.72rem", padding: "2px 6px" }}>
                        {status.currentBranch}
                      </span>
                    </div>

                    <div className="graph-code-view">
                      <pre className="git-graph">
                        <code>{renderGitGraph(status.commitGraph)}</code>
                      </pre>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
