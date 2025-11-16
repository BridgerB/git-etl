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

  db.exec(`
    CREATE TABLE IF NOT EXISTS authors (
      author_id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      first_commit_at TIMESTAMP,
      last_commit_at TIMESTAMP,
      total_commits INTEGER NOT NULL DEFAULT 0
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_authors_email ON authors(email);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS file_changes (
      change_id INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_name TEXT NOT NULL,
      sha TEXT NOT NULL,
      file_path TEXT NOT NULL,
      additions INTEGER NOT NULL DEFAULT 0,
      deletions INTEGER NOT NULL DEFAULT 0,
      UNIQUE(repo_name, sha, file_path)
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_file_changes_repo_file ON file_changes(repo_name, file_path);
    CREATE INDEX IF NOT EXISTS idx_file_changes_sha ON file_changes(sha);
    CREATE INDEX IF NOT EXISTS idx_file_changes_repo ON file_changes(repo_name);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS tags (
      tag_id INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_name TEXT NOT NULL,
      tag_name TEXT NOT NULL,
      sha TEXT NOT NULL,
      tagger_name TEXT,
      tagger_email TEXT,
      tag_date TIMESTAMP,
      message TEXT,
      is_annotated BOOLEAN NOT NULL DEFAULT 0,
      UNIQUE(repo_name, tag_name)
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tags_repo ON tags(repo_name);
    CREATE INDEX IF NOT EXISTS idx_tags_sha ON tags(sha);
  `);
}
