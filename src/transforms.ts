import type { GitCommit } from "./git-parser.ts";
import type { DailyStat, SummaryStats } from "./types.ts";

export function aggregateDailyStats(
  commits: GitCommit[],
  repoName: string,
): DailyStat[] {
  const dailyStatsMap = new Map<string, DailyStat>();

  for (const commit of commits) {
    const date = commit.committedAt.toISOString().split("T")[0];
    const key = `${date}|${repoName}|${commit.authorEmail}`;

    const existing = dailyStatsMap.get(key);
    if (existing) {
      existing.commitsCount++;
      existing.additions += commit.additions;
      existing.deletions += commit.deletions;
      existing.filesChanged += commit.filesChanged;
    } else {
      dailyStatsMap.set(key, {
        date,
        repoName,
        authorEmail: commit.authorEmail,
        commitsCount: 1,
        additions: commit.additions,
        deletions: commit.deletions,
        filesChanged: commit.filesChanged,
      });
    }
  }

  return Array.from(dailyStatsMap.values());
}

export function calculateSummaryStats(commits: GitCommit[]): SummaryStats {
  const totalCommits = commits.length;
  const totalAdditions = commits.reduce((sum, c) => sum + c.additions, 0);
  const totalDeletions = commits.reduce((sum, c) => sum + c.deletions, 0);
  const totalFilesChanged = commits.reduce((sum, c) => sum + c.filesChanged, 0);
  const mergeCommitsCount = commits.filter((c) => c.isMerge).length;
  const uniqueAuthorsCount = new Set(commits.map((c) => c.authorEmail)).size;

  const dateFrom = commits[commits.length - 1]?.committedAt.toISOString()
    .split("T")[0] || "";
  const dateTo = commits[0]?.committedAt.toISOString().split("T")[0] || "";

  return {
    totalCommits,
    totalAdditions,
    totalDeletions,
    totalFilesChanged,
    mergeCommitsCount,
    uniqueAuthorsCount,
    dateRange: { from: dateFrom, to: dateTo },
  };
}

export function formatSummaryReport(
  stats: SummaryStats,
  repoName: string,
  language: string | null,
  currentBranch: string,
): string {
  const lines = [
    `📁 Repository: ${repoName}`,
    `🌿 Current branch: ${currentBranch}`,
    `💻 Primary language: ${language || "Unknown"}`,
    "",
    "📊 Summary Statistics:",
    `   Total commits: ${stats.totalCommits}`,
    `   Total additions: ${stats.totalAdditions.toLocaleString()}`,
    `   Total deletions: ${stats.totalDeletions.toLocaleString()}`,
    `   Files changed: ${stats.totalFilesChanged.toLocaleString()}`,
    `   Merge commits: ${stats.mergeCommitsCount}`,
    `   Unique authors: ${stats.uniqueAuthorsCount}`,
    `   Date range: ${stats.dateRange.from} to ${stats.dateRange.to}`,
  ];

  return lines.join("\n");
}
