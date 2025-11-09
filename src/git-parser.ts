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
}

export interface GitRepoInfo {
  name: string;
  path: string;
  currentBranch: string;
}

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

    const msgEndIndex = lines.findIndex((line) => line === "COMMIT_MSG_END");
    if (msgEndIndex !== -1) {
      for (let i = msgEndIndex + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const parts = line.split(/\s+/);
        if (parts.length >= 3) {
          const add = parts[0] === "-" ? 0 : parseInt(parts[0]) || 0;
          const del = parts[1] === "-" ? 0 : parseInt(parts[1]) || 0;

          additions += add;
          deletions += del;
          filesChanged++;
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
    });
  }

  return commits;
}

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
