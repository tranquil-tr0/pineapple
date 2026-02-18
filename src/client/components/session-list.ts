import { LitElement, html, css, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { SessionMeta } from "@shared/types.js";

@customElement("session-list")
export class SessionList extends LitElement {
  @state() private sessions: SessionMeta[] = [];
  @state() private loading = true;
  @state() private error = "";
  @state() private contextMenuSessionId: string | null = null;
  @state() private contextMenuPos = { x: 0, y: 0 };
  @state() private renamingId: string | null = null;
  @state() private renameValue = "";

  private longPressTimer: ReturnType<typeof setTimeout> | null = null;

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--bg);
    }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
      background: var(--surface);
      flex-shrink: 0;
    }

    header h1 {
      font-size: 1.25rem;
      font-weight: 600;
    }

    .new-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      background: var(--accent);
      color: white;
      border: none;
      border-radius: var(--radius);
      font-size: 0.9rem;
      font-weight: 500;
      cursor: pointer;
      min-height: 44px;
      min-width: 44px;
    }

    .new-btn:hover {
      background: var(--accent-hover);
    }

    .list {
      flex: 1;
      overflow-y: auto;
      padding: 8px 0;
    }

    .session-item {
      display: block;
      padding: 14px 20px;
      border-bottom: 1px solid var(--border);
      cursor: pointer;
      text-decoration: none;
      color: inherit;
      user-select: none;
      -webkit-user-select: none;
      -webkit-touch-callout: none;
    }

    .session-item:hover {
      background: var(--surface);
    }

    .session-item:active {
      background: var(--surface-alt);
    }

    .session-name {
      font-weight: 600;
      font-size: 1rem;
      margin-bottom: 4px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .session-meta {
      font-size: 0.85rem;
      color: var(--text-secondary);
    }

    .rename-input {
      font-weight: 600;
      font-size: 1rem;
      padding: 2px 6px;
      border: 2px solid var(--accent);
      border-radius: 4px;
      background: var(--bg);
      color: var(--text-primary);
      width: 100%;
      outline: none;
      font-family: inherit;
    }

    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex: 1;
      color: var(--text-secondary);
      gap: 12px;
      padding: 40px;
      text-align: center;
    }

    .empty-icon {
      font-size: 2rem;
      opacity: 0.5;
    }

    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      flex: 1;
      color: var(--text-secondary);
    }

    .error-banner {
      padding: 12px 20px;
      background: var(--error-bg);
      color: var(--error);
      font-size: 0.9rem;
    }

    /* Context menu */
    .context-menu {
      position: fixed;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow-lg);
      z-index: 1000;
      min-width: 140px;
      padding: 4px 0;
    }

    .context-menu button {
      display: block;
      width: 100%;
      padding: 10px 16px;
      border: none;
      background: none;
      color: var(--text-primary);
      font-size: 0.9rem;
      text-align: left;
      cursor: pointer;
      font-family: inherit;
    }

    .context-menu button:hover {
      background: var(--surface-alt);
    }

    .context-menu .danger {
      color: var(--error);
    }

    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 999;
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    this.loadSessions();
  }

  private async loadSessions() {
    this.loading = true;
    this.error = "";
    try {
      const res = await fetch("/api/sessions");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this.sessions = data.sessions;
    } catch (e) {
      this.error = `Failed to load sessions: ${e}`;
    } finally {
      this.loading = false;
    }
  }

  private async createSession() {
    try {
      const res = await fetch("/api/sessions", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      window.location.hash = `#/session/${data.id}`;
    } catch (e) {
      this.error = `Failed to create session: ${e}`;
    }
  }

  private openSession(id: string) {
    if (this.renamingId || this.contextMenuSessionId) return;
    window.location.hash = `#/session/${id}`;
  }

  // ---- Context menu ----

  private showContextMenu(id: string, x: number, y: number) {
    this.contextMenuSessionId = id;
    this.contextMenuPos = { x, y };
  }

  private closeContextMenu() {
    this.contextMenuSessionId = null;
  }

  private onContextMenu(e: MouseEvent, id: string) {
    e.preventDefault();
    this.showContextMenu(id, e.clientX, e.clientY);
  }

  private onTouchStart(e: TouchEvent, id: string) {
    const touch = e.touches[0];
    this.longPressTimer = setTimeout(() => {
      this.showContextMenu(id, touch.clientX, touch.clientY);
    }, 500);
  }

  private onTouchEnd() {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  // ---- Rename ----

  private startRename() {
    const session = this.sessions.find(
      (s) => s.id === this.contextMenuSessionId,
    );
    if (session) {
      this.renamingId = session.id;
      this.renameValue = session.name;
    }
    this.closeContextMenu();
  }

  private async commitRename() {
    if (!this.renamingId) return;
    const name = this.renameValue.trim();
    if (!name) {
      this.renamingId = null;
      return;
    }
    try {
      await fetch(`/api/sessions/${this.renamingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const s = this.sessions.find((s) => s.id === this.renamingId);
      if (s) s.name = name;
      this.requestUpdate();
    } catch {
      // ignore
    }
    this.renamingId = null;
  }

  private onRenameKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      this.commitRename();
    } else if (e.key === "Escape") {
      this.renamingId = null;
    }
  }

  // ---- Delete ----

  private async deleteSession() {
    const id = this.contextMenuSessionId;
    this.closeContextMenu();
    if (!id) return;
    if (!confirm("Delete this session?")) return;

    try {
      await fetch(`/api/sessions/${id}`, { method: "DELETE" });
      this.sessions = this.sessions.filter((s) => s.id !== id);
    } catch {
      // ignore
    }
  }

  // ---- Render ----

  render() {
    return html`
      <header>
        <h1>Pi Web UI</h1>
        <button class="new-btn" @click=${this.createSession}>+ New</button>
      </header>

      ${this.error ? html`<div class="error-banner">${this.error}</div>` : nothing}

      ${this.loading
        ? html`<div class="loading">Loading sessions...</div>`
        : this.sessions.length === 0
          ? html`
              <div class="empty">
                <div class="empty-icon">&#128172;</div>
                <div>No sessions yet</div>
                <div>Start a new session to begin</div>
              </div>
            `
          : html`
              <div class="list">
                ${this.sessions.map((s) => this.renderSession(s))}
              </div>
            `}

      ${this.contextMenuSessionId !== null
        ? html`
            <div class="backdrop" @click=${this.closeContextMenu}></div>
            <div
              class="context-menu"
              style="left:${this.contextMenuPos.x}px;top:${this.contextMenuPos.y}px"
            >
              <button @click=${this.startRename}>Rename</button>
              <button class="danger" @click=${this.deleteSession}>Delete</button>
            </div>
          `
        : nothing}
    `;
  }

  private renderSession(s: SessionMeta) {
    const isRenaming = this.renamingId === s.id;
    return html`
      <div
        class="session-item"
        @click=${() => this.openSession(s.id)}
        @contextmenu=${(e: MouseEvent) => this.onContextMenu(e, s.id)}
        @touchstart=${(e: TouchEvent) => this.onTouchStart(e, s.id)}
        @touchend=${this.onTouchEnd}
        @touchcancel=${this.onTouchEnd}
      >
        ${isRenaming
          ? html`
              <input
                class="rename-input"
                .value=${this.renameValue}
                @input=${(e: InputEvent) =>
                  (this.renameValue = (e.target as HTMLInputElement).value)}
                @keydown=${this.onRenameKeydown}
                @blur=${this.commitRename}
                @click=${(e: Event) => e.stopPropagation()}
              />
            `
          : html`<div class="session-name">${s.name}</div>`}
        <div class="session-meta">
          ${s.messageCount} messages &middot; ${relativeTime(s.lastActivityAt)}
        </div>
      </div>
    `;
  }

  updated() {
    // Auto-focus rename input
    if (this.renamingId) {
      const input = this.shadowRoot?.querySelector(
        ".rename-input",
      ) as HTMLInputElement;
      if (input) {
        input.focus();
        input.select();
      }
    }
  }
}

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = now - then;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
