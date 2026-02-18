import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { Marked } from "marked";
import hljs from "highlight.js";

// Configure marked with syntax highlighting
const marked = new Marked({
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      let highlighted: string;
      if (lang && hljs.getLanguage(lang)) {
        highlighted = hljs.highlight(text, { language: lang }).value;
      } else {
        highlighted = hljs.highlightAuto(text).value;
      }
      return `<div class="code-block"><div class="code-header"><span class="code-lang">${lang || ""}</span><button class="copy-btn" onclick="navigator.clipboard.writeText(this.closest('.code-block').querySelector('code').textContent)">Copy</button></div><pre><code>${highlighted}</code></pre></div>`;
    },
  },
});

interface ContentPart {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: ContentPart[];
  thinking?: string;
  [key: string]: unknown;
}

interface Message {
  role: string;
  content?: string | ContentPart[];
  [key: string]: unknown;
}

interface ToolCallInfo {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result?: string;
  error?: boolean;
}

@customElement("message-list")
export class MessageList extends LitElement {
  @property({ type: Array }) messages: Message[] = [];
  @property({ type: Boolean }) isStreaming = false;
  @property({ type: String }) streamingText = "";
  @property({ type: String }) streamingThinking = "";
  @state() private expandedTools = new Set<string>();

  static styles = css`
    :host {
      display: block;
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      scroll-behavior: smooth;
    }

    .message {
      max-width: var(--max-width);
      margin: 0 auto 16px;
      animation: fadeIn 0.15s ease-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .user-msg {
      background: var(--accent);
      color: white;
      padding: 10px 16px;
      border-radius: var(--radius-lg) var(--radius-lg) 4px var(--radius-lg);
      margin-left: auto;
      max-width: 85%;
      width: fit-content;
      word-break: break-word;
      white-space: pre-wrap;
    }

    .assistant-msg {
      padding: 4px 0;
    }

    .assistant-msg :first-child {
      margin-top: 0;
    }

    /* Markdown content styling */
    .md-content p {
      margin: 0.5em 0;
    }

    .md-content ul, .md-content ol {
      margin: 0.5em 0;
      padding-left: 1.5em;
    }

    .md-content li {
      margin: 0.25em 0;
    }

    .md-content h1, .md-content h2, .md-content h3,
    .md-content h4, .md-content h5, .md-content h6 {
      margin: 1em 0 0.5em;
      font-weight: 600;
    }

    .md-content h1 { font-size: 1.4em; }
    .md-content h2 { font-size: 1.2em; }
    .md-content h3 { font-size: 1.1em; }

    .md-content code:not(pre code) {
      background: var(--code-bg);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.9em;
    }

    .md-content a {
      color: var(--accent);
    }

    .md-content blockquote {
      border-left: 3px solid var(--border);
      margin: 0.5em 0;
      padding-left: 12px;
      color: var(--text-secondary);
    }

    /* Code blocks */
    .code-block {
      margin: 8px 0;
      border-radius: var(--radius);
      overflow: hidden;
      border: 1px solid var(--border);
    }

    .code-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 12px;
      background: var(--surface-alt);
      font-size: 0.8rem;
    }

    .code-lang {
      color: var(--text-secondary);
      font-family: var(--font-mono);
    }

    .copy-btn {
      padding: 2px 8px;
      border: 1px solid var(--border);
      border-radius: 4px;
      background: var(--surface);
      color: var(--text-secondary);
      font-size: 0.75rem;
      cursor: pointer;
      font-family: inherit;
    }

    .copy-btn:hover {
      background: var(--surface-alt);
    }

    .code-block pre {
      margin: 0;
      padding: 12px;
      overflow-x: auto;
      background: var(--code-bg);
      font-size: 0.85rem;
      line-height: 1.5;
    }

    .code-block code {
      font-family: var(--font-mono);
    }

    /* Tool calls */
    .tool-call {
      margin: 8px 0;
      border: 1px solid var(--tool-border);
      border-radius: var(--radius);
      background: var(--tool-bg);
      overflow: hidden;
    }

    .tool-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      cursor: pointer;
      font-size: 0.9rem;
      user-select: none;
      -webkit-user-select: none;
      min-height: 44px;
    }

    .tool-header:hover {
      background: var(--surface-alt);
    }

    .tool-chevron {
      font-size: 0.7rem;
      transition: transform 0.15s ease;
      color: var(--text-secondary);
    }

    .tool-chevron.expanded {
      transform: rotate(90deg);
    }

    .tool-name {
      font-weight: 600;
      font-family: var(--font-mono);
      font-size: 0.85rem;
    }

    .tool-summary {
      color: var(--text-secondary);
      font-size: 0.85rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
    }

    .tool-status {
      font-size: 0.85rem;
      flex-shrink: 0;
    }

    .tool-body {
      padding: 8px 12px;
      border-top: 1px solid var(--tool-border);
    }

    .tool-section-label {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--text-secondary);
      margin-bottom: 4px;
    }

    .tool-content {
      font-family: var(--font-mono);
      font-size: 0.8rem;
      white-space: pre-wrap;
      word-break: break-all;
      background: var(--code-bg);
      padding: 8px;
      border-radius: 4px;
      max-height: 300px;
      overflow-y: auto;
      margin-bottom: 8px;
    }

    /* Thinking block */
    .thinking-block {
      margin: 8px 0;
      border: 1px solid var(--thinking-border);
      border-radius: var(--radius);
      background: var(--thinking-bg);
      overflow: hidden;
    }

    .thinking-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      cursor: pointer;
      font-size: 0.85rem;
      color: var(--text-secondary);
      font-style: italic;
      min-height: 44px;
    }

    .thinking-content {
      padding: 8px 12px;
      border-top: 1px solid var(--thinking-border);
      font-size: 0.85rem;
      color: var(--text-secondary);
      font-style: italic;
      white-space: pre-wrap;
      max-height: 400px;
      overflow-y: auto;
    }

    /* Streaming indicator */
    .streaming-cursor {
      display: inline-block;
      width: 6px;
      height: 1em;
      background: var(--accent);
      margin-left: 2px;
      animation: blink 1s step-end infinite;
      vertical-align: text-bottom;
    }

    @keyframes blink {
      50% { opacity: 0; }
    }

    /* Error message */
    .error-msg {
      padding: 10px 16px;
      background: var(--error-bg);
      color: var(--error);
      border-radius: var(--radius);
      font-size: 0.9rem;
    }

    /* Interrupted badge */
    .interrupted {
      display: inline-block;
      padding: 2px 8px;
      background: var(--surface-alt);
      color: var(--text-secondary);
      border-radius: 4px;
      font-size: 0.75rem;
      margin-top: 4px;
    }

    /* hljs basics */
    .hljs-keyword, .hljs-selector-tag, .hljs-built_in { color: #c678dd; }
    .hljs-string, .hljs-attr { color: #98c379; }
    .hljs-comment { color: #5c6370; font-style: italic; }
    .hljs-number, .hljs-literal { color: #d19a66; }
    .hljs-function .hljs-title { color: #61afef; }
    .hljs-type, .hljs-class .hljs-title { color: #e5c07b; }
  `;

  render() {
    const allMessages = this.messages || [];
    const rendered: unknown[] = [];

    for (let i = 0; i < allMessages.length; i++) {
      const msg = allMessages[i];
      if (msg.role === "user") {
        rendered.push(this.renderUserMessage(msg));
      } else if (msg.role === "assistant") {
        rendered.push(this.renderAssistantMessage(msg, allMessages, i));
      }
    }

    // Streaming content
    if (this.isStreaming && (this.streamingText || this.streamingThinking)) {
      rendered.push(this.renderStreamingMessage());
    }

    return html`${rendered}`;
  }

  private renderUserMessage(msg: Message) {
    const text = this.extractText(msg);
    return html`<div class="message"><div class="user-msg">${text}</div></div>`;
  }

  private renderAssistantMessage(
    msg: Message,
    allMessages: Message[],
    index: number,
  ) {
    const parts: unknown[] = [];
    const content = msg.content;

    if (typeof content === "string") {
      parts.push(this.renderMarkdown(content));
    } else if (Array.isArray(content)) {
      for (const part of content) {
        if (part.type === "thinking" && part.thinking) {
          parts.push(this.renderThinkingBlock(part.thinking));
        } else if (part.type === "text" && part.text) {
          parts.push(this.renderMarkdown(part.text));
        } else if (part.type === "tool_use") {
          const toolInfo = this.buildToolInfo(part, allMessages, index);
          parts.push(this.renderToolCall(toolInfo));
        }
      }
    }

    return html`<div class="message assistant-msg">${parts}</div>`;
  }

  private renderStreamingMessage() {
    const parts: unknown[] = [];

    if (this.streamingThinking) {
      parts.push(this.renderThinkingBlock(this.streamingThinking));
    }

    if (this.streamingText) {
      parts.push(this.renderMarkdown(this.streamingText));
    }

    parts.push(html`<span class="streaming-cursor"></span>`);

    return html`<div class="message assistant-msg">${parts}</div>`;
  }

  private renderMarkdown(text: string) {
    const htmlStr = marked.parse(text) as string;
    return html`<div class="md-content">${unsafeHTML(htmlStr)}</div>`;
  }

  private renderThinkingBlock(text: string) {
    const id = `thinking-${Math.random().toString(36).slice(2, 8)}`;
    const expanded = this.expandedTools.has(id);

    return html`
      <div class="thinking-block">
        <div class="thinking-header" @click=${() => this.toggleExpand(id)}>
          <span class="tool-chevron ${expanded ? "expanded" : ""}">&#9654;</span>
          Thinking...
        </div>
        ${expanded
          ? html`<div class="thinking-content">${text}</div>`
          : nothing}
      </div>
    `;
  }

  private renderToolCall(tool: ToolCallInfo) {
    const expanded = this.expandedTools.has(tool.id);
    const summary = this.toolSummary(tool);
    const statusIcon = tool.result !== undefined
      ? tool.error
        ? "&#10007;"
        : "&#10003;"
      : "&#9676;"; // spinner placeholder

    return html`
      <div class="tool-call">
        <div class="tool-header" @click=${() => this.toggleExpand(tool.id)}>
          <span class="tool-chevron ${expanded ? "expanded" : ""}">&#9654;</span>
          <span class="tool-name">${tool.name}</span>
          <span class="tool-summary">${summary}</span>
          <span class="tool-status">${unsafeHTML(statusIcon)}</span>
        </div>
        ${expanded
          ? html`
              <div class="tool-body">
                <div class="tool-section-label">Input</div>
                <div class="tool-content">${this.formatToolInput(tool)}</div>
                ${tool.result !== undefined
                  ? html`
                      <div class="tool-section-label">Output</div>
                      <div class="tool-content">${tool.result}</div>
                    `
                  : nothing}
              </div>
            `
          : nothing}
      </div>
    `;
  }

  private buildToolInfo(
    part: ContentPart,
    allMessages: Message[],
    assistantIndex: number,
  ): ToolCallInfo {
    const info: ToolCallInfo = {
      id: part.id || `tool-${Math.random().toString(36).slice(2, 8)}`,
      name: part.name || "unknown",
      input: (part.input as Record<string, unknown>) || {},
    };

    // Look for the tool result in subsequent messages
    for (let j = assistantIndex + 1; j < allMessages.length; j++) {
      const rmsg = allMessages[j];
      if (rmsg.role === "tool" || rmsg.role === "toolResult") {
        const rContent = rmsg.content;
        if (
          typeof rmsg.tool_use_id === "string" &&
          rmsg.tool_use_id === part.id
        ) {
          info.result = this.extractText(rmsg);
          info.error = rmsg.is_error === true;
          break;
        }
        // Also handle array content with matching tool_use_id
        if (Array.isArray(rContent)) {
          for (const rp of rContent) {
            if (rp.type === "tool_result" && rp.tool_use_id === part.id) {
              info.result = rp.text || JSON.stringify(rp.content);
              info.error = rp.is_error === true;
              break;
            }
          }
        }
      }
      // Stop looking if we hit another assistant message
      if (rmsg.role === "assistant") break;
    }

    return info;
  }

  private toolSummary(tool: ToolCallInfo): string {
    const input = tool.input;
    switch (tool.name) {
      case "bash":
        return String(input.command || "").slice(0, 80);
      case "read":
        return String(input.file_path || input.path || "");
      case "write":
        return String(input.file_path || input.path || "");
      case "edit":
        return String(input.file_path || input.path || "");
      default:
        return Object.keys(input).join(", ");
    }
  }

  private formatToolInput(tool: ToolCallInfo): string {
    const input = tool.input;
    if (tool.name === "bash" && input.command) {
      return String(input.command);
    }
    return JSON.stringify(input, null, 2);
  }

  private toggleExpand(id: string) {
    if (this.expandedTools.has(id)) {
      this.expandedTools.delete(id);
    } else {
      this.expandedTools.add(id);
    }
    this.requestUpdate();
  }

  private extractText(msg: Message): string {
    if (typeof msg.content === "string") return msg.content;
    if (Array.isArray(msg.content)) {
      return msg.content
        .filter((p) => p.type === "text" && p.text)
        .map((p) => p.text)
        .join("");
    }
    return "";
  }

  /**
   * Scroll to bottom (called externally by chat-view).
   */
  scrollToBottom() {
    this.scrollTop = this.scrollHeight;
  }
}
