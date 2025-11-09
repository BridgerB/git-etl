import type { Database } from "jsr:@db/sqlite@^0.12";
import type { GitCommit } from "./git-parser.ts";
import type { DailyStat } from "./types.ts";

export function insertCommits(
  db: Database,
  repoName: string,
  commits: GitCommit[],
): { inserted: number; skipped: number } {
  let inserted = 0;
  let skipped = 0;

  const insertCommitStmt = db.prepare(`
    INSERT INTO commits (
      repo_name, sha, author_email, author_name, committed_at,
      message, additions, deletions, files_changed, is_merge, branch
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(repo_name, sha) DO UPDATE SET
      author_email = excluded.author_email,
      author_name = excluded.author_name,
      committed_at = excluded.committed_at,
      message = excluded.message,
      additions = excluded.additions,
      deletions = excluded.deletions,
      files_changed = excluded.files_changed,
      is_merge = excluded.is_merge,
      branch = excluded.branch
  `);

  for (const commit of commits) {
    try {
      insertCommitStmt.run(
        repoName,
        commit.sha,
        commit.authorEmail,
        commit.authorName,
        commit.committedAt.toISOString(),
        commit.message,
        commit.additions,
        commit.deletions,
        commit.filesChanged,
        commit.isMerge ? 1 : 0,
        commit.branch,
      );
      inserted++;
    } catch (error) {
      skipped++;
      if (
        error instanceof Error && !error.message.includes("UNIQUE constraint")
      ) {
        console.error(`Error inserting commit ${commit.sha}:`, error.message);
      }
    }
  }

  return { inserted, skipped };
}

export function insertDailyStats(db: Database, stats: DailyStat[]): number {
  const insertDailyStatStmt = db.prepare(`
    INSERT INTO daily_stats (
      date, repo_name, author_email, commits_count, additions, deletions, files_changed
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(date, repo_name, author_email) DO UPDATE SET
      commits_count = excluded.commits_count,
      additions = excluded.additions,
      deletions = excluded.deletions,
      files_changed = excluded.files_changed
  `);

  for (const stat of stats) {
    insertDailyStatStmt.run(
      stat.date,
      stat.repoName,
      stat.authorEmail,
      stat.commitsCount,
      stat.additions,
      stat.deletions,
      stat.filesChanged,
    );
  }

  return stats.length;
}

export function upsertRepositoryMetadata(
  db: Database,
  repoName: string,
  language: string | null,
  commits: GitCommit[],
): void {
  const lastCommitAt = commits[0]?.committedAt.toISOString();

  const upsertRepoStmt = db.prepare(`
    INSERT INTO repos (name, language, is_archived, last_commit_at, total_commits)
    VALUES (?, ?, 0, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      language = excluded.language,
      last_commit_at = excluded.last_commit_at,
      total_commits = excluded.total_commits
  `);

  upsertRepoStmt.run(repoName, language, lastCommitAt, commits.length);
}
