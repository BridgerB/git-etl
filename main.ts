import { db } from "./db/index.ts";
import { getRepoInfo, getRepoLanguage, parseGitLog } from "./src/git-parser.ts";
import {
  aggregateDailyStats,
  calculateSummaryStats,
  formatSummaryReport,
} from "./src/transforms.ts";
import {
  insertCommits,
  insertDailyStats,
  upsertRepositoryMetadata,
} from "./src/database.ts";

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

  console.log("💾 Loading commits into database...");
  const { inserted, skipped } = insertCommits(db, repoInfo.name, commits);
  console.log(`✅ Inserted/updated ${inserted} commits (${skipped} skipped)\n`);

  console.log("📈 Generating daily statistics...");
  const dailyStats = aggregateDailyStats(commits, repoInfo.name);
  const statsCount = insertDailyStats(db, dailyStats);
  console.log(`✅ Generated ${statsCount} daily stat records\n`);

  console.log("📚 Updating repository metadata...");
  upsertRepositoryMetadata(db, repoInfo.name, language, commits);
  console.log(`✅ Repository metadata updated\n`);

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

async function loadRepositoriesConfig(
  configPath: string,
): Promise<string[]> {
  try {
    const content = await Deno.readTextFile(configPath);
    const config = JSON.parse(content);

    if (!config.repositories || !Array.isArray(config.repositories)) {
      throw new Error(
        "Invalid config format: 'repositories' array not found",
      );
    }

    return config.repositories;
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

      for (const repoPath of repositories) {
        try {
          const stat = await Deno.stat(repoPath);
          if (!stat.isDirectory) {
            console.error(`⚠️  Skipping ${repoPath}: not a directory\n`);
            failCount++;
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
      if (failCount > 0) {
        console.log(`⚠️  ${failCount} repositories failed`);
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
