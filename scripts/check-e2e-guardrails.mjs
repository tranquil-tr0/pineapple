import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const E2E_DIR = path.join(ROOT, "tests", "e2e");
const BASELINE_PATH = path.join(E2E_DIR, ".guardrail-baseline.json");

const updateBaseline = process.argv.includes("--update-baseline");

const bannedMatchers = [
  {
    id: "mutate-view-state",
    reason: "Do not mutate chat-view internals directly in E2E tests.",
    pattern: /\bview\.(messages|commands|systemPrompt|wsSend)\s*=/g,
  },
  {
    id: "call-view-request-update",
    reason: "Do not force component rerenders from E2E tests.",
    pattern: /\bview\.requestUpdate\s*\(/g,
  },
  {
    id: "call-view-handle-agent-event",
    reason: "Do not invoke internal component methods from E2E tests.",
    pattern: /\bview\.handleAgentEvent\b/g,
  },
  {
    id: "call-route-submit-internal",
    reason: "Do not call internal route-and-submit helpers from E2E tests.",
    pattern: /\brouteAndSubmit(?:Text|Input)?\b/g,
  },
];

async function collectTsFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTsFiles(fullPath)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

function buildViolation(filePath, source, matcher, matchIndex) {
  const before = source.slice(0, matchIndex);
  const line = before.split(/\r?\n/).length;
  const lineText = source.split(/\r?\n/)[line - 1] || "";
  const relFile = path.relative(ROOT, filePath);
  const snippet = lineText.trim();
  const fingerprint = `${relFile}|${matcher.id}|${snippet}`;

  return {
    file: relFile,
    line,
    matcher: matcher.id,
    reason: matcher.reason,
    snippet,
    fingerprint,
  };
}

async function loadBaseline() {
  const raw = await fs.readFile(BASELINE_PATH, "utf8");
  const parsed = JSON.parse(raw);
  return new Set(parsed.allowedFingerprints || []);
}

async function main() {
  const files = await collectTsFiles(E2E_DIR);
  const violations = [];

  for (const filePath of files) {
    const source = await fs.readFile(filePath, "utf8");
    for (const matcher of bannedMatchers) {
      matcher.pattern.lastIndex = 0;
      let match;
      while ((match = matcher.pattern.exec(source)) !== null) {
        violations.push(buildViolation(filePath, source, matcher, match.index));
      }
    }
  }

  if (updateBaseline) {
    const payload = {
      generatedAt: new Date().toISOString(),
      note:
        "Baseline for known E2E internal-mutation guardrail hits. New hits fail check:e2e:guardrails.",
      allowedFingerprints: Array.from(
        new Set(violations.map((v) => v.fingerprint)),
      ).sort(),
    };
    await fs.writeFile(BASELINE_PATH, `${JSON.stringify(payload, null, 2)}\n`);
    console.log(
      `Updated ${path.relative(ROOT, BASELINE_PATH)} with ${payload.allowedFingerprints.length} fingerprint(s).`,
    );
    return;
  }

  let baseline;
  try {
    baseline = await loadBaseline();
  } catch {
    console.error(
      `Missing baseline at ${path.relative(ROOT, BASELINE_PATH)}. Run: npm run check:e2e:guardrails:update-baseline`,
    );
    process.exit(1);
  }

  const unexpected = violations.filter((v) => !baseline.has(v.fingerprint));

  if (unexpected.length > 0) {
    console.error(
      `Found ${unexpected.length} new E2E guardrail violation(s). Use user-driven interactions instead of internal mutation/calls:`,
    );
    for (const violation of unexpected) {
      console.error(
        `- ${violation.file}:${violation.line} [${violation.matcher}] ${violation.reason}\n  ${violation.snippet}`,
      );
    }
    process.exit(1);
  }

  console.log(
    `E2E guardrails OK: ${violations.length} known baseline hit(s), 0 new violation(s).`,
  );
}

await main();
