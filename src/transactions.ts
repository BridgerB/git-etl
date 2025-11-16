import type { Database } from "jsr:@db/sqlite@^0.12";

/**
 * Begins a database transaction.
 * Must be followed by either commitTransaction or rollbackTransaction.
 */
export function beginTransaction(db: Database): void {
  db.exec("BEGIN TRANSACTION");
}

/**
 * Commits the current database transaction.
 */
export function commitTransaction(db: Database): void {
  db.exec("COMMIT");
}

/**
 * Rolls back the current database transaction.
 */
export function rollbackTransaction(db: Database): void {
  db.exec("ROLLBACK");
}

/**
 * Executes a function within a database transaction.
 * Automatically commits on success or rolls back on error.
 *
 * @param db - The database instance
 * @param fn - The function to execute within the transaction
 * @returns The result of the function
 * @throws Re-throws any error after rolling back the transaction
 *
 * @example
 * ```ts
 * const result = withTransaction(db, () => {
 *   insertCommits(db, repoName, commits);
 *   insertAuthors(db, authors);
 *   return { success: true };
 * });
 * ```
 */
export function withTransaction<T>(
  db: Database,
  fn: () => T,
): T {
  beginTransaction(db);
  try {
    const result = fn();
    commitTransaction(db);
    return result;
  } catch (error) {
    rollbackTransaction(db);
    throw error;
  }
}
