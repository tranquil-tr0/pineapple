import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state, query } from "lit/decorators.js";
import type {
  ClientMessage,
  ServerMessage,
  ModelInfo,
  ThinkingLevel,
  AgentMessageData,
} from "@shared/types.js";
import type { MessageList } from "./message-list.js";

@customElement("chat-view")
export class ChatView extends LitElement {
  @property({ type: String }) sessionId = "";

  @state() private messages: AgentMessageData[] = [];
  @state() private isStreaming = false;
  @state() private streamingText = "";
  @state() private streamingThinking = "";
  @state() private currentModel = "";
  @state() private currentProvider = "";
  @state() private currentThinkingLevel: ThinkingLevel = "off";
  @state() private models: ModelInfo[] = [];
  @state() private settingsOpen = false;
  @state() private sessionName = "Session";
  @state() private connected = false;
  @state() private reconnecting = false;
  @state() private error = "";
  @state() private renamingName = false;
  @state() private editName = "";

  @query("message-list") private messageList!: MessageList;

  private ws: WebSocket | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldAutoScroll = true;

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
      gap: 12px;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
      background: var(--surface);
      flex-shrink: 0;
      min-height: 56px;
    }

    .back-btn, .settings-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border: none;
      background: none;
      cursor: pointer;
      border-radius: var(--radius);
      color: var(--text-primary);
      font-size: 1.2rem;
      flex-shrink: 0;
    }

    .back-btn:hover, .settings-btn:hover {
      background: var(--surface-alt);
    }

    .session-title {
      flex: 1;
      font-weight: 600;
      font-size: 1rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-align: center;
      cursor: pointer;
      min-width: 0;
    }

    .session-title:hover {
      color: var(--accent);
    }

    .title-input {
      flex: 1;
      font-weight: 600;
      font-size: 1rem;
      padding: 4px 8px;
      border: 2px solid var(--accent);
      border-radius: 4px;
      background: var(--bg);
      color: var(--text-primary);
      outline: none;
      font-family: inherit;
      min-width: 0;
    }

    message-list {
      flex: 1;
      min-height: 0;
    }

    .banner {
      padding: 8px 16px;
      text-align: center;
      font-size: 0.85rem;
      flex-shrink: 0;
    }

    .banner.reconnecting {
      background: #fef3cd;
      color: #856404;
    }

    .banner.error {
      background: var(--error-bg);
      color: var(--error);
    }

    .banner.connected {
      background: #d4edda;
      color: #155724;
      animation: fadeOut 2s ease 1s forwards;
    }

    @keyframes fadeOut {
      to { opacity: 0; height: 0; padding: 0; overflow: hidden; }
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    this.connect();
    this.loadSessionName();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.cleanup();
  }

  // Re-connect when session ID changes
  updated(changed: Map<string, unknown>) {
    if (changed.has("sessionId") && changed.get("sessionId") !== undefined) {
      this.cleanup();
      this.messages = [];
      this.streamingText = "";
      this.streamingThinking = "";
      this.connect();
      this.loadSessionName();
    }
  }

  // ---- WebSocket ----

  private connect() {
    if (this.ws) this.cleanup();

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/api/sessions/${this.sessionId}/ws`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.connected = true;
      this.reconnecting = false;
      this.reconnectAttempt = 0;
      this.error = "";
      // Request available models
      this.wsSend({ type: "get_available_models" });
    };

    this.ws.onmessage = (ev) => {
      this.handleServerMessage(JSON.parse(ev.data) as ServerMessage);
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.connected = false;
    };
  }

  private cleanup() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }

  private scheduleReconnect() {
    this.reconnecting = true;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempt, 30000);
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private wsSend(msg: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  // ---- Message handling ----

  private handleServerMessage(msg: ServerMessage) {
    switch (msg.type) {
      case "state":
        this.messages = msg.messages || [];
        this.isStreaming = msg.isStreaming;
        if (msg.model) {
          this.currentProvider = msg.model.provider;
          this.currentModel = msg.model.id;
        }
        this.currentThinkingLevel = (msg.thinkingLevel as ThinkingLevel) || "off";
        this.scheduleScroll();
        break;

      case "agent_event":
        this.handleAgentEvent(msg.event);
        break;

      case "available_models":
        this.models = msg.models;
        break;

      case "error":
        this.error = msg.message;
        break;
    }
  }

  private handleAgentEvent(event: { type: string; [key: string]: unknown }) {
    switch (event.type) {
      case "agent_start":
        this.isStreaming = true;
        this.streamingText = "";
        this.streamingThinking = "";
        break;

      case "agent_end":
        this.finalizeStreaming();
        this.isStreaming = false;
        break;

      case "message_start":
        this.streamingText = "";
        this.streamingThinking = "";
        break;

      case "message_update": {
        const sub = event.assistantMessageEvent as {
          type: string;
          delta?: string;
        } | undefined;
        if (!sub) break;
        if (sub.type === "text_delta" && sub.delta) {
          this.streamingText += sub.delta;
          this.scheduleScroll();
        } else if (sub.type === "thinking_delta" && sub.delta) {
          this.streamingThinking += sub.delta;
        }
        break;
      }

      case "message_end":
        this.finalizeStreaming();
        break;

      case "tool_execution_start":
      case "tool_execution_update":
      case "tool_execution_end":
        // We'll pick these up via refreshed state; for now, store them
        // as part of the streaming state. We could also maintain a
        // pending tool calls list here.
        break;

      case "response": {
        // RPC response — might contain state data
        const data = event.data as { messages?: AgentMessageData[] } | undefined;
        if (data?.messages) {
          this.messages = data.messages;
          this.scheduleScroll();
        }
        break;
      }

      case "turn_end":
        // Refresh full state to capture tool results
        this.wsSend({ type: "get_state" });
        break;
    }
  }

  private finalizeStreaming() {
    if (this.streamingText || this.streamingThinking) {
      // Build a complete assistant message from the streaming content
      const content: unknown[] = [];
      if (this.streamingThinking) {
        content.push({ type: "thinking", thinking: this.streamingThinking });
      }
      if (this.streamingText) {
        content.push({ type: "text", text: this.streamingText });
      }
      this.messages = [
        ...this.messages,
        { role: "assistant", content } as AgentMessageData,
      ];
      this.streamingText = "";
      this.streamingThinking = "";
      this.scheduleScroll();
    }
  }

  // ---- Auto-scroll ----

  private scrollRequestPending = false;

  private scheduleScroll() {
    if (!this.shouldAutoScroll || this.scrollRequestPending) return;
    this.scrollRequestPending = true;
    requestAnimationFrame(() => {
      this.scrollRequestPending = false;
      this.messageList?.scrollToBottom();
    });
  }

  // ---- User actions ----

  private onSend(e: CustomEvent<string>) {
    const text = e.detail;
    // Add user message locally for immediate feedback
    this.messages = [
      ...this.messages,
      { role: "user", content: text } as AgentMessageData,
    ];
    this.wsSend({ type: "prompt", text });
    this.scheduleScroll();
  }

  private onSteer(e: CustomEvent<string>) {
    const text = e.detail;
    this.messages = [
      ...this.messages,
      { role: "user", content: text } as AgentMessageData,
    ];
    this.wsSend({ type: "steer", text });
    this.scheduleScroll();
  }

  private onStop() {
    this.wsSend({ type: "abort" });
  }

  private onModelChange(e: CustomEvent<{ provider: string; model: string }>) {
    const { provider, model } = e.detail;
    this.currentProvider = provider;
    this.currentModel = model;
    this.wsSend({ type: "set_model", provider, model });
  }

  private onThinkingChange(e: CustomEvent<ThinkingLevel>) {
    this.currentThinkingLevel = e.detail;
    this.wsSend({ type: "set_thinking_level", level: e.detail });
  }

  // ---- Session name ----

  private async loadSessionName() {
    try {
      const res = await fetch("/api/sessions");
      if (!res.ok) return;
      const data = await res.json();
      const session = data.sessions.find(
        (s: { id: string }) => s.id === this.sessionId,
      );
      if (session) this.sessionName = session.name;
    } catch {
      // ignore
    }
  }

  private startRename() {
    this.editName = this.sessionName;
    this.renamingName = true;
    this.updateComplete.then(() => {
      const input = this.shadowRoot?.querySelector(
        ".title-input",
      ) as HTMLInputElement;
      input?.focus();
      input?.select();
    });
  }

  private async commitRename() {
    this.renamingName = false;
    const name = this.editName.trim();
    if (!name || name === this.sessionName) return;
    this.sessionName = name;
    try {
      await fetch(`/api/sessions/${this.sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
    } catch {
      // ignore
    }
  }

  private onTitleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      this.commitRename();
    } else if (e.key === "Escape") {
      this.renamingName = false;
    }
  }

  // ---- Render ----

  render() {
    return html`
      <header>
        <button class="back-btn" @click=${() => (window.location.hash = "#/")}>
          &#8592;
        </button>

        ${this.renamingName
          ? html`
              <input
                class="title-input"
                .value=${this.editName}
                @input=${(e: InputEvent) =>
                  (this.editName = (e.target as HTMLInputElement).value)}
                @keydown=${this.onTitleKeydown}
                @blur=${this.commitRename}
              />
            `
          : html`
              <div class="session-title" @click=${this.startRename}>
                ${this.sessionName}
              </div>
            `}

        <button
          class="settings-btn"
          @click=${() => (this.settingsOpen = true)}
        >
          &#9881;
        </button>
      </header>

      ${this.reconnecting
        ? html`<div class="banner reconnecting">
            Connection lost. Reconnecting...
          </div>`
        : nothing}
      ${this.error
        ? html`<div class="banner error">${this.error}</div>`
        : nothing}

      <message-list
        .messages=${this.messages}
        .isStreaming=${this.isStreaming}
        .streamingText=${this.streamingText}
        .streamingThinking=${this.streamingThinking}
      ></message-list>

      <chat-input
        .isStreaming=${this.isStreaming}
        @send=${this.onSend}
        @steer=${this.onSteer}
        @stop=${this.onStop}
      ></chat-input>

      <settings-panel
        .open=${this.settingsOpen}
        .currentModel=${this.currentModel}
        .currentProvider=${this.currentProvider}
        .currentThinkingLevel=${this.currentThinkingLevel}
        .models=${this.models}
        @close=${() => (this.settingsOpen = false)}
        @model-change=${this.onModelChange}
        @thinking-change=${this.onThinkingChange}
      ></settings-panel>
    `;
  }
}
