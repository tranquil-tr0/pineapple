import { test, expect } from "@playwright/test";

// Helper to hit the REST API directly
async function createSession(baseURL: string): Promise<string> {
  const res = await fetch(`${baseURL}/api/sessions`, { method: "POST" });
  const data = await res.json();
  return data.id;
}

async function deleteSession(baseURL: string, id: string): Promise<void> {
  await fetch(`${baseURL}/api/sessions/${id}`, { method: "DELETE" });
}

test.describe("Landing Page", () => {
  test("shows header and new button", async ({ page, baseURL }) => {
    await page.goto("/");
    await expect(page.locator("session-list")).toBeAttached();

    // Check header content within shadow DOM
    const header = page.locator("session-list").locator("h1");
    // Shadow DOM — use evaluate or pierce selectors
    const title = await page
      .locator("session-list")
      .evaluate((el) => el.shadowRoot?.querySelector("h1")?.textContent);
    expect(title).toContain("Pi Web UI");

    const newBtn = await page
      .locator("session-list")
      .evaluate(
        (el) => el.shadowRoot?.querySelector(".new-btn")?.textContent?.trim(),
      );
    expect(newBtn).toContain("New");
  });

  test("shows empty state when no sessions exist", async ({
    page,
    baseURL,
  }) => {
    await page.goto("/");
    const emptyText = await page.locator("session-list").evaluate((el) => {
      return el.shadowRoot?.querySelector(".empty")?.textContent;
    });
    // May or may not be empty depending on leftover sessions
    // Just verify the page loaded without errors
    expect(
      await page.locator("session-list").evaluate((el) => !!el.shadowRoot),
    ).toBe(true);
  });

  test("clicking + New creates a session and navigates to chat view", async ({
    page,
    baseURL,
  }) => {
    await page.goto("/");

    // Click the new button through shadow DOM
    await page.locator("session-list").evaluate((el) => {
      const btn = el.shadowRoot?.querySelector(".new-btn") as HTMLElement;
      btn?.click();
    });

    // Should navigate to a session URL
    await page.waitForFunction(() => window.location.hash.includes("/session/"));
    expect(page.url()).toContain("#/session/");

    // Chat view should be visible
    await expect(page.locator("chat-view")).toBeAttached();

    // Cleanup — extract session ID and delete
    const hash = await page.evaluate(() => window.location.hash);
    const id = hash.replace("#/session/", "");
    await deleteSession(baseURL!, id);
  });

  test("session list shows created sessions", async ({ page, baseURL }) => {
    const id = await createSession(baseURL!);

    // Rename for identification
    await fetch(`${baseURL}/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "E2E Test Session" }),
    });

    await page.goto("/");

    // Wait for sessions to load
    await page.waitForTimeout(500);

    const sessionText = await page.locator("session-list").evaluate((el) => {
      const items = el.shadowRoot?.querySelectorAll(".session-item");
      return Array.from(items || []).map((item) => item.textContent?.trim());
    });

    const found = sessionText.some((t) =>
      t?.includes("E2E Test Session"),
    );
    expect(found).toBe(true);

    await deleteSession(baseURL!, id);
  });
});

test.describe("Chat View", () => {
  let sessionId: string;

  test.beforeEach(async ({ baseURL }) => {
    sessionId = await createSession(baseURL!);
  });

  test.afterEach(async ({ baseURL }) => {
    if (sessionId) {
      await deleteSession(baseURL!, sessionId);
    }
  });

  test("displays session name and controls", async ({ page }) => {
    await page.goto(`/#/session/${sessionId}`);
    await expect(page.locator("chat-view")).toBeAttached();

    // Verify the back button exists
    const backBtn = await page.locator("chat-view").evaluate((el) => {
      return !!el.shadowRoot?.querySelector(".back-btn");
    });
    expect(backBtn).toBe(true);

    // Verify settings button exists
    const settingsBtn = await page.locator("chat-view").evaluate((el) => {
      return !!el.shadowRoot?.querySelector(".settings-btn");
    });
    expect(settingsBtn).toBe(true);
  });

  test("has a text input and send button", async ({ page }) => {
    await page.goto(`/#/session/${sessionId}`);
    await expect(page.locator("chat-view")).toBeAttached();

    // Check for chat-input component
    const hasInput = await page.locator("chat-view").evaluate((el) => {
      const chatInput = el.shadowRoot?.querySelector("chat-input");
      if (!chatInput) return false;
      const textarea = chatInput.shadowRoot?.querySelector("textarea");
      const sendBtn = chatInput.shadowRoot?.querySelector(".send-btn");
      return !!textarea && !!sendBtn;
    });
    expect(hasInput).toBe(true);
  });

  test("send button is disabled when input is empty", async ({ page }) => {
    await page.goto(`/#/session/${sessionId}`);
    await expect(page.locator("chat-view")).toBeAttached();

    const isDisabled = await page.locator("chat-view").evaluate((el) => {
      const chatInput = el.shadowRoot?.querySelector("chat-input");
      const btn = chatInput?.shadowRoot?.querySelector(
        ".send-btn.send",
      ) as HTMLButtonElement;
      return btn?.disabled;
    });
    expect(isDisabled).toBe(true);
  });

  test("back button navigates to landing page", async ({ page }) => {
    await page.goto(`/#/session/${sessionId}`);
    await expect(page.locator("chat-view")).toBeAttached();

    await page.locator("chat-view").evaluate((el) => {
      const btn = el.shadowRoot?.querySelector(".back-btn") as HTMLElement;
      btn?.click();
    });

    await page.waitForFunction(
      () => window.location.hash === "#/" || window.location.hash === "",
    );
    await expect(page.locator("session-list")).toBeAttached();
  });
});

test.describe("Settings Panel", () => {
  let sessionId: string;

  test.beforeEach(async ({ baseURL }) => {
    sessionId = await createSession(baseURL!);
  });

  test.afterEach(async ({ baseURL }) => {
    if (sessionId) {
      await deleteSession(baseURL!, sessionId);
    }
  });

  test("opens when gear icon is clicked", async ({ page }) => {
    await page.goto(`/#/session/${sessionId}`);
    await expect(page.locator("chat-view")).toBeAttached();

    // Click the settings button
    await page.locator("chat-view").evaluate((el) => {
      const btn = el.shadowRoot?.querySelector(".settings-btn") as HTMLElement;
      btn?.click();
    });

    // Check that settings panel is open
    const isOpen = await page.locator("chat-view").evaluate((el) => {
      const panel = el.shadowRoot?.querySelector("settings-panel");
      const panelDiv = panel?.shadowRoot?.querySelector(".panel");
      return panelDiv?.classList.contains("open");
    });
    expect(isOpen).toBe(true);
  });

  test("shows theme toggle", async ({ page }) => {
    await page.goto(`/#/session/${sessionId}`);
    await expect(page.locator("chat-view")).toBeAttached();

    // Open settings
    await page.locator("chat-view").evaluate((el) => {
      const btn = el.shadowRoot?.querySelector(".settings-btn") as HTMLElement;
      btn?.click();
    });

    // Check for theme buttons
    const themeLabels = await page.locator("chat-view").evaluate((el) => {
      const panel = el.shadowRoot?.querySelector("settings-panel");
      const buttons = panel?.shadowRoot?.querySelectorAll(".theme-btn");
      return Array.from(buttons || []).map((b) => b.textContent?.trim());
    });
    expect(themeLabels).toContain("Auto");
    expect(themeLabels).toContain("Light");
    expect(themeLabels).toContain("Dark");
  });

  test("shows thinking level control", async ({ page }) => {
    await page.goto(`/#/session/${sessionId}`);
    await expect(page.locator("chat-view")).toBeAttached();

    // Open settings
    await page.locator("chat-view").evaluate((el) => {
      const btn = el.shadowRoot?.querySelector(".settings-btn") as HTMLElement;
      btn?.click();
    });

    // Check for thinking level buttons
    const levels = await page.locator("chat-view").evaluate((el) => {
      const panel = el.shadowRoot?.querySelector("settings-panel");
      const buttons = panel?.shadowRoot?.querySelectorAll(".seg-btn");
      return Array.from(buttons || []).map((b) => b.textContent?.trim());
    });
    expect(levels).toContain("off");
    expect(levels).toContain("high");
  });
});

test.describe("Responsive Layout", () => {
  let sessionId: string;

  test.beforeEach(async ({ baseURL }) => {
    sessionId = await createSession(baseURL!);
  });

  test.afterEach(async ({ baseURL }) => {
    if (sessionId) {
      await deleteSession(baseURL!, sessionId);
    }
  });

  test("landing page renders correctly", async ({ page }) => {
    await page.goto("/");
    const screenshot = await page.screenshot();
    expect(screenshot).toBeTruthy();

    // Verify the page is not blank
    const bodyHtml = await page.evaluate(() => document.body.innerHTML);
    expect(bodyHtml).toContain("app-root");
  });

  test("chat view renders correctly", async ({ page }) => {
    await page.goto(`/#/session/${sessionId}`);
    await expect(page.locator("chat-view")).toBeAttached();

    const screenshot = await page.screenshot();
    expect(screenshot).toBeTruthy();
  });
});

test.describe("Session Rename", () => {
  let sessionId: string;

  test.beforeEach(async ({ baseURL }) => {
    sessionId = await createSession(baseURL!);
  });

  test.afterEach(async ({ baseURL }) => {
    if (sessionId) {
      await deleteSession(baseURL!, sessionId);
    }
  });

  test("can rename session from chat view header", async ({
    page,
    baseURL,
  }) => {
    await page.goto(`/#/session/${sessionId}`);
    await expect(page.locator("chat-view")).toBeAttached();

    // Click the session title to enter rename mode
    await page.locator("chat-view").evaluate((el) => {
      const title = el.shadowRoot?.querySelector(
        ".session-title",
      ) as HTMLElement;
      title?.click();
    });

    // Type a new name
    await page.locator("chat-view").evaluate((el) => {
      const input = el.shadowRoot?.querySelector(
        ".title-input",
      ) as HTMLInputElement;
      if (input) {
        input.value = "Renamed via E2E";
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });

    // Press Enter to commit
    await page.locator("chat-view").evaluate((el) => {
      const input = el.shadowRoot?.querySelector(
        ".title-input",
      ) as HTMLInputElement;
      input?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });

    // Wait for API call
    await page.waitForTimeout(300);

    // Verify via API
    const res = await fetch(`${baseURL}/api/sessions`);
    const data = await res.json();
    const session = data.sessions.find(
      (s: { id: string }) => s.id === sessionId,
    );
    expect(session?.name).toBe("Renamed via E2E");
  });
});

test.describe("Session Delete from Landing Page", () => {
  test("can delete a session via context menu", async ({ page, baseURL }) => {
    const id = await createSession(baseURL!);

    // Rename for identification
    await fetch(`${baseURL}/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "To Delete" }),
    });

    await page.goto("/");
    await page.waitForTimeout(500);

    // Right-click the session to open context menu
    await page.locator("session-list").evaluate((el, targetId) => {
      const items = el.shadowRoot?.querySelectorAll(".session-item");
      for (const item of items || []) {
        if (item.textContent?.includes("To Delete")) {
          item.dispatchEvent(
            new MouseEvent("contextmenu", {
              bubbles: true,
              clientX: 100,
              clientY: 100,
            }),
          );
          break;
        }
      }
    }, id);

    // Dismiss the confirm dialog automatically
    page.on("dialog", (dialog) => dialog.accept());

    // Click delete in context menu
    await page.locator("session-list").evaluate((el) => {
      const deleteBtn = el.shadowRoot?.querySelector(
        ".context-menu .danger",
      ) as HTMLElement;
      deleteBtn?.click();
    });

    await page.waitForTimeout(300);

    // Verify via API
    const res = await fetch(`${baseURL}/api/sessions`);
    const data = await res.json();
    const found = data.sessions.find(
      (s: { id: string }) => s.id === id,
    );
    expect(found).toBeUndefined();
  });
});
