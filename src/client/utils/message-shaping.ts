import type { AgentMessageData } from "@shared/types.js";

export interface SidebarEntry {
  role: "user" | "assistant" | "tool";
  text: string;
  targetId: string;
}

export type SidebarFilterMode = "no-tools" | "user-only" | "all";

export function messageDomId(sourceIndex: number, message?: AgentMessageData): string {
  if (message?.id) {
    return `msg-${message.id}`;
  }
  return `msg-${sourceIndex}`;
}

export function messageTargetId(message: AgentMessageData, renderIndex: number): string {
  if ((message as any)._targetId) {
    return (message as any)._targetId;
  }
  if (message.id) {
    return `msg-${message.id}`;
  }
  return `msg-r-${renderIndex}`;
}

export function extractPromptText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return String(content ?? "");

  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (!part || typeof part !== "object") return "";
      const p = part as Record<string, unknown>;
      if (p.type === "text" && typeof p.text === "string") return p.text;
      return "";
    })
    .join("\n")
    .trim();
}

export function extractPreviewText(content: unknown): string {
  if (typeof content === "string") {
    return content.replace(/\s+/g, " ").trim().slice(0, 140);
  }

  if (!Array.isArray(content)) {
    return String(content ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 140);
  }

  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (!part || typeof part !== "object") return "";
      const p = part as Record<string, unknown>;
      if (p.type === "text" && typeof p.text === "string") return p.text;
      if (p.type === "thinking" && typeof p.thinking === "string") return `[thinking] ${p.thinking}`;
      if (p.type === "toolCall" && typeof p.name === "string") return `[call: ${p.name}]`;
      return "";
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}

export function getRenderableMessages(messages: AgentMessageData[]): AgentMessageData[] {
  const toolCallIds = new Set<string>();

  for (const message of messages) {
    if (message.role !== "assistant") continue;
    const content = message.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (
        part &&
        typeof part === "object" &&
        (part as Record<string, unknown>).type === "toolCall"
      ) {
        const id = (part as Record<string, unknown>).id;
        if (typeof id === "string") toolCallIds.add(id);
      }
    }
  }

  return messages.flatMap((message, sourceIndex) => {
    if (message.role === "artifact" || message.role === "system") return [];

    if (
      message.role === "custom" &&
      Object.prototype.hasOwnProperty.call(message, "display") &&
      (message as any).display === false
    ) {
      return [];
    }

    if (
      message.role === "toolResult" &&
      typeof message.toolCallId === "string" &&
      toolCallIds.has(message.toolCallId)
    ) {
      return [];
    }

    const targetId = messageDomId(sourceIndex, message);
    return [{ ...message, _targetId: targetId } as AgentMessageData];
  });
}

export function getSidebarEntries(
  renderable: AgentMessageData[],
  searchQuery: string,
  filterMode: SidebarFilterMode
): SidebarEntry[] {
  const query = searchQuery.trim().toLowerCase();

  const entries = renderable
    .map((message, renderIndex): SidebarEntry | null => {
      const targetId = messageTargetId(message, renderIndex);

      if (message.role === "user" || message.role === "user-with-attachments") {
        return {
          role: "user",
          text: extractPreviewText(message.content),
          targetId,
        };
      }

      if (message.role === "assistant") {
        const text = extractPreviewText(message.content) || "(no text)";
        return {
          role: "assistant",
          text,
          targetId,
        };
      }

      if (message.role === "toolResult") {
        const toolName =
          typeof message.toolName === "string" && message.toolName
            ? message.toolName
            : "tool";
        const output = extractPreviewText(message.content);
        return {
          role: "tool",
          text: `[${toolName}] ${output}`.trim(),
          targetId,
        };
      }

      if (message.role === "bashExecution") {
        const command =
          typeof message.command === "string" && message.command
            ? message.command
            : "(command)";
        const output =
          typeof message.output === "string"
            ? message.output
            : extractPreviewText(message.output);
        return {
          role: "tool",
          text: `[$ ${command}] ${output}`.trim(),
          targetId,
        };
      }

      if (message.role === "custom") {
        const customType =
          typeof message.customType === "string" && message.customType.trim()
            ? message.customType.trim()
            : "custom";
        const text = extractPreviewText(message.content);
        return {
          role: "assistant",
          text: `[${customType}] ${text}`.trim(),
          targetId,
        };
      }

      if (message.role === "branchSummary") {
        const summary =
          typeof message.summary === "string" && message.summary.trim()
            ? message.summary.trim()
            : "Branch summary";
        return {
          role: "assistant",
          text: `[branch] ${summary}`,
          targetId,
        };
      }

      if (message.role === "compactionSummary") {
        const tokensBefore =
          typeof message.tokensBefore === "number"
            ? message.tokensBefore.toLocaleString()
            : "?";
        return {
          role: "assistant",
          text: `[compaction] ${tokensBefore} tokens`,
          targetId,
        };
      }

      return null;
    })
    .filter((entry): entry is SidebarEntry => !!entry);

  return entries.filter((entry) => {
    if (filterMode === "user-only" && entry.role !== "user") {
      return false;
    }
    if (filterMode === "no-tools" && entry.role === "tool") {
      return false;
    }

    if (!query) return true;
    return `${entry.role} ${entry.text}`.toLowerCase().includes(query);
  });
}
