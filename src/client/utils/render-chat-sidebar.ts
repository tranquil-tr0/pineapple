import { html, nothing } from "lit";
import type {
  GitCommitSummary,
  GitFileChange,
  GitStatusSnapshot,
} from "./session-actions.js";

type SidebarFilterMode = "no-tools" | "user-only" | "all";

type SidebarRole = "user" | "assistant" | "tool";

interface SidebarEntry {
  role: SidebarRole;
  text: string;
  targetId: string;
}

export interface ActiveSessionItem {
  id: string;
  name: string;
  attached: boolean;
  activeHere: boolean;
}

export interface GitDiffRequest {
  scope: "staged" | "unstaged" | "commit";
  path: string;
  sha?: string;
  title: string;
}

interface RenderChatSidebarOptions {
  search: string;
  filter: SidebarFilterMode;
  entries: SidebarEntry[];
  activeSessions: ActiveSessionItem[];
  gitStatus: GitStatusSnapshot | null;
  gitCommits: GitCommitSummary[];
  selectedCommitSha: string;
  selectedCommitFiles: GitFileChange[];
  gitLoading: boolean;
  gitError: string;
  diffOpen: boolean;
  diffTitle: string;
  diffText: string;
  diffLoading: boolean;
  onSearchInput: (event: InputEvent) => void;
  onSelectFilter: (mode: SidebarFilterMode) => void;
  onFocusMessage: (targetId: string) => void;
  onRefreshGit: () => void;
  onSelectCommit: (sha: string) => void;
  onCloseCommit: () => void;
  onOpenDiff: (request: GitDiffRequest) => void;
  onCloseDiff: () => void;
}

const SIDEBAR_FILTERS: Array<[SidebarFilterMode, string]> = [
  ["no-tools", "No-tools"],
  ["user-only", "User"],
  ["all", "All"],
];

export function renderChatSidebar({
  search,
  filter,
  entries,
  activeSessions,
  gitStatus,
  gitCommits,
  selectedCommitSha,
  selectedCommitFiles,
  gitLoading,
  gitError,
  diffOpen,
  diffTitle,
  diffText,
  diffLoading,
  onSearchInput,
  onSelectFilter,
  onFocusMessage,
  onRefreshGit,
  onSelectCommit,
  onCloseCommit,
  onOpenDiff,
  onCloseDiff,
}: RenderChatSidebarOptions) {
  const selectedCommit = gitCommits.find((commit) => commit.hash === selectedCommitSha) || null;

  return html`
    <aside class="cv-sidebar" aria-label="Message history and git status">
      <div class="cv-sidebar-git">
        <div class="cv-sidebar-git-header">
          <span>Git</span>
          <button class="cv-git-refresh-btn" @click=${onRefreshGit} ?disabled=${gitLoading}>↻</button>
        </div>

        ${gitError
          ? html`<div class="cv-git-empty">${gitError}</div>`
          : gitStatus && !gitStatus.isRepo
            ? html`<div class="cv-git-empty">Not a git repository</div>`
            : !gitStatus
              ? html`<div class="cv-git-empty">Loading git status…</div>`
              : html`
                  <div class="cv-git-meta" title=${gitStatus.head || ""}>
                    <span class="cv-git-branch">${gitStatus.branch || "detached"}</span>
                    ${gitStatus.head
                      ? html`<span class="cv-git-head">${gitStatus.head.slice(0, 12)}</span>`
                      : nothing}
                  </div>

                  ${selectedCommit
                    ? html`
                        <div class="cv-git-section">
                          <div class="cv-git-section-header">
                            <span>Commit ${selectedCommit.shortHash}</span>
                            <button class="cv-git-clear-btn" @click=${onCloseCommit}>×</button>
                          </div>
                          <div class="cv-git-file-list">
                            ${selectedCommitFiles.length === 0
                              ? html`<div class="cv-git-empty">No changed files in commit</div>`
                              : selectedCommitFiles.map((change) =>
                                  renderGitFileRow(change, () =>
                                    onOpenDiff({
                                      scope: "commit",
                                      sha: selectedCommit.hash,
                                      path: change.path,
                                      title: `${selectedCommit.shortHash} · ${renderGitPath(change)}`,
                                    }),
                                  ),
                                )}
                          </div>
                        </div>
                      `
                    : html`
                        <div class="cv-git-section">
                          <div class="cv-git-section-header">Staged</div>
                          <div class="cv-git-file-list">
                            ${gitStatus.staged.length === 0
                              ? html`<div class="cv-git-empty">No staged files</div>`
                              : gitStatus.staged.map((change) =>
                                  renderGitFileRow(change, () =>
                                    onOpenDiff({
                                      scope: "staged",
                                      path: change.path,
                                      title: `staged · ${renderGitPath(change)}`,
                                    }),
                                  ),
                                )}
                          </div>
                        </div>

                        <div class="cv-git-section">
                          <div class="cv-git-section-header">Unstaged</div>
                          <div class="cv-git-file-list">
                            ${gitStatus.unstaged.length === 0
                              ? html`<div class="cv-git-empty">No unstaged files</div>`
                              : gitStatus.unstaged.map((change) =>
                                  renderGitFileRow(change, () =>
                                    onOpenDiff({
                                      scope: "unstaged",
                                      path: change.path,
                                      title: `unstaged · ${renderGitPath(change)}`,
                                    }),
                                  ),
                                )}
                          </div>
                        </div>
                      `}

                  <div class="cv-git-section cv-git-commits">
                    <div class="cv-git-section-header">Recent commits</div>
                    <div class="cv-git-commit-list">
                      ${gitCommits.length === 0
                        ? html`<div class="cv-git-empty">No commits</div>`
                        : gitCommits.map(
                            (commit) => html`
                              <button
                                class="cv-git-commit-row ${selectedCommitSha === commit.hash ? "selected" : ""}"
                                @click=${() => onSelectCommit(commit.hash)}
                                title=${`${commit.hash} ${commit.subject}`}
                              >
                                <span class="cv-git-commit-sha">${commit.shortHash}</span>
                                <span class="cv-git-commit-subject">${commit.subject || "(no subject)"}</span>
                              </button>
                            `,
                          )}
                    </div>
                  </div>
                `}
      </div>

      <div class="cv-sidebar-controls">
        <input
          class="cv-sidebar-search"
          placeholder="Search..."
          .value=${search}
          @input=${onSearchInput}
        />
        <div class="cv-sidebar-filters">
          ${SIDEBAR_FILTERS.map(
            ([mode, label]) => html`
              <button
                class="cv-filter-btn ${filter === mode ? "active" : ""}"
                @click=${() => onSelectFilter(mode)}
              >
                ${label}
              </button>
            `,
          )}
        </div>
      </div>

      <div class="cv-tree-container">
        ${entries.map(
          (entry) => html`
            <button
              class="cv-tree-node cv-tree-role-${entry.role}"
              @click=${() => onFocusMessage(entry.targetId)}
              title=${entry.text}
            >
              <span class="cv-tree-marker">•</span>
              <span class="cv-tree-role-label">${entry.role}:</span>
              <span class="cv-tree-text">${entry.text}</span>
            </button>
          `,
        )}
      </div>

      ${activeSessions.length > 0
        ? html`
            <div class="cv-sidebar-sessions">
              <div class="cv-sidebar-sessions-header">Sessions</div>
              ${activeSessions.map(
                (s) => html`
                  <a class="cv-sidebar-session-item" href="#/session/${s.id}">
                    ${s.attached
                      ? html`<span class="cv-sidebar-session-dot active"></span>`
                      : s.activeHere
                        ? html`<span class="cv-sidebar-session-dot idle"></span>`
                        : nothing}
                    <span class="cv-sidebar-session-name">${s.name}</span>
                  </a>
                `,
              )}
            </div>
          `
        : nothing}
    </aside>

    ${diffOpen
      ? html`
          <div class="cv-extension-modal-backdrop" @click=${onCloseDiff}></div>
          <div class="cv-extension-modal cv-git-diff-modal" role="dialog" aria-modal="true">
            <div class="cv-extension-modal-title">${diffTitle}</div>
            <div class="cv-extension-modal-body">
              ${diffLoading
                ? html`<div class="cv-git-empty">Loading diff…</div>`
                : diffText.trim().length === 0
                  ? html`<div class="cv-git-empty">No textual diff available</div>`
                  : renderDiff(diffText)}
            </div>
            <div class="cv-extension-modal-actions">
              <button class="cv-extension-btn" @click=${onCloseDiff}>Close</button>
            </div>
          </div>
        `
      : nothing}
  `;
}

function renderGitFileRow(change: GitFileChange, onClick: () => void) {
  return html`
    <button class="cv-git-file-row" @click=${onClick} title=${renderGitPath(change)}>
      <span class="cv-git-status ${gitStatusClass(change.status)}">${change.status}</span>
      <span class="cv-git-path">${renderGitPath(change)}</span>
    </button>
  `;
}

function renderGitPath(change: GitFileChange): string {
  if (change.oldPath && change.oldPath !== change.path) {
    return `${change.oldPath} → ${change.path}`;
  }
  return change.path;
}

function gitStatusClass(status: GitFileChange["status"]): string {
  switch (status) {
    case "A":
      return "cv-git-status-added";
    case "D":
      return "cv-git-status-deleted";
    case "M":
    case "R":
    case "C":
    case "U":
    case "?":
    default:
      return "cv-git-status-changed";
  }
}

function renderDiff(diff: string) {
  const lines = diff.split("\n");
  return html`
    <div class="tool-diff">
      ${lines.map((line) => {
        const cls =
          line.startsWith("+") && !line.startsWith("+++")
            ? "diff-added"
            : line.startsWith("-") && !line.startsWith("---")
              ? "diff-removed"
              : "diff-context";
        return html`<div class=${cls}>${line || " "}</div>`;
      })}
    </div>
  `;
}
