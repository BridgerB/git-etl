export interface DailyStatKey {
  date: string;
  repoName: string;
  authorEmail: string;
}

export interface DailyStat extends DailyStatKey {
  commitsCount: number;
  additions: number;
  deletions: number;
  filesChanged: number;
}

export interface SummaryStats {
  totalCommits: number;
  totalAdditions: number;
  totalDeletions: number;
  totalFilesChanged: number;
  mergeCommitsCount: number;
  uniqueAuthorsCount: number;
  dateRange: { from: string; to: string };
}
