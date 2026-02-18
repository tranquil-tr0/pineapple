import { readdir, readFile, rm, writeFile, stat, mkdir } from "fs/promises";
import { join, basename } from "path";
import { RpcProcess } from "./rpc-process.js";
import type { SessionMeta, RpcEvent } from "@shared/types.js";
import type { ServerConfig } from "./config.js";

interface ActiveSession {
  rpc: RpcProcess;
  idleTimer: ReturnType<typeof setTimeout> | null;
  clients: Set<(event: RpcEvent) => void>;
}

/**
 * Manages session persistence and RPC process lifecycle.
 */
export class SessionManager {
  private active = new Map<string, ActiveSession>();

  constructor(private config: ServerConfig) {}

  get activeCount(): number {
    return this.active.size;
  }

  /**
   * List all persisted sessions.
   */
  async listSessions(): Promise<SessionMeta[]> {
    await mkdir(this.config.sessionDir, { recursive: true });
    const entries = await readdir(this.config.sessionDir);

    const sessions: SessionMeta[] = [];

    for (const entry of entries) {
      const dirPath = join(this.config.sessionDir, entry);
      const st = await stat(dirPath).catch(() => null);
      if (!st || !st.isDirectory()) continue;

      const meta = await this.readSessionMeta(entry, dirPath);
      if (meta) sessions.push(meta);
    }

    sessions.sort(
      (a, b) =>
        new Date(b.lastActivityAt).getTime() -
        new Date(a.lastActivityAt).getTime(),
    );

    return sessions;
  }

  /**
   * Create a new session. Returns the session ID.
   */
  async createSession(): Promise<string> {
    const id = generateId();
    const dir = join(this.config.sessionDir, id);
    await mkdir(dir, { recursive: true });

    // Write initial metadata
    const meta: SessionMetaFile = {
      name: "New Session",
      createdAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
    };
    await writeFile(join(dir, "meta.json"), JSON.stringify(meta, null, 2));

    return id;
  }

  /**
   * Update session name.
   */
  async updateSession(
    id: string,
    updates: { name?: string },
  ): Promise<SessionMeta | null> {
    const dir = join(this.config.sessionDir, id);
    const metaPath = join(dir, "meta.json");

    const existing = await readFile(metaPath, "utf-8").catch(() => null);
    if (!existing) return null;

    const meta: SessionMetaFile = JSON.parse(existing);
    if (updates.name !== undefined) {
      meta.name = updates.name;
    }
    await writeFile(metaPath, JSON.stringify(meta, null, 2));

    return this.readSessionMeta(id, dir);
  }

  /**
   * Delete a session and terminate its process if active.
   */
  async deleteSession(id: string): Promise<boolean> {
    // Stop active process
    const active = this.active.get(id);
    if (active) {
      active.rpc.stop();
      if (active.idleTimer) clearTimeout(active.idleTimer);
      this.active.delete(id);
    }

    const dir = join(this.config.sessionDir, id);
    try {
      await rm(dir, { recursive: true, force: true });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get or spawn an RPC process for a session.
   * Returns the RpcProcess and registers an event listener.
   */
  getOrSpawn(
    sessionId: string,
    listener: (event: RpcEvent) => void,
  ): RpcProcess {
    let entry = this.active.get(sessionId);

    if (!entry || !entry.rpc.alive) {
      // Build env with all provider API keys
      const env: Record<string, string> = {};
      for (const [key, val] of Object.entries(process.env)) {
        if (
          val &&
          (key.endsWith("_API_KEY") || key.endsWith("_API_BASE"))
        ) {
          env[key] = val;
        }
      }

      const rpc = new RpcProcess(
        this.config.piCommand,
        this.config.sessionDir,
        sessionId,
        env,
      );

      entry = {
        rpc,
        idleTimer: null,
        clients: new Set(),
      };

      rpc.on("event", (event: RpcEvent) => {
        for (const client of entry!.clients) {
          client(event);
        }
      });

      rpc.on("exit", () => {
        // Notify all clients
        for (const client of entry!.clients) {
          client({ type: "error", message: "RPC process exited" } as RpcEvent);
        }
      });

      rpc.on("error", (err: Error) => {
        console.error(`[session:${sessionId}] RPC error: ${err.message}`);
        for (const client of entry!.clients) {
          client({
            type: "error",
            message: `RPC process error: ${err.message}`,
          } as RpcEvent);
        }
      });

      rpc.start();
      this.active.set(sessionId, entry);
    }

    // Clear idle timer since a client is connecting
    if (entry.idleTimer) {
      clearTimeout(entry.idleTimer);
      entry.idleTimer = null;
    }

    entry.clients.add(listener);
    return entry.rpc;
  }

  /**
   * Unregister a client listener. Starts idle timer if no clients remain.
   */
  detach(sessionId: string, listener: (event: RpcEvent) => void): void {
    const entry = this.active.get(sessionId);
    if (!entry) return;

    entry.clients.delete(listener);

    if (entry.clients.size === 0) {
      // Start idle timer
      entry.idleTimer = setTimeout(() => {
        entry.rpc.stop();
        this.active.delete(sessionId);
      }, this.config.idleTimeoutMs);
    }
  }

  /**
   * Touch the lastActivityAt timestamp for a session.
   */
  async touchSession(sessionId: string): Promise<void> {
    const dir = join(this.config.sessionDir, sessionId);
    const metaPath = join(dir, "meta.json");
    const raw = await readFile(metaPath, "utf-8").catch(() => null);
    if (!raw) return;

    const meta: SessionMetaFile = JSON.parse(raw);
    meta.lastActivityAt = new Date().toISOString();
    await writeFile(metaPath, JSON.stringify(meta, null, 2));
  }

  /**
   * Auto-name a session from its first user message.
   */
  async autoName(sessionId: string, firstMessage: string): Promise<void> {
    const dir = join(this.config.sessionDir, sessionId);
    const metaPath = join(dir, "meta.json");
    const raw = await readFile(metaPath, "utf-8").catch(() => null);
    if (!raw) return;

    const meta: SessionMetaFile = JSON.parse(raw);
    // Only auto-name if still the default
    if (meta.name === "New Session") {
      meta.name = firstMessage.slice(0, 60).replace(/\n/g, " ").trim();
      if (firstMessage.length > 60) meta.name += "…";
      await writeFile(metaPath, JSON.stringify(meta, null, 2));
    }
  }

  /**
   * Shut down all active sessions.
   */
  shutdown(): void {
    for (const [, entry] of this.active) {
      if (entry.idleTimer) clearTimeout(entry.idleTimer);
      entry.rpc.stop();
    }
    this.active.clear();
  }

  // ---- Private helpers ----

  private async readSessionMeta(
    id: string,
    dirPath: string,
  ): Promise<SessionMeta | null> {
    const metaPath = join(dirPath, "meta.json");
    const raw = await readFile(metaPath, "utf-8").catch(() => null);

    if (!raw) {
      // Session dir exists but no meta — try to infer from directory stat
      const st = await stat(dirPath);
      return {
        id,
        name: id,
        createdAt: st.birthtime.toISOString(),
        lastActivityAt: st.mtime.toISOString(),
        messageCount: 0,
      };
    }

    const meta: SessionMetaFile = JSON.parse(raw);

    // Count messages from JSONL files if present
    let messageCount = 0;
    const files = await readdir(dirPath);
    for (const f of files) {
      if (f.endsWith(".jsonl")) {
        const content = await readFile(join(dirPath, f), "utf-8").catch(
          () => "",
        );
        messageCount += content
          .split("\n")
          .filter((l) => l.trim()).length;
      }
    }

    return {
      id,
      name: meta.name || id,
      createdAt: meta.createdAt || new Date().toISOString(),
      lastActivityAt: meta.lastActivityAt || new Date().toISOString(),
      messageCount,
    };
  }
}

interface SessionMetaFile {
  name: string;
  createdAt: string;
  lastActivityAt: string;
}

function generateId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 12; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}
