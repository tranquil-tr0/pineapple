import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type {
  ClientMessage,
  ServerMessage,
  ThinkingLevel,
  AgentMessageData,
  ToolSpec,
  QueueDeliveryMode,
  ExtensionUIRequest,
  ShellResultMessage,
  ImageContent,
} from "@shared/types.js";
import {
  routeInputText,
  parseSlashCommandName,
  type SubmitIntent,
} from "../utils/input-router.js";
import {
  ExtensionUiState,
  type ExtensionUiResponsePayload,
} from "../utils/extension-ui-state.js";
import {
  getRenderableMessages,
  getSidebarEntries,
  extractPromptText,
  type SidebarFilterMode,
  type SidebarEntry,
} from "../utils/message-shaping.js";
import {
  fetchSessionInfo,
  fetchRuntimeInfo,
  patchSessionName,
  unarchiveSessionIfNeeded,
} from "../utils/session-actions.js";
import { renderExtensionUiDialog } from "../utils/render-extension-ui-dialog.js";
import { renderChatSidebar } from "../utils/render-chat-sidebar.js";
import { renderSessionInfoStack } from "../utils/render-session-info-stack.js";
import {
  renderChatEditorFooter,
  renderAboveEditorWidgets,
  type UsageTotals,
} from "../utils/render-chat-editor-footer.js";

import {
  SessionRuntime,
  type SessionRuntimeState,
} from "../utils/session-runtime.js";

/* ------------------------------------------------------------------ */
/*  Lightweight interfaces for the streaming assistant message we      */
/*  build locally. These mirror pi-ai content-block shapes.            */
/* ------------------------------------------------------------------ */

interface SessionStats {
  userMessages: number;
  assistantMessages: number;
  toolResults: number;
  toolCalls: number;
  totalVisible: number;
}

interface InputSubmission {
  text: string;
  images?: ImageContent[];
}

type ServerMessageHandlers = {
  [K in ServerMessage["type"]]: (
    msg: Extract<ServerMessage, { type: K }>,
  ) => void;
};

const THINKING_LEVELS: ThinkingLevel[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
];

@customElement("chat-view")
export class ChatView extends LitElement {
  // ---- Light DOM so global theme styles apply to message markup ----
  override createRenderRoot() {
    return this;
  }

  @property({ type: String }) sessionId = "";
  @property({ type: String }) targetMessageId = "";

  @state() private runtimeState: SessionRuntimeState | null = null;

  @state() private settingsOpen = false;
  @state() private renamingName = false;
  @state() private editName = "";
  @state() private showThinking = true;
  @state() private expandToolOutputs = false;
  @state() private sidebarSearch = "";
  @state() private sidebarFilter: SidebarFilterMode = "default";
  @state() private sessionCreatedAt = "";
  @state() private sessionLastActivityAt = "";
  @state() private hostCwd = "";
  @state() private hostGitBranch = "";
  @state() private persistedMessageCount = 0;
  @state() private extensionUiRequest: ExtensionUIRequest | null = null;
  @state() private extensionUiInput = "";
  @state() private extensionStatuses: ExtensionStatusEntry[] = [];
  @state() private extensionWidgets: ExtensionWidgetEntry[] = [];

  private extensionUiState = new ExtensionUiState();
  private runtime: SessionRuntime | null = null;

  // ---- Lifecycle ----

  connectedCallback() {
    super.connectedCallback();
    this.updateDocumentTitle();
    this.pendingDeepLinkTarget = this.targetMessageId || "";
    this.bootstrapSessionRuntime();
    window.addEventListener("keydown", this.onKeydown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.cleanup();
    window.removeEventListener("keydown", this.onKeydown);
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has("sessionId")) {
      const previousSessionId = changed.get("sessionId");
      if (
        typeof previousSessionId === "string" &&
        previousSessionId !== this.sessionId
      ) {
        this.cleanup();
        this.resetSessionState();
        this.pendingDeepLinkTarget = this.targetMessageId || "";
        this.updateDocumentTitle();
        this.bootstrapSessionRuntime();
      } else if (
        typeof previousSessionId !== "string" &&
        !this.ws &&
        this.sessionId
      ) {
        this.bootstrapSessionRuntime();
      }
    }

    if (changed.has("sessionName")) {
      this.updateDocumentTitle();
    }

    if (this.renamingName) {
      const input = this.querySelector(
        ".cv-info-title-input",
      ) as HTMLInputElement;
      if (input) {
        input.focus();
        input.select();
      }
    }

    if (changed.has("targetMessageId")) {
      this.pendingDeepLinkTarget = this.targetMessageId || "";
    }

    // Grab scroll container ref after render
    if (!this.scrollContainer) {
      this.scrollContainer = this.querySelector(".cv-messages");
      this.scrollContainer?.addEventListener("scroll", this.onScroll);
    }

    if (
      this.pendingDeepLinkTarget &&
      (changed.has("messages") || changed.has("targetMessageId"))
    ) {
      this.tryApplyDeepLinkTarget(this.pendingDeepLinkTarget);
    }
  }

  private bootstrapSessionRuntime() {
    if (!this.sessionId) return;
    this.connect();
    this.loadSessionName();
    this.loadRuntimeInfo();
    this.focusChatInput();
  }

  private resetSessionState() {
    this.messages = [];
    this.streamMsg = null;
    this._lastStreamClone = null;
    this.pendingToolCalls.clear();
    this.partialToolResults.clear();
    this.wasInterrupted = false;
    this.systemPrompt = "";
    this.tools = [];
    this.commands = [];
    this.commandsLoading = false;
    this.currentSteeringMode = "one-at-a-time";
    this.currentFollowUpMode = "one-at-a-time";
    this.extensionUiState.reset();
    this.syncExtensionUiState();
    this.sessionName = "Session";
    this.sessionCreatedAt = "";
    this.sessionLastActivityAt = "";
    this.hostCwd = "";
    this.hostGitBranch = "";
    this.currentContextWindow = null;
    this.currentMaxTokens = null;
    this.autoCompactionEnabled = false;
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
      this.wsSend({ type: "get_available_models" });
      this.requestCommands(true);
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
    if (this.runtime) {
      this.runtime.cleanup();
      this.runtime = null;
    }
    this.scrollContainer?.removeEventListener("scroll", this.onScroll);
    this.scrollContainer = null;
  }

  private bootstrapSessionRuntime() {
    if (!this.sessionId) return;
    this.runtime = new SessionRuntime(
      this.sessionId,
      this.extensionUiState,
      (state) => {
        this.runtimeState = state;
        if (state.sessionName !== this.sessionName) {
          this.sessionName = state.sessionName;
          this.updateDocumentTitle();
        }
        this.syncExtensionUiState();
      },
    );
    this.runtime.connect();
    this.loadSessionName();
    this.loadRuntimeInfo();
    this.focusChatInput();
  }

  private resetSessionState() {
    this.cleanup();
    this.runtimeState = null;
    this.extensionUiState.reset();
    this.syncExtensionUiState();
    this.sessionName = "Session";
    this.sessionCreatedAt = "";
    this.sessionLastActivityAt = "";
    this.hostCwd = "";
    this.hostGitBranch = "";
    this.persistedMessageCount = 0;
  }

  /** Force re-render of Extension UI elements when their internal state changes. */
  private syncExtensionUiState() {
    this.requestUpdate();
  }

  private onSend(e: CustomEvent<InputSubmission>) {
    this.routeAndSubmitInput(e.detail, "send");
  }

  private onSteer(e: CustomEvent<InputSubmission>) {
    this.routeAndSubmitInput(e.detail, "steer");
  }

  private onFollowUp(e: CustomEvent<InputSubmission>) {
    this.routeAndSubmitInput(e.detail, "follow_up");
  }

  private onStop() {
    this.runtime?.send({ type: "abort" });
  }

  private routeAndSubmitInput(input: InputSubmission, intent: SubmitIntent) {
    if (!this.runtime || !this.runtimeState) return;

    const text = typeof input.text === "string" ? input.text : "";
    const images = this.normalizeImages(input.images);

    // Prompt? steer? follow_up?
    const routed = routeInputText(text, {
      intent,
      isStreaming: this.runtimeState.isStreaming,
      commands: this.runtimeState.commands,
      allowEmpty: images.length > 0,
    });

    switch (routed.kind) {
      case "none":
        return;

      case "bash":
        this.runtime.send({
          type: "bash",
          command: routed.command,
          includeInContext: routed.includeInContext,
        });
        this.shouldAutoScroll = true;
        this.scheduleScroll();
        return;

      case "prompt":
        void this.unarchiveSessionIfNeeded();
        this.runtime.appendUserMessage(routed.text, images);
        this.runtime.send({
          type: "prompt",
          text: routed.text,
          images: images.length > 0 ? images : undefined,
        });
        return;

      case "steer":
        void this.unarchiveSessionIfNeeded();
        this.runtime.appendUserMessage(routed.text, images);
        this.runtime.send({
          type: "steer",
          text: routed.text,
          images: images.length > 0 ? images : undefined,
        });
        return;

      case "follow_up":
        void this.unarchiveSessionIfNeeded();
        this.runtime.appendUserMessage(routed.text, images);
        this.runtime.send({
          type: "follow_up",
          text: routed.text,
          images: images.length > 0 ? images : undefined,
        });
        return;
    }
  }

  private normalizeImages(images: ImageContent[] | undefined): ImageContent[] {
    if (!Array.isArray(images)) return [];
    return images.filter(
      (img) =>
        !!img &&
        img.type === "image" &&
        typeof img.data === "string" &&
        img.data.length > 0 &&
        typeof img.mimeType === "string" &&
        img.mimeType.startsWith("image/"),
    );
  }

  private onStop() {
    this.wasInterrupted = true;
    this.wsSend({ type: "abort" });
  }

  private onKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && this.extensionUiRequest) {
      e.preventDefault();
      this.cancelExtensionRequest();
    }
  };

  private applyModel(provider: string, model: string) {
    if (!provider || !model) return;
    this.currentProvider = provider;
    this.currentModel = model;
    this.wsSend({ type: "set_model", provider, model });
  }

  private applyThinkingLevel(level: ThinkingLevel) {
    this.currentThinkingLevel = level;
    this.wsSend({ type: "set_thinking_level", level });
  }

  private onStatusModelChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value;
    const [provider, ...rest] = value.split("/");
    const model = rest.join("/");
    this.applyModel(provider, model);
  }

  private onStatusThinkingChange(e: Event) {
    const level = (e.target as HTMLSelectElement).value as ThinkingLevel;
    if (!THINKING_LEVELS.includes(level)) return;
    this.applyThinkingLevel(level);
  }

  private onSteeringModeChange(e: CustomEvent<QueueDeliveryMode>) {
    this.currentSteeringMode = e.detail;
    this.wsSend({ type: "set_steering_mode", mode: e.detail });
  }

  private onFollowUpModeChange(e: CustomEvent<QueueDeliveryMode>) {
    this.currentFollowUpMode = e.detail;
    this.wsSend({ type: "set_follow_up_mode", mode: e.detail });
  }

  // ---- Session name ----

  private updateDocumentTitle() {
    const title = this.sessionName.trim();
    if (!title || title === "Session") {
      document.title = "pizza";
      return;
    }
    document.title = title;
  }

  private async loadSessionName() {
    const info = await fetchSessionInfo(this.sessionId);
    if (info) {
      this.sessionName = info.name;
      this.sessionCreatedAt = info.createdAt;
      this.sessionLastActivityAt = info.lastActivityAt;
      this.persistedMessageCount = info.messageCount;
    }
  }

  private async loadRuntimeInfo() {
    const info = await fetchRuntimeInfo();
    if (info) {
      this.hostCwd = info.cwd;
      this.hostGitBranch = info.gitBranch;
    }
  }

  private async unarchiveSessionIfNeeded() {
    const nextName = await unarchiveSessionIfNeeded(this.sessionId, this.sessionName);
    if (nextName) {
      this.sessionName = nextName;
    }
  }

  private startRename() {
    this.editName = this.sessionName;
    this.renamingName = true;
    this.updateComplete.then(() => {
      const input = this.querySelector(
        ".cv-title-input",
      ) as HTMLInputElement;
      input?.focus();
      input?.select();
    });
  }

  private async commitRename() {
    this.renamingName = false;
    const name = this.editName.trim();
    if (!name || name === this.sessionName) return;
    const success = await patchSessionName(this.sessionId, name);
    if (success) {
      this.sessionName = name;
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

  private getRenderableMessages(): AgentMessageData[] {
    return getRenderableMessages(this.messages);
  }

  private getSidebarEntries(renderable: AgentMessageData[]): SidebarEntry[] {
    return getSidebarEntries(renderable, this.sidebarSearch, this.sidebarFilter);
  }

  private computeStats(renderable: AgentMessageData[]): SessionStats {
    let userMessages = 0;
    let assistantMessages = 0;
    let toolResults = 0;
    let toolCalls = 0;

    for (const message of renderable) {
      if (message.role === "user" || message.role === "user-with-attachments") {
        userMessages++;
      } else if (message.role === "assistant") {
        assistantMessages++;
        if (Array.isArray(message.content)) {
          for (const part of message.content) {
            if (
              part &&
              typeof part === "object" &&
              (part as Record<string, unknown>).type === "toolCall"
            ) {
              toolCalls++;
            }
          }
        }
      } else if (message.role === "toolResult" || message.role === "bashExecution") {
        toolResults++;
      }
    }

    return {
      userMessages,
      assistantMessages,
      toolResults,
      toolCalls,
      totalVisible: renderable.length,
    };
  }

  private getKnownToolSpecs(renderable: AgentMessageData[]): ToolSpec[] {
    const builtins: ToolSpec[] = [
      {
        name: "read",
        description: "Read file contents",
        parameters: {
          properties: {
            path: { type: "string", description: "Path to read" },
            offset: { type: "number", description: "Start line" },
            limit: { type: "number", description: "Line count" },
          },
          required: ["path"],
        },
      },
      {
        name: "edit",
        description: "Replace exact text in a file",
        parameters: {
          properties: {
            path: { type: "string" },
            oldText: { type: "string" },
            newText: { type: "string" },
          },
          required: ["path", "oldText", "newText"],
        },
      },
      {
        name: "write",
        description: "Write content to a file",
        parameters: {
          properties: {
            path: { type: "string" },
            content: { type: "string" },
          },
          required: ["path", "content"],
        },
      },
      {
        name: "bash",
        description: "Execute a shell command",
        parameters: {
          properties: {
            command: { type: "string" },
            timeout: { type: "number" },
          },
          required: ["command"],
        },
      },
    ];

    const byName = new Map<string, ToolSpec>();
    for (const tool of [...builtins, ...this.tools]) {
      if (tool?.name) byName.set(tool.name, tool);
    }

    for (const message of renderable) {
      if (message.role === "assistant" && Array.isArray(message.content)) {
        for (const part of message.content) {
          if (
            part &&
            typeof part === "object" &&
            (part as Record<string, unknown>).type === "toolCall"
          ) {
            const name = (part as Record<string, unknown>).name;
            if (typeof name === "string" && !byName.has(name)) {
              byName.set(name, { name, description: "Custom tool" });
            }
          }
        }
      }

      if (message.role === "toolResult") {
        const name = message.toolName;
        if (typeof name === "string" && name && !byName.has(name)) {
          byName.set(name, { name, description: "Custom tool" });
        }
      }
    }

    return Array.from(byName.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  private formatDateTime(iso: string): string {
    if (!iso) return "unknown";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleString();
  }

  private scrollToMessage(targetId: string, smooth = true) {
    if (!targetId) return;
    const target = this.querySelector(`#${targetId}`) as HTMLElement | null;
    if (!target) return;

    this.shouldAutoScroll = false;
    target.scrollIntoView({
      behavior: smooth ? "smooth" : "auto",
      block: "center",
    });

    target.classList.add("highlight");
    setTimeout(() => target.classList.remove("highlight"), 2000);
  }

  private tryApplyDeepLinkTarget(targetId: string) {
    const target = this.querySelector(`#${targetId}`);
    if (!target) return;
    this.pendingDeepLinkTarget = "";
    this.scrollToMessage(targetId, false);
  }

  private updateHashTarget(targetId: string) {
    const nextHash = `#/session/${encodeURIComponent(this.sessionId)}?target=${encodeURIComponent(targetId)}`;
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, "", nextHash);
    }
  }

  private focusMessage(targetId: string) {
    this.updateHashTarget(targetId);
    this.scrollToMessage(targetId);
  }

  private numberOrZero(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  }

  private usageNumber(
    usage: Record<string, unknown>,
    keys: readonly string[],
  ): number | null {
    for (const key of keys) {
      const value = usage[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
    }
    return null;
  }

  private computeUsageTotals(messages: AgentMessageData[]): UsageTotals {
    const totals: UsageTotals = {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      activeContextTokens: null,
      totalCost: 0,
    };

    for (const message of messages) {
      if (message.role !== "assistant") continue;
      const usage = message.usage;
      if (!usage || typeof usage !== "object") continue;

      const usageRecord = usage as Record<string, unknown>;

      const input =
        this.usageNumber(usageRecord, [
          "input",
          "inputTokens",
          "promptTokens",
          "prompt_tokens",
        ]) ?? 0;
      const output =
        this.usageNumber(usageRecord, [
          "output",
          "outputTokens",
          "completionTokens",
          "completion_tokens",
        ]) ?? 0;
      const cacheRead =
        this.usageNumber(usageRecord, [
          "cacheRead",
          "cachedRead",
          "cache_read",
          "cacheReadTokens",
        ]) ?? 0;
      const cacheWrite =
        this.usageNumber(usageRecord, [
          "cacheWrite",
          "cachedWrite",
          "cache_write",
          "cacheWriteTokens",
        ]) ?? 0;

      totals.input += input;
      totals.output += output;
      totals.cacheRead += cacheRead;
      totals.cacheWrite += cacheWrite;

      const activeContext =
        this.usageNumber(usageRecord, [
          "activeContextTokens",
          "contextTokens",
          "context_tokens",
        ]) ??
        (input > 0
          ? input
          : (this.usageNumber(usageRecord, [
              "totalTokens",
              "total_tokens",
            ]) ?? null));

      if (activeContext !== null) {
        totals.activeContextTokens = activeContext;
      }

      const cost = usageRecord.cost;
      if (cost && typeof cost === "object") {
        totals.totalCost += this.numberOrZero(
          (cost as Record<string, unknown>).total,
        );
      }
    }

    return totals;
  }

  private renderExtensionUiDialog() {
    return renderExtensionUiDialog({
      request: this.extensionUiRequest,
      input: this.extensionUiInput,
      onInput: this.onExtensionInput,
      onCancel: () => this.cancelExtensionRequest(),
      onConfirm: (confirmed) => this.respondExtensionWithConfirm(confirmed),
      onValue: (value) => this.respondExtensionWithValue(value),
    });
  }

  // ---- Render ----

  render() {
    const rs = this.runtimeState;
    const renderableMessages = this.getRenderableMessages();
    const sidebarEntries = this.getSidebarEntries(renderableMessages);
    const stats = this.computeStats(renderableMessages);
    const knownTools = this.getKnownToolSpecs(renderableMessages);
    const usageTotals = this.computeUsageTotals(rs?.messages || []);
    const createdAtLabel = this.formatDateTime(this.sessionCreatedAt);
    const lastActivityAtLabel = this.formatDateTime(this.sessionLastActivityAt);
    const modelLabel = rs?.currentProvider
      ? `${rs.currentProvider}/${rs.currentModel}`
      : rs?.currentModel || "unknown";

    const isStreaming = rs?.isStreaming ?? false;
    const connected = rs?.connected ?? false;
    const reconnecting = rs?.reconnecting ?? false;
    const error = rs?.error ?? "";

    return html`
      <button
        class="cv-floating-back-btn"
        @click=${() => (window.location.hash = "#/")}
        title="Back to session list"
      >
        &#8592;
      </button>

      <button
        class="cv-floating-gear-btn"
        @click=${() => (this.settingsOpen = true)}
        title="Settings"
      >
        &#9881;
      </button>

      ${reconnecting
        ? html`<div class="cv-banner reconnecting">
            Connection lost. Reconnecting&hellip;
          </div>`
        : nothing}
      ${connected && rs?.models.length && !rs?.currentModel
        ? html`<div class="cv-banner warning">
            No model available. Configure an API key or model provider in pi.
          </div>`
        : error
          ? html`<div class="cv-banner error">${error}</div>`
          : nothing}

      <div class="cv-body">
        ${renderChatSidebar({
          search: this.sidebarSearch,
          filter: this.sidebarFilter,
          entries: sidebarEntries,
          onSearchInput: (e) =>
            (this.sidebarSearch = (e.target as HTMLInputElement).value),
          onSelectFilter: (mode) => (this.sidebarFilter = mode),
          onFocusMessage: (targetId) => this.focusMessage(targetId),
        })}

        <div class="cv-main-col">
          <div class="cv-messages">
            <div class="cv-shortcuts">
              <button
                class="cv-shortcut-btn ${this.showThinking ? "active" : ""}"
                @click=${() => (this.showThinking = !this.showThinking)}
              >
                Thinking
              </button>
              <button
                class="cv-shortcut-btn ${this.expandToolOutputs ? "active" : ""}"
                @click=${() => (this.expandToolOutputs = !this.expandToolOutputs)}
              >
                Tool outputs
              </button>
            </div>

            ${renderSessionInfoStack({
              sessionId: this.sessionId,
              sessionName: this.sessionName,
              renamingName: this.renamingName,
              editName: this.editName,
              createdAtLabel,
              lastActivityAtLabel,
              modelLabel,
              thinkingLevel: rs?.currentThinkingLevel || "off",
              stats,
              persistedMessageCount: this.persistedMessageCount,
              pendingMessageCount: rs?.pendingMessageCount || 0,
              systemPrompt: rs?.systemPrompt || "",
              knownTools,
              onStartRename: () => this.startRename(),
              onEditNameInput: (e: InputEvent) =>
                (this.editName = (e.target as HTMLInputElement).value),
              onTitleKeydown: (e: KeyboardEvent) => this.onTitleKeydown(e),
              onCommitRename: () => this.commitRename(),
            })}

            <message-list
              .messages=${renderableMessages}
              .allMessages=${rs?.messages || []}
              .isStreaming=${isStreaming}
              .pendingToolCalls=${rs?.pendingToolCalls || new Set()}
              .showThinking=${this.showThinking}
              .expandToolOutputs=${this.expandToolOutputs}
            ></message-list>

            ${isStreaming
              ? html`<div class="cv-streaming-indicator">
                  <span class="cv-streaming-cursor"></span>
                </div>`
              : nothing}

            ${rs?.wasInterrupted && !isStreaming
              ? html`<div class="cv-interrupted">Interrupted</div>`
              : nothing}
          </div>

          ${renderAboveEditorWidgets(this.extensionWidgets)}

          <chat-input
            .isStreaming=${isStreaming}
            .disabled=${(rs?.models.length || 0) > 0 && !rs?.currentModel}
            .commands=${rs?.commands || []}
            .commandsLoading=${rs?.commandsLoading || false}
            @send=${this.onSend}
            @steer=${this.onSteer}
            @follow-up=${this.onFollowUp}
            @stop=${this.onStop}
          ></chat-input>

          ${renderChatEditorFooter({
            usage: usageTotals,
            hostCwd: this.hostCwd,
            hostGitBranch: this.hostGitBranch,
            reconnecting,
            connected,
            isStreaming,
            currentContextWindow: rs?.currentContextWindow || null,
            autoCompactionEnabled: rs?.autoCompactionEnabled || false,
            persistedMessageCount: this.persistedMessageCount,
            pendingMessageCount: rs?.pendingMessageCount || 0,
            extensionStatuses: this.extensionStatuses,
            extensionWidgets: this.extensionWidgets,
            models: rs?.models || [],
            currentProvider: rs?.currentProvider || "",
            currentModel: rs?.currentModel || "",
            currentThinkingLevel: rs?.currentThinkingLevel || "off",
            thinkingLevels: THINKING_LEVELS,
            onModelChange: (e) => this.onStatusModelChange(e),
            onThinkingChange: (e) => this.onStatusThinkingChange(e),
          })}
        </div>
      </div>

      ${this.renderExtensionUiDialog()}

      <settings-panel
        .open=${this.settingsOpen}
        .currentSteeringMode=${rs?.currentSteeringMode || "one-at-a-time"}
        .currentFollowUpMode=${rs?.currentFollowUpMode || "one-at-a-time"}
        @close=${() => (this.settingsOpen = false)}
        @steering-mode-change=${this.onSteeringModeChange}
        @follow-up-mode-change=${this.onFollowUpModeChange}
      ></settings-panel>
    `;
  }
}
