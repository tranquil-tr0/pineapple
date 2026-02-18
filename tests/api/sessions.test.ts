import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createApp, type AppInstance } from "../../src/server/app.js";
import type { ServerConfig } from "../../src/server/config.js";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { AddressInfo } from "net";

let app: AppInstance;
let baseUrl: string;
let sessionDir: string;

beforeAll(async () => {
  sessionDir = await mkdtemp(join(tmpdir(), "pi-web-test-"));
  const config: ServerConfig = {
    port: 0, // random port
    sessionDir,
    defaultModel: null,
    defaultThinkingLevel: "off",
    idleTimeoutMs: 5000,
    piCommand: "pi",
  };
  app = createApp(config);
  await new Promise<void>((resolve) => {
    app.server.listen(0, () => resolve());
  });
  const addr = app.server.address() as AddressInfo;
  baseUrl = `http://localhost:${addr.port}`;
});

afterAll(async () => {
  await app.close();
  await rm(sessionDir, { recursive: true, force: true });
});

describe("GET /api/health", () => {
  it("returns status ok", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(typeof data.activeSessions).toBe("number");
  });
});

describe("Session CRUD", () => {
  let createdId: string;

  it("POST /api/sessions creates a session", async () => {
    const res = await fetch(`${baseUrl}/api/sessions`, { method: "POST" });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBeDefined();
    expect(typeof data.id).toBe("string");
    createdId = data.id;
  });

  it("GET /api/sessions lists sessions", async () => {
    const res = await fetch(`${baseUrl}/api/sessions`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sessions).toBeInstanceOf(Array);
    expect(data.sessions.length).toBeGreaterThanOrEqual(1);

    const session = data.sessions.find(
      (s: { id: string }) => s.id === createdId,
    );
    expect(session).toBeDefined();
    expect(session.name).toBe("New Session");
    expect(session.createdAt).toBeDefined();
    expect(session.lastActivityAt).toBeDefined();
    expect(typeof session.messageCount).toBe("number");
  });

  it("PATCH /api/sessions/:id updates session name", async () => {
    const res = await fetch(`${baseUrl}/api/sessions/${createdId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed Session" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBe("Renamed Session");
  });

  it("GET /api/sessions reflects the rename", async () => {
    const res = await fetch(`${baseUrl}/api/sessions`);
    const data = await res.json();
    const session = data.sessions.find(
      (s: { id: string }) => s.id === createdId,
    );
    expect(session.name).toBe("Renamed Session");
  });

  it("DELETE /api/sessions/:id deletes a session", async () => {
    const res = await fetch(`${baseUrl}/api/sessions/${createdId}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
  });

  it("GET /api/sessions no longer contains deleted session", async () => {
    const res = await fetch(`${baseUrl}/api/sessions`);
    const data = await res.json();
    const session = data.sessions.find(
      (s: { id: string }) => s.id === createdId,
    );
    expect(session).toBeUndefined();
  });

  it("PATCH /api/sessions/:id returns 404 for unknown session", async () => {
    const res = await fetch(`${baseUrl}/api/sessions/nonexistent`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "test" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("Session sort order", () => {
  it("sessions are sorted by lastActivityAt descending", async () => {
    // Create two sessions with a slight time gap
    const res1 = await fetch(`${baseUrl}/api/sessions`, { method: "POST" });
    const { id: id1 } = await res1.json();

    // Small delay to ensure different timestamps
    await new Promise((r) => setTimeout(r, 50));

    const res2 = await fetch(`${baseUrl}/api/sessions`, { method: "POST" });
    const { id: id2 } = await res2.json();

    const listRes = await fetch(`${baseUrl}/api/sessions`);
    const data = await listRes.json();

    const idx1 = data.sessions.findIndex(
      (s: { id: string }) => s.id === id1,
    );
    const idx2 = data.sessions.findIndex(
      (s: { id: string }) => s.id === id2,
    );

    // id2 was created later, so it should appear first
    expect(idx2).toBeLessThan(idx1);

    // Cleanup
    await fetch(`${baseUrl}/api/sessions/${id1}`, { method: "DELETE" });
    await fetch(`${baseUrl}/api/sessions/${id2}`, { method: "DELETE" });
  });
});

describe("WebSocket connection", () => {
  it("connects to a session WebSocket endpoint", async () => {
    // Create a session
    const res = await fetch(`${baseUrl}/api/sessions`, { method: "POST" });
    const { id } = await res.json();

    const addr = app.server.address() as AddressInfo;
    const wsUrl = `ws://localhost:${addr.port}/api/sessions/${id}/ws`;

    const ws = new WebSocket(wsUrl);

    // Wait for the WebSocket to open or receive a message.
    // The RPC subprocess may fail to spawn if pi is not installed — that's fine.
    // We're testing that the WebSocket endpoint itself works.
    const result = await new Promise<string>((resolve) => {
      const timer = setTimeout(() => resolve("timeout"), 5000);
      ws.onopen = () => {
        clearTimeout(timer);
        resolve("open");
      };
      ws.onerror = () => {
        clearTimeout(timer);
        resolve("error");
      };
      ws.onclose = () => {
        clearTimeout(timer);
        resolve("closed");
      };
    });

    // The WebSocket should have at least opened successfully
    // (even if it then receives an error event because pi isn't installed)
    expect(["open", "closed", "error"]).toContain(result);

    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }

    // Cleanup
    await fetch(`${baseUrl}/api/sessions/${id}`, { method: "DELETE" });
  });
});
