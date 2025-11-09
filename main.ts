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

if (import.meta.main) {
  const repoPath = Deno.args[0];

  if (!repoPath) {
    console.error("❌ Error: Please provide a repository path");
    console.log("\nUsage: deno run --allow-all main.ts /path/to/repo");
    console.log(
      "Example: deno run --allow-all main.ts /home/bridger/git/sparkplug",
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
