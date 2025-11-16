import { db } from "./db/index.ts";
import {
  getRepoInfo,
  getRepoLanguage,
  parseGitLog,
  parseGitTags,
} from "./src/git-parser.ts";
import {
  aggregateAuthors,
  calculateSummaryStats,
  formatSummaryReport,
} from "./src/transforms.ts";
import {
  insertAuthors,
  insertCommits,
  insertFileChanges,
  insertTags,
  upsertRepositoryMetadata,
} from "./src/database.ts";
import { withTransaction } from "./src/transactions.ts";

/**
 * Checks if a repository has at least one commit by a specific author.
 * Used to filter out repos before full ETL processing.
 *
 * @param repoPath - Path to the git repository
 * @param authorPattern - Author name/email pattern to search for (default: "BridgerB")
 * @returns True if repo has commits by the author, false otherwise
 */
async function hasCommitsByAuthor(
  repoPath: string,
  authorPattern = "BridgerB",
): Promise<boolean> {
  try {
    // Get current branch first
    const branchCmd = new Deno.Command("git", {
      args: ["-C", repoPath, "rev-parse", "--abbrev-ref", "HEAD"],
      stdout: "piped",
      stderr: "piped",
    });

    const branchOutput = await branchCmd.output();
    if (!branchOutput.success) {
      // No valid HEAD - probably empty repo or detached HEAD
      return false;
    }

    const branch = new TextDecoder().decode(branchOutput.stdout).trim();

    // Check if there are any commits by the author
    const cmd = new Deno.Command("git", {
      args: [
        "-C",
        repoPath,
        "log",
        branch,
        "--author",
        authorPattern,
        "--format=%H",
        "-n",
        "1",
      ],
      stdout: "piped",
      stderr: "piped",
    });

    const output = await cmd.output();
    if (!output.success) {
      return false;
    }

    const result = new TextDecoder().decode(output.stdout).trim();
    return result.length > 0;
  } catch {
    return false;
  }
}

async function etlGitRepo(repoPath: string): Promise<void> {
  console.log(`\n🔄 Starting ETL for repository: ${repoPath}\n`);

  const repoInfo = await getRepoInfo(repoPath);
  const language = await getRepoLanguage(repoPath);

  console.log("📊 Parsing git commits...");
  const commits = await parseGitLog(repoPath, repoInfo.currentBranch);
  console.log(`✅ Found ${commits.length} commits\n`);

  if (commits.length === 0) {
    console.log("⚠️  No commits found. Exiting.");
    return;
  }

  console.log("💾 Loading data into database (in transaction)...");

  // Aggregate authors before transaction
  const authors = aggregateAuthors(commits);

  // Parse tags before transaction
  const tags = await parseGitTags(repoPath);

  // All database writes in a single transaction for maximum performance
  withTransaction(db, () => {
    const { processed, errors } = insertCommits(
      db,
      repoInfo.name,
      commits,
    );
    console.log(
      `  ✅ Processed ${processed} commits${
        errors > 0 ? ` (${errors} errors)` : ""
      }`,
    );

    const authorsCount = insertAuthors(db, authors);
    console.log(`  ✅ Processed ${authorsCount} authors`);

    const fileChangesCount = insertFileChanges(db, repoInfo.name, commits);
    console.log(`  ✅ Inserted ${fileChangesCount} file changes`);

    if (tags.length > 0) {
      const tagsCount = insertTags(db, repoInfo.name, tags);
      console.log(`  ✅ Inserted ${tagsCount} tags`);
    } else {
      console.log(`  ✅ No tags found`);
    }

    upsertRepositoryMetadata(db, repoInfo.name, language, commits);
    console.log(`  ✅ Repository metadata updated`);
  });

  console.log(`✅ Database transaction completed\n`);

  const summaryStats = calculateSummaryStats(commits);
  const report = formatSummaryReport(
    summaryStats,
    repoInfo.name,
    language,
    repoInfo.currentBranch,
  );

  console.log(report);
  console.log("\n✅ ETL completed successfully!\n");
}

/**
 * Recursively scans a directory for Git repositories.
 * A directory is considered a git repo if it contains a .git folder.
 *
 * @param searchPath - Directory path to scan
 * @param maxDepth - Maximum depth to search (default: 3)
 * @returns Array of absolute paths to git repositories found
 */
async function findGitRepositories(
  searchPath: string,
  maxDepth = 3,
): Promise<string[]> {
  const repos: string[] = [];

  async function scan(dirPath: string, currentDepth: number): Promise<void> {
    if (currentDepth > maxDepth) return;

    try {
      // Check if this directory itself is a git repo
      const gitPath = `${dirPath}/.git`;
      try {
        const gitStat = await Deno.stat(gitPath);
        if (gitStat.isDirectory) {
          // This is a git repo, add it and don't scan deeper
          repos.push(dirPath);
          return;
        }
      } catch {
        // .git doesn't exist, continue scanning
      }

      // Scan subdirectories
      const entries = Deno.readDir(dirPath);
      for await (const entry of entries) {
        if (!entry.isDirectory) continue;

        // Skip hidden directories (except we already checked .git above)
        if (entry.name.startsWith(".")) continue;

        // Skip common non-repo directories
        const skipDirs = [
          "node_modules",
          "venv",
          ".venv",
          "dist",
          "build",
          "target",
        ];
        if (skipDirs.includes(entry.name)) continue;

        const subPath = `${dirPath}/${entry.name}`;
        await scan(subPath, currentDepth + 1);
      }
    } catch (error) {
      // Handle permission denied and other errors gracefully
      if (error instanceof Deno.errors.PermissionDenied) {
        console.warn(`⚠️  Permission denied: ${dirPath}`);
      } else if (!(error instanceof Deno.errors.NotFound)) {
        console.warn(
          `⚠️  Error scanning ${dirPath}: ${
            error instanceof Error ? error.message : error
          }`,
        );
      }
    }
  }

  await scan(searchPath, 0);
  return repos;
}

/**
 * Loads repository configuration from JSON file.
 * Supports both explicit repository paths and directory scanning.
 *
 * @param configPath - Path to repositories.json config file
 * @returns Array of repository paths to process
 */
async function loadRepositoriesConfig(
  configPath: string,
): Promise<string[]> {
  try {
    const content = await Deno.readTextFile(configPath);
    const config = JSON.parse(content);

    const allRepos: string[] = [];
    let explicitCount = 0;
    let scannedCount = 0;

    // Load explicit repositories
    if (config.repositories && Array.isArray(config.repositories)) {
      explicitCount = config.repositories.length;
      allRepos.push(...config.repositories);
      console.log(`  Found ${explicitCount} explicit repositories`);
    }

    // Scan paths for git repositories
    if (config.paths && Array.isArray(config.paths)) {
      console.log(
        `  Scanning ${config.paths.length} paths for git repositories...`,
      );
      for (const scanPath of config.paths) {
        try {
          const stat = await Deno.stat(scanPath);
          if (!stat.isDirectory) {
            console.warn(`  ⚠️  Skipping ${scanPath}: not a directory`);
            continue;
          }

          const foundRepos = await findGitRepositories(scanPath);
          scannedCount += foundRepos.length;
          allRepos.push(...foundRepos);
          console.log(`    Found ${foundRepos.length} repos in ${scanPath}`);
        } catch (error) {
          console.warn(
            `  ⚠️  Error scanning ${scanPath}: ${
              error instanceof Error ? error.message : error
            }`,
          );
        }
      }
    }

    // Validate that we have at least one source
    if (allRepos.length === 0) {
      throw new Error(
        "No repositories found. Config must have 'repositories' and/or 'paths' array",
      );
    }

    // Remove duplicates and normalize paths
    const uniqueRepos = [...new Set(allRepos.map((p) => p.replace(/\/$/, "")))];

    // Apply ignore list
    let ignoredCount = 0;
    let finalRepos = uniqueRepos;

    if (config.ignore && Array.isArray(config.ignore)) {
      const ignoreSet = new Set(
        config.ignore.map((p: string) => p.replace(/\/$/, "")),
      );
      finalRepos = uniqueRepos.filter((repo) => {
        const shouldIgnore = ignoreSet.has(repo);
        if (shouldIgnore) ignoredCount++;
        return !shouldIgnore;
      });

      if (ignoredCount > 0) {
        console.log(`  Ignored ${ignoredCount} repositories`);
      }
    }

    console.log(
      `  Total: ${finalRepos.length} repositories to process (${explicitCount} explicit + ${scannedCount} scanned - ${ignoredCount} ignored)\n`,
    );

    return finalRepos;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new Error(`Config file not found: ${configPath}`);
    }
    throw error;
  }
}

if (import.meta.main) {
  const firstArg = Deno.args[0];

  // Check if using config file mode
  if (firstArg === "--config" || firstArg === "-c") {
    const configPath = Deno.args[1] || "./repositories.json";

    console.log(`📋 Loading repositories from: ${configPath}\n`);

    try {
      const repositories = await loadRepositoriesConfig(configPath);
      console.log(`Found ${repositories.length} repositories to process\n`);

      let successCount = 0;
      let failCount = 0;
      let skippedCount = 0;

      for (const repoPath of repositories) {
        try {
          const stat = await Deno.stat(repoPath);
          if (!stat.isDirectory) {
            console.error(`⚠️  Skipping ${repoPath}: not a directory\n`);
            skippedCount++;
            continue;
          }

          // Check if repo has commits by BridgerB before full ETL
          const hasMyCommits = await hasCommitsByAuthor(repoPath, "BridgerB");
          if (!hasMyCommits) {
            console.log(`⏭️  Skipping ${repoPath}: no commits by BridgerB\n`);
            skippedCount++;
            continue;
          }

          await etlGitRepo(repoPath);
          successCount++;
        } catch (error) {
          console.error(
            `❌ Failed to process ${repoPath}:`,
            error instanceof Error ? error.message : error,
            "\n",
          );
          failCount++;
        }
      }

      console.log("\n" + "=".repeat(60));
      console.log(
        `✅ Processed ${successCount}/${repositories.length} repositories successfully`,
      );
      if (skippedCount > 0) {
        console.log(
          `⏭️  ${skippedCount} repositories skipped (no BridgerB commits or invalid)`,
        );
      }
      if (failCount > 0) {
        console.log(`❌ ${failCount} repositories failed`);
      }
      console.log("=".repeat(60) + "\n");

      db.close();
    } catch (error) {
      console.error(
        "❌ Error loading config:",
        error instanceof Error ? error.message : error,
      );
      db.close();
      Deno.exit(1);
    }
  } else {
    // Single repository mode (backward compatible)
    const repoPath = firstArg;

    if (!repoPath) {
      console.error(
        "❌ Error: Please provide a repository path or config file",
      );
      console.log("\nUsage:");
      console.log(
        "  Single repo:   deno run --allow-all main.ts /path/to/repo",
      );
      console.log(
        "  Multiple repos: deno run --allow-all main.ts --config repositories.json",
      );
      console.log(
        "\nExample: deno run --allow-all main.ts /home/bridger/git/sparkplug",
      );
      Deno.exit(1);
    }

    try {
      const stat = await Deno.stat(repoPath);
      if (!stat.isDirectory) {
        console.error(`❌ Error: ${repoPath} is not a directory`);
        Deno.exit(1);
      }
    } catch {
      console.error(`❌ Error: Path does not exist: ${repoPath}`);
      Deno.exit(1);
    }

    // Check if repo has commits by BridgerB
    const hasMyCommits = await hasCommitsByAuthor(repoPath, "BridgerB");
    if (!hasMyCommits) {
      console.log(`⏭️  Repository has no commits by BridgerB. Skipping.`);
      db.close();
      Deno.exit(0);
    }

    try {
      await etlGitRepo(repoPath);
      db.close();
    } catch (error) {
      console.error(
        "\n❌ ETL failed:",
        error instanceof Error ? error.message : error,
      );
      db.close();
      Deno.exit(1);
    }
  }
}
