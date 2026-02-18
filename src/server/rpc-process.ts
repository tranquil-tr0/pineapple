import { ChildProcess, spawn } from "child_process";
import { EventEmitter } from "events";
import type { RpcEvent } from "@shared/types.js";

/**
 * Manages a single pi agent RPC subprocess.
 * Communicates via newline-delimited JSON on stdin/stdout.
 */
export class RpcProcess extends EventEmitter {
  private proc: ChildProcess | null = null;
  private buffer = "";
  private _alive = false;
  private commandId = 0;

  constructor(
    private piCommand: string,
    private sessionDir: string,
    private sessionId: string,
    private env: Record<string, string>,
  ) {
    super();
  }

  get alive(): boolean {
    return this._alive;
  }

  /**
   * Spawn the RPC subprocess.
   */
  start(): void {
    if (this._alive) return;

    const args = [
      "--mode",
      "rpc",
      "--session-dir",
      this.sessionDir,
      "--session-id",
      this.sessionId,
    ];

    try {
      this.proc = spawn(this.piCommand, args, {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, ...this.env },
      });
    } catch (err) {
      this._alive = false;
      this.emit("error", err);
      return;
    }

    this._alive = true;

    this.proc.stdout!.on("data", (chunk: Buffer) => {
      this.buffer += chunk.toString();
      this.processBuffer();
    });

    this.proc.stderr!.on("data", (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text) {
        console.error(`[rpc:${this.sessionId}] stderr: ${text}`);
      }
    });

    this.proc.on("exit", (code) => {
      this._alive = false;
      this.emit("exit", code);
    });

    this.proc.on("error", (err) => {
      this._alive = false;
      this.emit("error", err);
    });
  }

  /**
   * Send a command to the RPC subprocess.
   */
  send(command: Record<string, unknown>): string {
    if (!this.proc || !this._alive) {
      throw new Error("RPC process is not running");
    }
    const id = String(++this.commandId);
    const msg = { ...command, id };
    this.proc.stdin!.write(JSON.stringify(msg) + "\n");
    return id;
  }

  /**
   * Gracefully terminate the subprocess.
   */
  stop(): void {
    if (this.proc && this._alive) {
      this.proc.stdin!.end();
      this.proc.kill("SIGTERM");
      this._alive = false;
    }
  }

  /**
   * Force-kill the subprocess.
   */
  kill(): void {
    if (this.proc) {
      this.proc.kill("SIGKILL");
      this._alive = false;
    }
  }

  private processBuffer(): void {
    const lines = this.buffer.split("\n");
    // Keep the last (possibly incomplete) line in the buffer
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed) as RpcEvent;
        this.emit("event", parsed);
      } catch {
        // Not JSON — might be raw output, log and skip
        console.error(`[rpc:${this.sessionId}] non-json: ${trimmed}`);
      }
    }
  }
}
