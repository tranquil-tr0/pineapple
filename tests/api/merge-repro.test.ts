import { describe, it, expect } from "vitest";
import { mergeMessages } from "../../src/server/ws-handler.ts";
import type { AgentMessageData } from "../../src/shared/types.js";

describe("mergeMessages", () => {
  it("should return history only if live is empty", () => {
    const history: AgentMessageData[] = [{ role: "user", content: "hi", id: "1" }];
    const live: AgentMessageData[] = [];
    const result = mergeMessages(history, live);
    expect(result).toEqual(history);
  });

  it("should merge based on ID match", () => {
    const history: AgentMessageData[] = [
      { role: "user", content: "msg1", id: "1" },
      { role: "assistant", content: "msg2", id: "2" },
      { role: "user", content: "msg3", id: "3" },
    ];
    const live: AgentMessageData[] = [
      { role: "user", content: "msg3", id: "3" },
      { role: "assistant", content: "msg4", id: "4" },
    ];
    
    const result = mergeMessages(history, live);
    expect(result).toHaveLength(4);
    expect(result[0].id).toBe("1");
    expect(result[1].id).toBe("2");
    expect(result[2].id).toBe("3");
    expect(result[3].id).toBe("4");
  });

  it("succeeds matching by timestamp if IDs are missing in live", () => {
    const t1 = 1000;
    const t2 = 2000;
    const history: AgentMessageData[] = [
      { role: "user", content: "msg1", id: "1", timestamp: t1 },
      { role: "assistant", content: "msg2", id: "2", timestamp: t2 }
    ];
    // msg2 is in live but has no ID
    const live: AgentMessageData[] = [
      { role: "assistant", content: "msg2", timestamp: t2 },
      { role: "user", content: "msg3", timestamp: 3000 }
    ];
    
    const result = mergeMessages(history, live);
    expect(result).toHaveLength(3); 
    expect(result[0].id).toBe("1");
    expect(result[1].id).toBe("2"); // ID restored!
    expect(result[2].timestamp).toBe(3000);
  });

  it("handles compactionSummary intersection without ID", () => {
    const t1 = 1000;
    const tComp = 1500;
    const history: AgentMessageData[] = [
      { role: "user", content: "msg1", id: "1", timestamp: t1 },
      { role: "compactionSummary", summary: "...", id: "comp1", timestamp: tComp },
      { role: "assistant", content: "msg2", id: "2", timestamp: 2000 }
    ];
    // Live starts with compaction summary
    const live: AgentMessageData[] = [
      { role: "compactionSummary", summary: "...", timestamp: tComp },
      { role: "assistant", content: "msg2", timestamp: 2000 },
      { role: "user", content: "msg3", timestamp: 3000 }
    ];

    const result = mergeMessages(history, live);
    expect(result).toHaveLength(4);
    expect(result[0].id).toBe("1");
    expect(result[1].id).toBe("comp1");
    expect(result[2].id).toBe("2");
    expect(result[3].timestamp).toBe(3000);
  });
});
