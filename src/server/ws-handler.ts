import type { WebSocket } from "ws";
import type { SessionManager } from "./session-manager.js";
import type { ClientMessage, RpcEvent, ServerMessage } from "@shared/types.js";

/**
 * Handle a WebSocket connection for a specific session.
 */
export function handleSessionWebSocket(
  ws: WebSocket,
  sessionId: string,
  sessions: SessionManager,
): void {
  let messageCount = 0;

  const listener = (event: RpcEvent) => {
    sendJson(ws, { type: "agent_event", event });
  };

  let rpc = sessions.getOrSpawn(sessionId, listener);

  // Send initial state request
  rpc.send({ type: "get_state" });

  ws.on("message", (data) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      sendJson(ws, { type: "error", message: "Invalid JSON" });
      return;
    }

    if (!rpc.alive) {
      // Re-spawn if needed
      rpc = sessions.getOrSpawn(sessionId, listener);
    }

    switch (msg.type) {
      case "prompt":
        messageCount++;
        if (messageCount === 1) {
          sessions.autoName(sessionId, msg.text);
        }
        sessions.touchSession(sessionId);
        rpc.send({ type: "prompt", content: [{ type: "text", text: msg.text }] });
        break;

      case "steer":
        sessions.touchSession(sessionId);
        rpc.send({ type: "steer", content: [{ type: "text", text: msg.text }] });
        break;

      case "abort":
        rpc.send({ type: "abort" });
        break;

      case "get_state":
        rpc.send({ type: "get_state" });
        break;

      case "set_model":
        rpc.send({
          type: "set_model",
          provider: msg.provider,
          model: msg.model,
        });
        break;

      case "set_thinking_level":
        rpc.send({ type: "set_thinking_level", level: msg.level });
        break;

      case "get_available_models":
        rpc.send({ type: "get_available_models" });
        break;

      default:
        sendJson(ws, {
          type: "error",
          message: `Unknown message type: ${(msg as { type: string }).type}`,
        });
    }
  });

  ws.on("close", () => {
    sessions.detach(sessionId, listener);
  });

  ws.on("error", () => {
    sessions.detach(sessionId, listener);
  });
}

function sendJson(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}
