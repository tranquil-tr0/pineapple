import type { ExtensionUIRequest } from "@shared/types.js";

export interface ExtensionStatusEntry {
  key: string;
  text: string;
}

export interface ExtensionWidgetEntry {
  key: string;
  lines: string[];
  placement: "aboveEditor" | "belowEditor";
}

export interface ExtensionUiSnapshot {
  request: ExtensionUIRequest | null;
  input: string;
  statuses: ExtensionStatusEntry[];
  widgets: ExtensionWidgetEntry[];
}

export type ExtensionUiSideEffect =
  | {
      type: "none";
    }
  | {
      type: "notify";
      message: string;
      notifyType: "info" | "warning" | "error";
    }
  | {
      type: "setTitle";
      title: string;
    }
  | {
      type: "setEditorText";
      text: string;
    };

export type ExtensionUiResponsePayload =
  | {
      id: string;
      value: string;
    }
  | {
      id: string;
      confirmed: boolean;
    }
  | {
      id: string;
      cancelled: true;
    };

export class ExtensionUiState {
  private request: ExtensionUIRequest | null = null;
  private input = "";
  private pendingRequests: ExtensionUIRequest[] = [];
  private statuses: ExtensionStatusEntry[] = [];
  private widgets: ExtensionWidgetEntry[] = [];

  reset(): void {
    this.request = null;
    this.input = "";
    this.pendingRequests = [];
    this.statuses = [];
    this.widgets = [];
  }

  snapshot(): ExtensionUiSnapshot {
    return {
      request: this.request,
      input: this.input,
      statuses: [...this.statuses],
      widgets: this.widgets.map((widget) => ({
        ...widget,
        lines: [...widget.lines],
      })),
    };
  }

  setInput(value: string): void {
    this.input = value;
  }

  handleRequest(request: ExtensionUIRequest): ExtensionUiSideEffect {
    switch (request.method) {
      case "notify":
        return {
          type: "notify",
          message: request.message,
          notifyType: request.notifyType || "info",
        };

      case "setStatus":
        this.applyStatus(request.statusKey, request.statusText || "");
        return { type: "none" };

      case "setWidget":
        this.applyWidget(
          request.widgetKey,
          request.widgetLines || [],
          request.widgetPlacement || "belowEditor",
        );
        return { type: "none" };

      case "setTitle":
        return { type: "setTitle", title: request.title };

      case "set_editor_text":
        return { type: "setEditorText", text: request.text || "" };

      case "select":
      case "confirm":
      case "input":
      case "editor":
        this.enqueueOrOpen(request);
        return { type: "none" };
    }
  }

  respondWithValue(value: string): ExtensionUiResponsePayload | null {
    const current = this.request;
    if (!current) return null;

    const payload: ExtensionUiResponsePayload = { id: current.id, value };
    this.advanceQueue();
    return payload;
  }

  respondWithConfirm(confirmed: boolean): ExtensionUiResponsePayload | null {
    const current = this.request;
    if (!current) return null;

    const payload: ExtensionUiResponsePayload = { id: current.id, confirmed };
    this.advanceQueue();
    return payload;
  }

  cancelCurrent(): ExtensionUiResponsePayload | null {
    const current = this.request;
    if (!current) return null;

    const payload: ExtensionUiResponsePayload = { id: current.id, cancelled: true };
    this.advanceQueue();
    return payload;
  }

  private applyStatus(key: string, text: string): void {
    const rest = this.statuses.filter((entry) => entry.key !== key);
    this.statuses = text ? [...rest, { key, text }] : rest;
  }

  private applyWidget(
    key: string,
    lines: string[],
    placement: "aboveEditor" | "belowEditor",
  ): void {
    const rest = this.widgets.filter((entry) => entry.key !== key);
    this.widgets = lines.length ? [...rest, { key, lines, placement }] : rest;
  }

  private enqueueOrOpen(request: ExtensionUIRequest): void {
    if (!this.request) {
      this.openRequest(request);
      return;
    }
    this.pendingRequests.push(request);
  }

  private openRequest(request: ExtensionUIRequest): void {
    this.request = request;

    switch (request.method) {
      case "editor":
        this.input = request.prefill || "";
        return;
      case "input":
        this.input = "";
        return;
      case "select":
        this.input = request.options[0] || "";
        return;
      default:
        this.input = "";
    }
  }

  private advanceQueue(): void {
    if (this.pendingRequests.length === 0) {
      this.request = null;
      this.input = "";
      return;
    }

    const next = this.pendingRequests.shift();
    if (!next) {
      this.request = null;
      this.input = "";
      return;
    }

    this.openRequest(next);
  }
}
