import type { Author, GitCommit } from "./git-parser.ts";
import type { SummaryStats } from "./types.ts";

/**
 * Aggregates commit data by author.
 * Calculates first/last commit dates and total commit count per author.
 *
 * @param commits - Array of parsed commits
 * @returns Array of aggregated author statistics
 */
export function aggregateAuthors(commits: GitCommit[]): Author[] {
  const authorMap = new Map<string, Author>();

  for (const commit of commits) {
    const existing = authorMap.get(commit.authorEmail);

    if (!existing) {
      authorMap.set(commit.authorEmail, {
        email: commit.authorEmail,
        name: commit.authorName,
        firstCommitAt: commit.committedAt,
        lastCommitAt: commit.committedAt,
        totalCommits: 1,
      });
    } else {
      existing.totalCommits++;
      existing.name = commit.authorName; // Keep latest name

      if (commit.committedAt < existing.firstCommitAt) {
        existing.firstCommitAt = commit.committedAt;
      }
      if (commit.committedAt > existing.lastCommitAt) {
        existing.lastCommitAt = commit.committedAt;
      }
    }
  }

  return Array.from(authorMap.values());
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
