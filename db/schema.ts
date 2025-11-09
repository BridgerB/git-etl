import { Database } from "jsr:@db/sqlite@^0.12";

export function initializeSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS commits (
      commit_id INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_name TEXT NOT NULL,
      sha TEXT NOT NULL,
      author_email TEXT NOT NULL,
      author_name TEXT NOT NULL,
      committed_at TIMESTAMP NOT NULL,
      message TEXT NOT NULL,
      additions INTEGER NOT NULL DEFAULT 0,
      deletions INTEGER NOT NULL DEFAULT 0,
      files_changed INTEGER NOT NULL DEFAULT 0,
      is_merge BOOLEAN NOT NULL DEFAULT 0,
      branch TEXT NOT NULL,
      UNIQUE(repo_name, sha)
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_commits_repo ON commits(repo_name);
    CREATE INDEX IF NOT EXISTS idx_commits_author ON commits(author_email);
    CREATE INDEX IF NOT EXISTS idx_commits_date ON commits(committed_at);
    CREATE INDEX IF NOT EXISTS idx_commits_sha ON commits(sha);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_stats (
      stat_id INTEGER PRIMARY KEY AUTOINCREMENT,
      date DATE NOT NULL,
      repo_name TEXT NOT NULL,
      author_email TEXT NOT NULL,
      commits_count INTEGER NOT NULL DEFAULT 0,
      additions INTEGER NOT NULL DEFAULT 0,
      deletions INTEGER NOT NULL DEFAULT 0,
      files_changed INTEGER NOT NULL DEFAULT 0,
      prs_opened INTEGER NOT NULL DEFAULT 0,
      prs_merged INTEGER NOT NULL DEFAULT 0,
      issues_closed INTEGER NOT NULL DEFAULT 0,
      UNIQUE(date, repo_name, author_email)
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats(date);
    CREATE INDEX IF NOT EXISTS idx_daily_stats_repo ON daily_stats(repo_name);
    CREATE INDEX IF NOT EXISTS idx_daily_stats_author ON daily_stats(author_email);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS pull_requests (
      pr_id INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_name TEXT NOT NULL,
      pr_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      author_email TEXT,
      state TEXT NOT NULL,
      created_at TIMESTAMP,
      merged_at TIMESTAMP,
      closed_at TIMESTAMP,
      additions INTEGER,
      deletions INTEGER,
      time_to_merge_hours REAL,
      review_comments INTEGER,
      UNIQUE(repo_name, pr_number)
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_prs_repo ON pull_requests(repo_name);
    CREATE INDEX IF NOT EXISTS idx_prs_author ON pull_requests(author_email);
    CREATE INDEX IF NOT EXISTS idx_prs_state ON pull_requests(state);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS repos (
      repo_id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      language TEXT,
      is_archived BOOLEAN NOT NULL DEFAULT 0,
      last_commit_at TIMESTAMP,
      total_commits INTEGER NOT NULL DEFAULT 0
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_repos_name ON repos(name);
  `);
}
