export interface GitCommit {
  sha: string;
  authorEmail: string;
  authorName: string;
  committedAt: Date;
  message: string;
  additions: number;
  deletions: number;
  filesChanged: number;
  isMerge: boolean;
  branch: string;
  fileChanges: FileChange[];
}

export interface FileChange {
  filePath: string;
  additions: number;
  deletions: number;
}

export interface GitTag {
  tagName: string;
  sha: string;
  taggerName: string | null;
  taggerEmail: string | null;
  tagDate: Date | null;
  message: string | null;
  isAnnotated: boolean;
}

export interface Author {
  email: string;
  name: string;
  firstCommitAt: Date;
  lastCommitAt: Date;
  totalCommits: number;
}

export interface GitRepoInfo {
  name: string;
  path: string;
  currentBranch: string;
}

/**
 * Retrieves basic repository information.
 * Extracts repository name from path and current branch name.
 *
 * @param repoPath - Absolute path to the git repository
 * @returns Repository information including name, path, and current branch
 * @throws Error if unable to determine current branch
 */
export async function getRepoInfo(repoPath: string): Promise<GitRepoInfo> {
  const pathParts = repoPath.replace(/\/$/, "").split("/");
  const name = pathParts[pathParts.length - 1];

  const branchCmd = new Deno.Command("git", {
    args: ["-C", repoPath, "rev-parse", "--abbrev-ref", "HEAD"],
    stdout: "piped",
    stderr: "piped",
  });

  const branchOutput = await branchCmd.output();
  if (!branchOutput.success) {
    throw new Error(
      `Failed to get branch: ${new TextDecoder().decode(branchOutput.stderr)}`,
    );
  }

  const currentBranch = new TextDecoder().decode(branchOutput.stdout).trim();

  return {
    name,
    path: repoPath,
    currentBranch,
  };
}

/**
 * Parses the complete Git commit history for a branch.
 * Extracts commit metadata, file statistics, and individual file changes.
 *
 * @param repoPath - Absolute path to the git repository
 * @param branch - Branch name to parse (e.g., "main", "develop")
 * @returns Array of parsed commits with full metadata and file changes
 * @throws Error if git log command fails
 */
export async function parseGitLog(
  repoPath: string,
  branch: string,
): Promise<GitCommit[]> {
  const cmd = new Deno.Command("git", {
    args: [
      "-C",
      repoPath,
      "log",
      branch,
      "--pretty=format:COMMIT_START%n%H%n%ae%n%an%n%ct%n%P%n%s%nCOMMIT_MSG_END",
      "--numstat",
    ],
    stdout: "piped",
    stderr: "piped",
  });

  const output = await cmd.output();

  if (!output.success) {
    const error = new TextDecoder().decode(output.stderr);
    throw new Error(`Failed to run git log: ${error}`);
  }

  const logOutput = new TextDecoder().decode(output.stdout);
  const commits: GitCommit[] = [];

  const commitBlocks = logOutput.split("COMMIT_START\n").filter((block) =>
    block.trim()
  );

  for (const block of commitBlocks) {
    const lines = block.split("\n");

    if (lines.length < 6) continue;

    const sha = lines[0].trim();
    const authorEmail = lines[1].trim();
    const authorName = lines[2].trim();
    const timestamp = parseInt(lines[3].trim());
    const parents = lines[4].trim().split(" ").filter((p) => p);
    const message = lines[5].trim();

    let additions = 0;
    let deletions = 0;
    let filesChanged = 0;
    const fileChanges: FileChange[] = [];

    const msgEndIndex = lines.findIndex((line) => line === "COMMIT_MSG_END");
    if (msgEndIndex !== -1) {
      for (let i = msgEndIndex + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const parts = line.split(/\s+/);
        if (parts.length >= 3) {
          const add = parts[0] === "-" ? 0 : parseInt(parts[0]) || 0;
          const del = parts[1] === "-" ? 0 : parseInt(parts[1]) || 0;
          const filePath = parts.slice(2).join(" ");

          additions += add;
          deletions += del;
          filesChanged++;

          fileChanges.push({
            filePath,
            additions: add,
            deletions: del,
          });
        }
      }
    }

    commits.push({
      sha,
      authorEmail,
      authorName,
      committedAt: new Date(timestamp * 1000),
      message,
      additions,
      deletions,
      filesChanged,
      isMerge: parents.length > 1,
      branch,
      fileChanges,
    });
  }

  return commits;
}

/**
 * Determines the primary programming language of a repository.
 * Analyzes file extensions and returns the most common recognized language.
 *
 * @param repoPath - Absolute path to the git repository
 * @returns Primary language name (e.g., "TypeScript", "Python") or null if unknown
 */
export async function getRepoLanguage(
  repoPath: string,
): Promise<string | null> {
  try {
    const cmd = new Deno.Command("git", {
      args: ["-C", repoPath, "ls-files"],
      stdout: "piped",
      stderr: "piped",
    });

    const output = await cmd.output();
    if (!output.success) return null;

    const files = new TextDecoder().decode(output.stdout).split("\n");
    const extCounts: Record<string, number> = {};

    for (const file of files) {
      const ext = file.split(".").pop()?.toLowerCase();
      if (ext && ext !== file) {
        extCounts[ext] = (extCounts[ext] || 0) + 1;
      }
    }

    const languageMap: Record<string, string> = {
      ts: "TypeScript",
      js: "JavaScript",
      tsx: "TypeScript",
      jsx: "JavaScript",
      py: "Python",
      go: "Go",
      rs: "Rust",
      java: "Java",
      c: "C",
      cpp: "C++",
      cs: "C#",
      rb: "Ruby",
      php: "PHP",
      swift: "Swift",
      kt: "Kotlin",
      scala: "Scala",
      sh: "Shell",
    };

    let maxCount = 0;
    let primaryExt = "";

    for (const [ext, count] of Object.entries(extCounts)) {
      if (count > maxCount && languageMap[ext]) {
        maxCount = count;
        primaryExt = ext;
      }
    }

    return languageMap[primaryExt] || null;
  } catch {
    return null;
  }
}

/**
 * Parses all Git tags from a repository.
 * Uses `git for-each-ref` for efficient single-command parsing.
 *
 * @param repoPath - Path to the git repository
 * @returns Array of parsed Git tags
 */
export async function parseGitTags(repoPath: string): Promise<GitTag[]> {
  // Use git for-each-ref to get all tag data in a single command
  // Format: refname|objecttype|objectname|taggername|taggeremail|taggerdate|subject|contents
  const cmd = new Deno.Command("git", {
    args: [
      "-C",
      repoPath,
      "for-each-ref",
      "refs/tags",
      "--format=%(refname:short)|%(objecttype)|%(objectname)|%(taggername)|%(taggeremail)|%(taggerdate:unix)|%(subject)|%(contents:body)",
    ],
    stdout: "piped",
    stderr: "piped",
  });

  const output = await cmd.output();
  if (!output.success) {
    const errorMsg = new TextDecoder().decode(output.stderr);
    if (errorMsg.trim()) {
      console.error(`Failed to parse tags: ${errorMsg}`);
    }
    return [];
  }

  const lines = new TextDecoder().decode(output.stdout)
    .split("\n")
    .filter((line) => line.trim());

  const tags: GitTag[] = [];

  for (const line of lines) {
    const parts = line.split("|");
    if (parts.length < 8) continue;

    const [
      tagName,
      objectType,
      sha,
      taggerName,
      taggerEmail,
      taggerDateStr,
      subject,
      body,
    ] = parts;

    // objectType is "tag" for annotated tags, "commit" for lightweight tags
    const isAnnotated = objectType === "tag";

    // For annotated tags, we have tagger info; for lightweight tags, these are empty
    const parsedTaggerName = isAnnotated && taggerName ? taggerName : null;
    const parsedTaggerEmail = isAnnotated && taggerEmail
      ? taggerEmail.replace(/^<|>$/g, "")
      : null;

    // Parse date
    const timestamp = parseInt(taggerDateStr);
    const tagDate = !isNaN(timestamp) && timestamp > 0
      ? new Date(timestamp * 1000)
      : null;

    // Build message from subject and body
    let message: string | null = null;
    if (isAnnotated) {
      if (body && body.trim()) {
        message = `${subject}\n\n${body.trim()}`;
      } else if (subject) {
        message = subject;
      }
    }

    tags.push({
      tagName,
      sha,
      taggerName: parsedTaggerName,
      taggerEmail: parsedTaggerEmail,
      tagDate,
      message,
      isAnnotated,
    });
  }

  return tags;
}
