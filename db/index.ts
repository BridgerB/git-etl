import { Database } from "jsr:@db/sqlite@^0.12";
import { initializeSchema } from "./schema.ts";

const dbPath = "/var/tmp/git-analytics.db";

export const db = new Database(dbPath);

/**
 * SQLite Performance Optimizations
 *
 * WAL mode: Write-Ahead Logging allows readers to not block writers and vice versa.
 *           This significantly improves concurrency for our write-heavy workload.
 *
 * synchronous=NORMAL: Reduces fsync() calls for faster commits. Safe when using WAL
 *                     mode as the WAL file provides crash protection.
 *
 * cache_size=-64000: Allocates 64MB of memory for page cache (negative value = KB).
 *                    Larger cache reduces disk I/O for our analytical queries.
 *
 * temp_store=MEMORY: Stores temporary tables and indexes in RAM instead of disk.
 *                    Faster for our transaction-wrapped bulk inserts.
 */
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA synchronous = NORMAL");
db.exec("PRAGMA cache_size = -64000");
db.exec("PRAGMA temp_store = MEMORY");

initializeSchema(db);

console.log(`Database initialized at: ${dbPath}`);
