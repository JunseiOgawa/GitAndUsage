import React, { useState, useEffect, useRef, useCallback } from "react";
import { GitStatus } from "./types";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";

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

interface CommitInfo {
  hash: string;
  shortHash: string;
  author: string;
  email: string;
  date: string;
  relativeDate: string;
  message: string;
  refs: string[];
  parentHashes: string[];
}

// ===================================================
// HORIZONTAL GIT GRAPH COMPONENT
// ===================================================

const BRANCH_COLORS = [
  "#6366f1", // indigo
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#f97316", // orange
  "#ec4899", // pink
  "#84cc16", // lime
  "#14b8a6", // teal
];

interface GraphLayout {
  commits: CommitInfo[];
  lanes: number[]; // lane index per commit
  totalLanes: number;
  edges: Array<{ fromIdx: number; toIdx: number; fromLane: number; toLane: number; color: string }>;
}

function computeGraphLayout(commits: CommitInfo[]): GraphLayout {
  if (!commits.length) return { commits, lanes: [], totalLanes: 1, edges: [] };

  const hashToIdx = new Map<string, number>();
  commits.forEach((c, i) => hashToIdx.set(c.hash, i));

  // Assign lanes via a simple greedy approach
  const lanes: number[] = new Array(commits.length).fill(-1);
  const laneOwner: (string | null)[] = []; // which hash currently "owns" each lane

  // Track which lane is free
  const freeLane = (): number => {
    for (let i = 0; i < laneOwner.length; i++) {
      if (laneOwner[i] === null) return i;
    }
    laneOwner.push(null);
    return laneOwner.length - 1;
  };

  // Assign each commit a lane based on its first parent
  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i];

    // If a lane is already waiting for this commit, use that lane
    let lane = -1;
    for (let l = 0; l < laneOwner.length; l++) {
      if (laneOwner[l] === commit.hash) {
        lane = l;
        break;
      }
    }
    if (lane === -1) {
      lane = freeLane();
    }
    lanes[i] = lane;

    // Release this lane
    laneOwner[lane] = null;

    // The first parent continues in this lane
    const parents = commit.parentHashes.filter(h => hashToIdx.has(h));
    if (parents.length > 0) {
      // First parent takes this lane
      const firstParentHash = parents[0];
      // Check if first parent already has a lane
      const existingLane = laneOwner.indexOf(firstParentHash);
      if (existingLane === -1) {
        laneOwner[lane] = firstParentHash;
      }
      // Additional parents get new lanes
      for (let p = 1; p < parents.length; p++) {
        const ph = parents[p];
        const existing = laneOwner.indexOf(ph);
        if (existing === -1) {
          const nl = freeLane();
          laneOwner[nl] = ph;
        }
      }
    }
  }

  // Compute edges
  const edges: GraphLayout["edges"] = [];
  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i];
    for (const ph of commit.parentHashes) {
      const pi = hashToIdx.get(ph);
      if (pi !== undefined) {
        const color = BRANCH_COLORS[lanes[i] % BRANCH_COLORS.length];
        edges.push({ fromIdx: i, toIdx: pi, fromLane: lanes[i], toLane: lanes[pi], color });
      }
    }
  }

  const totalLanes = Math.max(...lanes, 0) + 1;
  return { commits, lanes, totalLanes, edges };
}

interface CommitTooltipProps {
  commit: CommitInfo;
  x: number;
  y: number;
  containerWidth: number;
  detail: {
    hash: string;
    shortHash: string;
    author: string;
    email: string;
    date: string;
    relativeDate: string;
    subject: string;
    body: string;
    files: Array<{ path: string; status: string }>;
  } | null;
  loading: boolean;
}

const CommitTooltip: React.FC<CommitTooltipProps> = ({ commit, x, y, containerWidth, detail, loading }) => {
  const tooltipWidth = 320;
  const leftPos = Math.min(x + 16, containerWidth - tooltipWidth - 8);

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch {
      return dateStr;
    }
  };

  const getStatusClass = (status: string) => {
    const s = status.trim().toUpperCase();
    if (s === "M") return "modified";
    if (s === "A") return "added";
    if (s === "D") return "deleted";
    return "other";
  };

  return (
    <div
      className="commit-tooltip"
      style={{
        left: `${leftPos}px`,
        top: `${y - 8}px`,
        width: `${tooltipWidth}px`,
      }}
    >
      {/* Refs / branch tags */}
      {commit.refs.length > 0 && (
        <div className="commit-tooltip-refs">
          {commit.refs.map((ref, i) => {
            const isHead = ref.includes("HEAD");
            const isRemote = ref.startsWith("origin/") || ref.includes("remote");
            return (
              <span
                key={i}
                className={`commit-tooltip-ref-tag ${isHead ? "head" : isRemote ? "remote" : "local"}`}
              >
                {ref}
              </span>
            );
          })}
        </div>
      )}

      {/* Commit message */}
      <div className="commit-tooltip-message">{commit.message}</div>

      {/* Author & date */}
      <div className="commit-tooltip-meta">
        <span className="commit-tooltip-author">{commit.author}</span>
        <span className="commit-tooltip-date">{commit.relativeDate || formatDate(commit.date)}</span>
      </div>

      {/* Dynamic Expansion: Work Details */}
      {(loading || detail) && (
        <div className="commit-tooltip-details-section">
          {loading ? (
            <div className="commit-details-loading-shimmer">
              <div className="shimmer-line short" />
              <div className="shimmer-line" />
              <div className="shimmer-line medium" />
            </div>
          ) : (
            detail && (
              <div className="commit-tooltip-expanded-content">
                {detail.body && (
                  <div className="commit-tooltip-body-text">{detail.body}</div>
                )}
                
                {detail.files && detail.files.length > 0 && (
                  <div className="commit-tooltip-files-area">
                    <div className="files-area-title">Changed Files ({detail.files.length}):</div>
                    <div className="files-list">
                      {detail.files.slice(0, 5).map((file, idx) => {
                        const parts = file.path.split(/[/\\]/);
                        const name = parts[parts.length - 1];
                        return (
                          <div key={idx} className="tooltip-file-item">
                            <span className={`file-status-dot ${getStatusClass(file.status)}`} title={file.status}>
                              {file.status}
                            </span>
                            <span className="tooltip-file-name" title={file.path}>{name}</span>
                            <span className="tooltip-file-path">{file.path}</span>
                          </div>
                        );
                      })}
                      {detail.files.length > 5 && (
                        <div className="tooltip-files-more">
                          + {detail.files.length - 5} more files
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          )}
        </div>
      )}

      {/* Hash */}
      <div className="commit-tooltip-hash">{commit.shortHash}</div>
    </div>
  );
};

interface HorizontalCommitGraphProps {
  repoPath: string;
}

const HorizontalCommitGraph: React.FC<HorizontalCommitGraphProps & { commits: CommitInfo[]; loading: boolean }> = ({ repoPath, commits, loading }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(400);

  // Detailed info caching and async loading states
  const [detailsCache, setDetailsCache] = useState<Record<string, any>>({});
  const [detailsLoading, setDetailsLoading] = useState<Record<string, boolean>>({});
  const [activeDetailsHash, setActiveDetailsHash] = useState<string | null>(null);
  const fetchTimeoutRef = useRef<any>(null);

  const ROW_HEIGHT = 32;
  const NODE_R = 5;
  const LANE_W = 18;
  const PADDING_LEFT = 12;
  const PADDING_RIGHT = 8;
  const SVG_MIN_HEIGHT = 40;

  // commits and loading are now managed by the parent (GitGraphPanel)
  // to avoid duplicate fetches and re-mount resets between tabs

  useEffect(() => {
    const obs = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => {
      obs.disconnect();
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
    };
  }, []);

  const layout = computeGraphLayout(commits);
  const svgWidth = PADDING_LEFT + layout.totalLanes * LANE_W + PADDING_RIGHT;
  const svgHeight = Math.max(SVG_MIN_HEIGHT, layout.commits.length * ROW_HEIGHT);

  const laneX = (lane: number) => PADDING_LEFT + lane * LANE_W + LANE_W / 2;
  const commitY = (idx: number) => idx * ROW_HEIGHT + ROW_HEIGHT / 2;

  // Edge path between two commits
  const edgePath = (fromIdx: number, toIdx: number, fromLane: number, toLane: number) => {
    const x1 = laneX(fromLane);
    const y1 = commitY(fromIdx);
    const x2 = laneX(toLane);
    const y2 = commitY(toIdx);

    if (fromLane === toLane) {
      return `M ${x1} ${y1} L ${x2} ${y2}`;
    }

    // Bezier curve for lane changes
    const midY = (y1 + y2) / 2;
    return `M ${x1} ${y1} C ${x1} ${midY} ${x2} ${midY} ${x2} ${y2}`;
  };

  const handleHoverStart = useCallback((idx: number, commitHash: string, clientX: number, clientY: number, isSvg: boolean, rowRect?: DOMRect) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = isSvg ? clientX - rect.left : svgWidth + 8;
    const y = isSvg ? clientY - rect.top : (rowRect ? rowRect.top - rect.top : clientY - rect.top);

    setTooltipPos({ x, y });
    setHoveredIdx(idx);
    setActiveDetailsHash(commitHash);

    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }

    // Debounce detail loading to avoid requests during rapid scrolling/swiping
    if (!detailsCache[commitHash]) {
      fetchTimeoutRef.current = setTimeout(() => {
        setDetailsLoading(prev => ({ ...prev, [commitHash]: true }));
        invoke<any>("get_commit_details", { repoPath, commitHash })
          .then(data => {
            setDetailsCache(prev => ({ ...prev, [commitHash]: data }));
            setDetailsLoading(prev => ({ ...prev, [commitHash]: false }));
          })
          .catch(err => {
            console.error("Failed to load commit details:", err);
            setDetailsLoading(prev => ({ ...prev, [commitHash]: false }));
          });
      }, 300);
    }
  }, [repoPath, detailsCache, svgWidth]);

  const handleHoverEnd = useCallback(() => {
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }
    setHoveredIdx(null);
    setActiveDetailsHash(null);
  }, []);

  if (loading) {
    return (
      <div className="commit-graph-loading">
        <div className="spinner" style={{ width: 20, height: 20 }} />
        <span>Loading graph…</span>
      </div>
    );
  }

  if (commits.length === 0) {
    return (
      <div className="commit-graph-empty">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
        </svg>
        <span>No commits found</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="horizontal-commit-graph"
      style={{ position: "relative" }}
      onMouseLeave={handleHoverEnd}
    >
      {/* SVG: graph lines and nodes */}
      <div className="commit-graph-svg-col" style={{ width: svgWidth, minWidth: svgWidth }}>
        <svg
          width={svgWidth}
          height={svgHeight}
          style={{ display: "block" }}
        >
          {/* Edges first (behind nodes) */}
          {layout.edges.map((edge, i) => (
            <path
              key={i}
              d={edgePath(edge.fromIdx, edge.toIdx, edge.fromLane, edge.toLane)}
              stroke={edge.color}
              strokeWidth={1.5}
              fill="none"
              opacity={hoveredIdx !== null && hoveredIdx !== edge.fromIdx && hoveredIdx !== edge.toIdx ? 0.3 : 0.7}
              style={{ transition: "opacity 0.15s" }}
            />
          ))}

          {/* Nodes */}
          {layout.commits.map((commit, idx) => {
            const cx = laneX(layout.lanes[idx]);
            const cy = commitY(idx);
            const color = BRANCH_COLORS[layout.lanes[idx] % BRANCH_COLORS.length];
            const isHovered = hoveredIdx === idx;
            const hasRefs = commit.refs.length > 0;

            return (
              <g key={commit.hash}>
                {/* Glow ring on hover */}
                {isHovered && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={NODE_R + 5}
                    fill={color}
                    opacity={0.2}
                    style={{ transition: "r 0.15s, opacity 0.15s" }}
                  />
                )}
                {/* Outer ring */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={hasRefs ? (isHovered ? NODE_R + 3 : NODE_R + 1.5) : (isHovered ? NODE_R + 2.5 : NODE_R)}
                  fill={isHovered ? color : "var(--bg-canvas)"}
                  stroke={color}
                  strokeWidth={hasRefs ? 2 : 1.5}
                  style={{
                    cursor: "pointer",
                    transition: "r 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), fill 0.2s",
                    filter: isHovered ? `drop-shadow(0 0 5px ${color})` : "none",
                  }}
                  onMouseMove={(e) => handleHoverStart(idx, commit.hash, e.clientX, e.clientY, true)}
                  onMouseLeave={handleHoverEnd}
                />
                {/* Inner dot */}
                {hasRefs && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isHovered ? 4 : 3}
                    fill={isHovered ? "var(--bg-canvas)" : color}
                    style={{ pointerEvents: "none", transition: "r 0.2s, fill 0.2s" }}
                  />
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Commit list rows — positioned to align with SVG rows */}
      <div
        className="commit-graph-rows"
        style={{ height: svgHeight }}
      >
        {layout.commits.map((commit, idx) => {
          const isHovered = hoveredIdx === idx;
          const color = BRANCH_COLORS[layout.lanes[idx] % BRANCH_COLORS.length];

          return (
            <div
              key={commit.hash}
              className={`commit-row ${isHovered ? "hovered" : ""}`}
              style={{ height: ROW_HEIGHT, borderLeft: isHovered ? `2px solid ${color}` : "2px solid transparent" }}
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                handleHoverStart(idx, commit.hash, 0, 0, false, rect);
              }}
              onMouseLeave={handleHoverEnd}
            >
              {/* Ref tags */}
              {commit.refs.map((ref, ri) => {
                const isHead = ref.includes("HEAD");
                const isRemote = ref.startsWith("origin/") || ref.includes("/");
                return (
                  <span
                    key={ri}
                    className={`commit-ref-tag ${isHead ? "head" : isRemote ? "remote" : "local"}`}
                  >
                    {isHead ? "HEAD" : ref.length > 12 ? ref.slice(0, 12) + "…" : ref}
                  </span>
                );
              })}

              {/* Message */}
              <span className="commit-message-text">{commit.message}</span>

              {/* Author + time (faded) */}
              <span className="commit-meta-inline">
                <span className="commit-author-inline">{commit.author.split(" ")[0]}</span>
                <span className="commit-date-inline">{commit.relativeDate}</span>
              </span>
            </div>
          );
        })}
      </div>

      {/* Hover tooltip */}
      {hoveredIdx !== null && activeDetailsHash && (
        <CommitTooltip
          commit={layout.commits[hoveredIdx]}
          x={tooltipPos.x}
          y={tooltipPos.y}
          containerWidth={containerWidth}
          detail={detailsCache[activeDetailsHash] || null}
          loading={!!detailsLoading[activeDetailsHash]}
        />
      )}
    </div>
  );
};

// ===================================================
// RESIZER COMPONENT
// ===================================================

interface ResizerProps {
  onDrag: (delta: number) => void;
  direction?: "horizontal" | "vertical";
}

const Resizer: React.FC<ResizerProps> = ({ onDrag, direction = "horizontal" }) => {
  const isDragging = useRef(false);
  const lastPos = useRef(0);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    lastPos.current = direction === "horizontal" ? e.clientX : e.clientY;
    document.body.style.cursor = direction === "horizontal" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const pos = direction === "horizontal" ? ev.clientX : ev.clientY;
      const delta = pos - lastPos.current;
      lastPos.current = pos;
      onDrag(delta);
    };

    const onUp = () => {
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div
      className={`panel-resizer ${direction}`}
      onMouseDown={onMouseDown}
      title="Drag to resize"
    >
      <div className="resizer-handle" />
    </div>
  );
};

// ===================================================
// MAIN COMPONENT
// ===================================================

export const GitGraphPanel: React.FC<GitGraphPanelProps> = ({
  status,
  loading,
  error,
  onOpenFolder,
  repoPath,
  onRefresh,
}) => {
  const { t } = useTranslation();
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [openBranchFolders, setOpenBranchFolders] = useState<Record<string, boolean>>({
    "Local": true,
    "Remote": true,
  });
  const [activeTab, setActiveTab] = useState<"branches" | "changes">("branches");
  const [changesView, setChangesView] = useState<"tree" | "list">("tree");
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  // Shared commit data — fetched once, reused across both tabs
  const [sharedCommits, setSharedCommits] = useState<CommitInfo[]>([]);
  const [commitsLoading, setCommitsLoading] = useState(true);

  // Panel split sizes (percent for branch column)
  const [branchPct, setBranchPct] = useState(38); // branch panel width percent in branches tab
  const [changesPct, setChangesPct] = useState(42); // changes panel width percent in changes tab
  const splitContainerRef = useRef<HTMLDivElement>(null);

  const handleBranchResize = useCallback((delta: number) => {
    if (!splitContainerRef.current) return;
    const total = splitContainerRef.current.offsetWidth;
    if (total === 0) return;
    const deltaPct = (delta / total) * 100;
    setBranchPct(prev => Math.max(20, Math.min(70, prev + deltaPct)));
  }, []);

  const handleChangesResize = useCallback((delta: number) => {
    if (!splitContainerRef.current) return;
    const total = splitContainerRef.current.offsetWidth;
    if (total === 0) return;
    const deltaPct = (delta / total) * 100;
    setChangesPct(prev => Math.max(20, Math.min(70, prev + deltaPct)));
  }, []);

  // Fetch commit log once when repoPath changes
  useEffect(() => {
    if (!repoPath) return;
    setCommitsLoading(true);
    invoke<CommitInfo[]>("get_commit_log", { repoPath })
      .then((data) => {
        setSharedCommits(data);
        setCommitsLoading(false);
      })
      .catch((err) => {
        console.error("Failed to get commit log:", err);
        setCommitsLoading(false);
      });
  }, [repoPath]);

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

  const isNotGitRepo = !status || !status.repoName || status.repoName === "Not a Git Repository";
  const fileTree = status?.files ? buildTree(status.files) : null;
  const branchTree = status?.branches ? buildBranchTree(status.branches, status.currentBranch) : null;

  return (
    <div className="left-panel">
      {/* Workspace Outer Container combining Vertical Tabs & Content Body */}
      <div className="git-workspace-layout-container">
        {/* Left Side: Premium Vertical Tabs */}
        <div className="git-workspace-vertical-tabs">
          <button 
            className={`git-workspace-tab-btn ${activeTab === "branches" || isNotGitRepo ? "active" : ""}`}
            onClick={() => !isNotGitRepo && setActiveTab("branches")}
            title={`${t("git.branches")} & ${t("git.historyGraph")}`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="6" y1="3" x2="6" y2="15" />
              <circle cx="18" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <path d="M18 9a9 9 0 0 1-9 9" />
            </svg>
            <span className="tab-label">{t("git.branches")}</span>
          </button>
          {!isNotGitRepo && (
            <button 
              className={`git-workspace-tab-btn ${activeTab === "changes" ? "active" : ""}`}
              onClick={() => setActiveTab("changes")}
              title={`${t("git.changes")} (${status?.files?.length || 0})`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              {status?.files && status.files.length > 0 && (
                <span className="tab-badge">{status.files.length}</span>
              )}
              <span className="tab-label">{t("git.changes")}</span>
            </button>
          )}
        </div>

        {/* Right Side: Main Content Viewport */}
        <div className="canvas-body">
          {loading && !status ? (
            <div className="fallback-screen">
              <div className="spinner"></div>
              <p style={{ marginTop: "16px" }}>{t("git.analyzing")}</p>
            </div>
          ) : (
            <div className="split-view-container" ref={splitContainerRef}>
              {checkoutLoading && (
                <div className="checkout-overlay">
                  <div className="spinner"></div>
                  <p style={{ marginTop: "12px", fontSize: "0.85rem", fontWeight: 500 }}>
                    {t("git.switchingBranch")}
                  </p>
                </div>
              )}

              {isNotGitRepo || activeTab === "branches" ? (
                /* =========================================
                   BRANCHES TAB VIEW or NOT A REPO VIEW
                   ========================================= */
                <>
                  {/* Left Column: Branch Tree Switcher / Open Folder */}
                  <div
                    className="split-column tree-column branch-switcher-column"
                    style={{ flex: isNotGitRepo ? "1 1 100%" : `0 0 ${branchPct}%`, maxWidth: isNotGitRepo ? "100%" : `${branchPct}%` }}
                  >
                    <div className="column-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", overflow: "hidden" }}>
                        <span className="column-header-title">{t("git.branches")}</span>
                        
                        {/* Display repository/folder name directly next to 'Branches' when open */}
                        {!isNotGitRepo && status?.repoName && (
                          <span className="git-repo-name-badge" style={{ 
                            fontSize: "0.68rem", 
                            color: "var(--text-secondary)", 
                            background: "rgba(255, 255, 255, 0.03)", 
                            border: "1px solid rgba(255, 255, 255, 0.05)", 
                            padding: "1px 5px", 
                            borderRadius: "3px",
                            fontFamily: "var(--font-sans)",
                            fontWeight: 500,
                            maxWidth: "110px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap"
                          }} title={status.repoName}>
                            {status.repoName}
                          </span>
                        )}

                        {/* Display active branch badge directly next to Branches */}
                        {!isNotGitRepo && status?.currentBranch && (
                          <span className="git-branch-badge-pill" style={{ marginLeft: "2px" }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: "3px" }}>
                              <line x1="6" y1="3" x2="6" y2="15" />
                              <circle cx="18" cy="6" r="3" />
                              <circle cx="6" cy="18" r="3" />
                              <path d="M18 9a9 9 0 0 1-9 9" />
                            </svg>
                            {status.currentBranch}
                          </span>
                        )}

                        {/* Display Open Folder button right next to Branches when not a repo */}
                        {isNotGitRepo && (
                          <button 
                            onClick={onOpenFolder}
                            className="open-folder-btn"
                            title={t("git.openFolder")}
                            style={{ margin: 0, padding: "2px 6px", fontSize: "0.7rem", height: "18px" }}
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: "3px" }}>
                              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                            </svg>
                            {t("git.openFolder")}
                          </button>
                        )}
                      </div>

                      {/* Display a small Open Folder button on the far right if a repo is open */}
                      {!isNotGitRepo && (
                        <button 
                          onClick={onOpenFolder}
                          className="open-folder-btn icon-only"
                          title={t("git.openFolder")}
                          style={{ margin: 0, padding: "4px", display: "flex", alignItems: "center", justifyContent: "center" }}
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                          </svg>
                        </button>
                      )}
                    </div>

                    <div className="tree-viewport branch-tree-viewport">
                      {isNotGitRepo ? (
                        <div className="tree-empty-state" style={{ padding: "40px 24px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" style={{ marginBottom: "16px" }}>
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                          </svg>
                          <h3 style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "8px" }}>
                            {t("git.notARepo")}
                          </h3>
                          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", maxWidth: "280px", margin: 0, lineHeight: "1.5" }}>
                            {t("git.notARepoDesc")}
                          </p>
                          {error && (
                            <p style={{ marginTop: "12px", color: "var(--color-danger)", fontSize: "0.75rem", fontFamily: "var(--font-mono)" }}>
                              {error}
                            </p>
                          )}
                        </div>
                      ) : branchTree && Object.keys(branchTree.children).length > 0 ? (
                        <div className="tree-root-container branch-tree-root">
                          {renderBranchNode(branchTree)}
                        </div>
                      ) : (
                        <div className="tree-empty-state">
                          <span>{t("git.noBranches")}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {!isNotGitRepo && (
                    <>
                      {/* Resizer */}
                      <Resizer onDrag={handleBranchResize} />

                      {/* Right Column: Horizontal Git Graph */}
                      <div
                        className="split-column graph-column branch-graph-column"
                        style={{ flex: `1 1 0`, minWidth: 0, maxWidth: "none" }}
                      >
                        <div className="column-header">
                          <div className="column-title-text">
                            <span className="column-header-title">{t("git.historyGraph")}</span>
                          </div>
                          
                          <div style={{ display: "flex", gap: "6px" }}>
                            {status.ahead > 0 && <span className="git-sync-badge ahead">{t("git.ahead", { count: status.ahead })}</span>}
                            {status.behind > 0 && <span className="git-sync-badge behind">{t("git.behind", { count: status.behind })}</span>}
                          </div>
                        </div>

                        <div className="graph-code-view" style={{ padding: 0, overflow: "auto" }}>
                          <HorizontalCommitGraph repoPath={repoPath} commits={sharedCommits} loading={commitsLoading} />
                        </div>
                      </div>
                    </>
                  )}
                </>
              ) : (
                /* =========================================
                   CHANGES TAB VIEW (Split: File Tree/List on Left, Graph on Right)
                   ========================================= */
                <>
                  {/* Left Column: File Tree or List view */}
                  <div
                    className="split-column tree-column"
                    style={{ flex: `0 0 ${changesPct}%`, maxWidth: `${changesPct}%` }}
                  >
                    <div className="column-header">
                      <div className="column-title-text">
                        <span className="column-header-title">{t("git.changes")} ({status.files ? status.files.length : 0})</span>
                        <div className="view-toggle-buttons">
                          <button 
                            className={`view-toggle-btn ${changesView === "tree" ? "active" : ""}`}
                            onClick={() => setChangesView("tree")}
                            title={t("git.treeView")}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                            </svg>
                          </button>
                          <button 
                            className={`view-toggle-btn ${changesView === "list" ? "active" : ""}`}
                            onClick={() => setChangesView("list")}
                            title={t("git.flatListView")}
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
                          <span>{t("git.noChanges")}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Resizer */}
                  <Resizer onDrag={handleChangesResize} />

                  {/* Right Column: Horizontal Git Graph (shared instance, visibility toggled by parent) */}
                  <div
                    className="split-column graph-column"
                    style={{ flex: `1 1 0`, minWidth: 0, maxWidth: "none" }}
                  >
                    <div className="column-header">
                      <span className="column-header-title">{t("git.historyGraphChanges")}</span>
                      <span className="git-branch-badge" style={{ fontSize: "0.72rem", padding: "2px 6px" }}>
                        {status.currentBranch}
                      </span>
                    </div>

                    <div className="graph-code-view" style={{ padding: 0, overflow: "auto" }}>
                      <HorizontalCommitGraph repoPath={repoPath} commits={sharedCommits} loading={commitsLoading} />
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
