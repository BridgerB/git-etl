import type { Database } from "jsr:@db/sqlite@^0.12";
import type { Author, GitCommit, GitTag } from "./git-parser.ts";

/**
 * Inserts or updates commits in the database.
 * Uses UPSERT to handle duplicate commits gracefully.
 *
 * @param db - Database instance
 * @param repoName - Name of the repository
 * @param commits - Array of parsed commits
 * @returns Object containing count of processed commits and errors
 */
export function insertCommits(
  db: Database,
  repoName: string,
  commits: GitCommit[],
): { processed: number; errors: number } {
  let processed = 0;
  let errors = 0;

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
      processed++;
    } catch (error) {
      errors++;
      console.error(
        `❌ Error inserting commit ${
          commit.sha.substring(0, 8)
        } by ${commit.authorEmail}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  return { processed, errors };
}

/**
 * Updates repository metadata including language and commit statistics.
 * Uses UPSERT to create or update repository records.
 *
 * @param db - Database instance
 * @param repoName - Name of the repository
 * @param language - Primary programming language (or null if unknown)
 * @param commits - Array of commits for calculating metadata
 */
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

/**
 * Inserts or updates author records with aggregated statistics.
 * Uses MIN/MAX in SQL to ensure earliest/latest commit dates are preserved.
 *
 * @param db - Database instance
 * @param authors - Array of aggregated author data
 * @returns Number of authors processed
 */
export function insertAuthors(
  db: Database,
  authors: Author[],
): number {
  const upsertAuthorStmt = db.prepare(`
    INSERT INTO authors (email, name, first_commit_at, last_commit_at, total_commits)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      name = excluded.name,
      first_commit_at = MIN(first_commit_at, excluded.first_commit_at),
      last_commit_at = MAX(last_commit_at, excluded.last_commit_at),
      total_commits = total_commits + excluded.total_commits
  `);

  for (const author of authors) {
    upsertAuthorStmt.run(
      author.email,
      author.name,
      author.firstCommitAt.toISOString(),
      author.lastCommitAt.toISOString(),
      author.totalCommits,
    );
  }

  return authors.length;
}

/**
 * Inserts file changes in batches for better performance.
 * Uses INSERT OR IGNORE to skip duplicates without throwing errors.
 *
 * @param db - Database instance
 * @param repoName - Name of the repository
 * @param commits - Array of commits containing file changes
 * @returns Total number of file changes inserted
 */
export function insertFileChanges(
  db: Database,
  repoName: string,
  commits: GitCommit[],
): number {
  const BATCH_SIZE = 1000;

  // Use INSERT OR IGNORE to skip duplicates without errors
  const insertFileChangeStmt = db.prepare(`
    INSERT OR IGNORE INTO file_changes (repo_name, sha, file_path, additions, deletions)
    VALUES (?, ?, ?, ?, ?)
  `);

  // Flatten all file changes into a single array for efficient processing
  interface FileChangeRow {
    repoName: string;
    sha: string;
    filePath: string;
    additions: number;
    deletions: number;
  }

  const allFileChanges: FileChangeRow[] = [];
  for (const commit of commits) {
    for (const fileChange of commit.fileChanges) {
      allFileChanges.push({
        repoName,
        sha: commit.sha,
        filePath: fileChange.filePath,
        additions: fileChange.additions,
        deletions: fileChange.deletions,
      });
    }
  }

  let totalInserted = 0;
  const totalChanges = allFileChanges.length;

  // Process in batches with progress indication for large repos
  for (let i = 0; i < totalChanges; i += BATCH_SIZE) {
    const batch = allFileChanges.slice(
      i,
      Math.min(i + BATCH_SIZE, totalChanges),
    );

    for (const change of batch) {
      const rowsAffected = insertFileChangeStmt.run(
        change.repoName,
        change.sha,
        change.filePath,
        change.additions,
        change.deletions,
      );
      // Returns number of rows modified (1 if inserted, 0 if ignored due to duplicate)
      totalInserted += rowsAffected;
    }

    // Progress indication for large repos (>10k file changes)
    if (
      totalChanges > 10000 && i > 0 &&
      (i % 10000 === 0 || i + BATCH_SIZE >= totalChanges)
    ) {
      const progress = Math.min(i + BATCH_SIZE, totalChanges);
      console.log(
        `    Progress: ${progress.toLocaleString()}/${totalChanges.toLocaleString()} file changes processed`,
      );
    }
  }

  return totalInserted;
}

/**
 * Inserts or updates Git tags.
 * Handles both annotated and lightweight tags.
 *
 * @param db - Database instance
 * @param repoName - Name of the repository
 * @param tags - Array of parsed Git tags
 * @returns Number of tags processed
 */
export function insertTags(
  db: Database,
  repoName: string,
  tags: GitTag[],
): number {
  const insertTagStmt = db.prepare(`
    INSERT INTO tags (
      repo_name, tag_name, sha, tagger_name, tagger_email,
      tag_date, message, is_annotated
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(repo_name, tag_name) DO UPDATE SET
      sha = excluded.sha,
      tagger_name = excluded.tagger_name,
      tagger_email = excluded.tagger_email,
      tag_date = excluded.tag_date,
      message = excluded.message,
      is_annotated = excluded.is_annotated
  `);

  for (const tag of tags) {
    insertTagStmt.run(
      repoName,
      tag.tagName,
      tag.sha,
      tag.taggerName,
      tag.taggerEmail,
      tag.tagDate?.toISOString() || null,
      tag.message,
      tag.isAnnotated ? 1 : 0,
    );
  }

  return tags.length;
}
