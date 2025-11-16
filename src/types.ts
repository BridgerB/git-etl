export interface SummaryStats {
  totalCommits: number;
  totalAdditions: number;
  totalDeletions: number;
  totalFilesChanged: number;
  mergeCommitsCount: number;
  uniqueAuthorsCount: number;
  dateRange: { from: string; to: string };
}
