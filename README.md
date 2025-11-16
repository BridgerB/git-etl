# Git ETL to SQLite

Extract git repository data into a SQLite database for analysis in Metabase.

## Usage

### Single Repository

```bash
# Run ETL on a single repository
deno run --allow-all main.ts /path/to/repo
```

### Multiple Repositories

```bash
# Process multiple repositories from a config file
deno run --allow-all main.ts --config repositories.json
```

**Setup:**

1. Copy `repositories.example.json` to `repositories.json`
2. Edit `repositories.json` with your repository configuration
3. Run with `--config` flag

The `repositories.json` file is git-ignored to keep your local paths private.

**Configuration Format:**

```json
{
  "repositories": [
    "/path/to/specific/repo"
  ],
  "paths": [
    "/home/user/projects"
  ],
  "ignore": [
    "/home/user/projects/skip-this"
  ]
}
```

- `repositories` (optional): Array of explicit repository paths to process
- `paths` (optional): Array of directories to scan for git repositories
- `ignore` (optional): Array of repository paths to exclude from processing

At least one of `repositories` or `paths` must be provided. The tool will:

1. Add all explicit repositories from `repositories`
2. Scan directories in `paths` for git repos (up to 3 levels deep)
3. Remove duplicates
4. Filter out any repos listed in `ignore`

## Example Queries

```sql
-- Commits by author (from authors table)
SELECT email, name, total_commits,
       first_commit_at, last_commit_at
FROM authors
ORDER BY total_commits DESC;

-- Most active days (aggregated from commits)
SELECT DATE(committed_at) as date,
       COUNT(*) as commits,
       SUM(additions) as adds,
       SUM(deletions) as dels
FROM commits
GROUP BY DATE(committed_at)
ORDER BY commits DESC
LIMIT 10;

-- Most frequently changed files
SELECT repo_name, file_path,
       COUNT(*) as commits_touching_file,
       SUM(additions) as total_adds,
       SUM(deletions) as total_dels
FROM file_changes
GROUP BY repo_name, file_path
ORDER BY commits_touching_file DESC
LIMIT 20;

-- Total commits by repository
SELECT repo_name, COUNT(*) as count
FROM commits
GROUP BY repo_name;

-- Tags and releases per repository
SELECT repo_name, COUNT(*) as tag_count,
       SUM(CASE WHEN is_annotated = 1 THEN 1 ELSE 0 END) as annotated_tags
FROM tags
GROUP BY repo_name;
```

## Database Schema

**commits** - commit_id, repo_name, sha, author_email, author_name,
committed_at, message, additions, deletions, files_changed, is_merge, branch

**authors** - author_id, email (unique), name, first_commit_at, last_commit_at,
total_commits

**file_changes** - change_id, repo_name, sha, file_path, additions, deletions

**tags** - tag_id, repo_name, tag_name, sha, tagger_name, tagger_email,
tag_date, message, is_annotated

**repos** - repo_id, name, language, is_archived, last_commit_at, total_commits

**pull_requests** - Placeholder for future GitHub API integration

## Metabase Connection

Database file: `/var/tmp/git-analytics.db`
