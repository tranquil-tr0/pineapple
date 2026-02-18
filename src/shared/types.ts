// ---- Session metadata ----

export interface SessionMeta {
  id: string;
  name: string;
  createdAt: string; // ISO 8601
  lastActivityAt: string; // ISO 8601
  messageCount: number;
}

// ---- REST responses ----

export interface SessionListResponse {
  sessions: SessionMeta[];
}

export interface SessionCreatedResponse {
  id: string;
}

export interface SessionUpdatedResponse {
  id: string;
  name: string;
}

export interface HealthResponse {
  status: "ok";
  activeSessions: number;
}

// ---- WebSocket: client → server ----

export type ClientMessage =
  | { type: "prompt"; text: string }
  | { type: "steer"; text: string }
  | { type: "abort" }
  | { type: "get_state" }
  | { type: "set_model"; provider: string; model: string }
  | { type: "set_thinking_level"; level: ThinkingLevel }
  | { type: "get_available_models" };

// ---- WebSocket: server → client ----

export type ServerMessage =
  | StateMessage
  | AgentEventMessage
  | AvailableModelsMessage
  | ErrorMessage;

export interface StateMessage {
  type: "state";
  model: { provider: string; id: string } | null;
  thinkingLevel: string;
  isStreaming: boolean;
  messages: AgentMessageData[];
}

export interface AgentEventMessage {
  type: "agent_event";
  event: RpcEvent;
}

export interface AvailableModelsMessage {
  type: "available_models";
  models: ModelInfo[];
}

export interface ErrorMessage {
  type: "error";
  message: string;
}

// ---- Supporting types ----

export type ThinkingLevel =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

export interface ModelInfo {
  provider: string;
  id: string;
  label: string;
}

// Generic agent message (mirrors pi's message structure loosely)
export interface AgentMessageData {
  role: string;
  [key: string]: unknown;
}

// RPC event — we pass through the raw structure from pi
export interface RpcEvent {
  type: string;
  [key: string]: unknown;
}
