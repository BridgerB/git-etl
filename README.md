# Git ETL to SQLite

Extract git repository data into a SQLite database for analysis in Metabase.

## Usage

```bash
# Run ETL on a repository
deno run --allow-all main.ts /path/to/repo
```

## Example Queries

```sql
-- Commits by author
SELECT author_email, author_name, COUNT(*) as count,
       SUM(additions) as total_additions,
       SUM(deletions) as total_deletions
FROM commits
GROUP BY author_email, author_name
ORDER BY count DESC;

-- Most active days
SELECT date, SUM(commits_count) as commits,
       SUM(additions) as adds,
       SUM(deletions) as dels
FROM daily_stats
GROUP BY date
ORDER BY commits DESC
LIMIT 10;

-- Total commits by repository
SELECT repo_name, COUNT(*) as count
FROM commits
GROUP BY repo_name;
```

## Database Schema

**commits** - commit_id, repo_name, sha, author_email, author_name,
committed_at, message, additions, deletions, files_changed, is_merge, branch

**daily_stats** - stat_id, date, repo_name, author_email, commits_count,
additions, deletions, files_changed

**repos** - repo_id, name, language, is_archived, last_commit_at, total_commits

**pull_requests** - Placeholder for future GitHub API integration

## Metabase Connection

Database file: `/var/tmp/git-analytics.db`
