import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BUFFER = 2 * 1024 * 1024;

export type GitFileStatus = "A" | "M" | "D" | "R" | "C" | "U" | "?";

export interface GitFileChange {
  status: GitFileStatus;
  path: string;
  oldPath?: string;
}

export interface GitStatusSnapshot {
  isRepo: boolean;
  branch: string;
  head: string;
  staged: GitFileChange[];
  unstaged: GitFileChange[];
}

export interface GitCommitSummary {
  hash: string;
  shortHash: string;
  authoredAt: string;
  subject: string;
}

interface RunGitResult {
  code: number;
  stdout: string;
  stderr: string;
}

export async function getGitStatusSnapshot(cwd: string): Promise<GitStatusSnapshot> {
  const insideWorkTree = await runGit(cwd, ["rev-parse", "--is-inside-work-tree"]);
  if (insideWorkTree.code !== 0 || insideWorkTree.stdout.trim() !== "true") {
    return {
      isRepo: false,
      branch: "",
      head: "",
      staged: [],
      unstaged: [],
    };
  }

  const [branchResult, headResult, statusResult] = await Promise.all([
    runGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]),
    runGit(cwd, ["rev-parse", "HEAD"]),
    runGit(cwd, ["status", "--porcelain=1", "--untracked-files=all"]),
  ]);

  const branch = branchResult.code === 0 ? branchResult.stdout.trim() : "";
  const head = headResult.code === 0 ? headResult.stdout.trim() : "";
  const { staged, unstaged } = parsePorcelainStatus(statusResult.stdout);

  return {
    isRepo: true,
    branch,
    head,
    staged,
    unstaged,
  };
}

export async function getGitCommitHistory(cwd: string, limit: number): Promise<GitCommitSummary[]> {
  const safeLimit = Math.max(1, Math.min(64, Math.floor(limit || 16)));
  const insideWorkTree = await runGit(cwd, ["rev-parse", "--is-inside-work-tree"]);
  if (insideWorkTree.code !== 0 || insideWorkTree.stdout.trim() !== "true") {
    return [];
  }

  const result = await runGit(cwd, [
    "log",
    `-n${safeLimit}`,
    "--date=iso-strict",
    "--pretty=format:%H%x09%h%x09%ad%x09%s",
  ]);

  if (result.code !== 0) return [];

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [hash, shortHash, authoredAt, ...subjectParts] = line.split("\t");
      return {
        hash: hash || "",
        shortHash: shortHash || "",
        authoredAt: authoredAt || "",
        subject: subjectParts.join("\t"),
      };
    })
    .filter((entry) => entry.hash && entry.shortHash);
}

export async function getGitCommitFiles(cwd: string, commit: string): Promise<GitFileChange[] | null> {
  if (!isValidCommitRef(commit)) return null;

  const result = await runGit(cwd, ["show", "--name-status", "--format=", "--find-renames", commit]);
  if (result.code !== 0) return null;

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseNameStatusLine)
    .filter((change): change is GitFileChange => change !== null);
}

export async function getGitDiffForFile(
  cwd: string,
  scope: "staged" | "unstaged" | "commit",
  path: string,
  commit?: string,
): Promise<string | null> {
  const cleanPath = path.trim();
  if (!cleanPath) return null;

  if (scope === "commit") {
    if (!commit || !isValidCommitRef(commit)) return null;
    const result = await runGit(cwd, ["show", "--format=", "--patch", "--find-renames", commit, "--", cleanPath]);
    if (result.code !== 0) return null;
    return result.stdout;
  }

  const args = scope === "staged"
    ? ["diff", "--cached", "--", cleanPath]
    : ["diff", "--", cleanPath];

  const result = await runGit(cwd, args);
  if (result.code !== 0) return null;
  return result.stdout;
}

function parsePorcelainStatus(raw: string): { staged: GitFileChange[]; unstaged: GitFileChange[] } {
  const staged: GitFileChange[] = [];
  const unstaged: GitFileChange[] = [];

  for (const line of raw.split("\n")) {
    if (!line) continue;

    if (line.startsWith("?? ")) {
      const path = line.slice(3).trim();
      if (!path) continue;
      unstaged.push({ status: "?", path: stripPathQuotes(path) });
      continue;
    }

    if (line.length < 4) continue;

    const indexCode = line[0];
    const workTreeCode = line[1];
    const payload = line.slice(3).trim();
    if (!payload) continue;

    const rename = payload.split(" -> ");
    const hasRename = rename.length === 2;
    const oldPath = hasRename ? stripPathQuotes(rename[0]) : undefined;
    const newPath = stripPathQuotes(hasRename ? rename[1] : payload);

    if (indexCode !== " ") {
      staged.push({
        status: normalizeStatusCode(indexCode),
        path: newPath,
        oldPath,
      });
    }

    if (workTreeCode !== " ") {
      unstaged.push({
        status: normalizeStatusCode(workTreeCode),
        path: newPath,
        oldPath,
      });
    }
  }

  return { staged, unstaged };
}

function parseNameStatusLine(line: string): GitFileChange | null {
  const parts = line.split("\t");
  if (parts.length < 2) return null;

  const rawStatus = parts[0].trim();
  const status = normalizeStatusCode(rawStatus[0] || "M");

  if ((rawStatus.startsWith("R") || rawStatus.startsWith("C")) && parts.length >= 3) {
    return {
      status,
      oldPath: stripPathQuotes(parts[1]),
      path: stripPathQuotes(parts[2]),
    };
  }

  return {
    status,
    path: stripPathQuotes(parts[1]),
  };
}

function normalizeStatusCode(value: string): GitFileStatus {
  switch (value) {
    case "A":
    case "M":
    case "D":
    case "R":
    case "C":
    case "U":
    case "?":
      return value;
    default:
      return "M";
  }
}

function stripPathQuotes(path: string): string {
  if (path.startsWith('"') && path.endsWith('"')) {
    return path.slice(1, -1);
  }
  return path;
}

function isValidCommitRef(value: string): boolean {
  return /^[0-9a-f]{7,40}$/i.test(value.trim());
}

async function runGit(cwd: string, args: string[]): Promise<RunGitResult> {
  try {
    const { stdout, stderr } = await execFileAsync("git", ["-C", cwd, ...args], {
      timeout: DEFAULT_TIMEOUT_MS,
      maxBuffer: DEFAULT_MAX_BUFFER,
      encoding: "utf-8",
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const err = error as Error & {
      code?: number;
      stdout?: string;
      stderr?: string;
    };

    return {
      code: typeof err.code === "number" ? err.code : 1,
      stdout: typeof err.stdout === "string" ? err.stdout : "",
      stderr: typeof err.stderr === "string" ? err.stderr : err.message,
    };
  }
}
