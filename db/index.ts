import { Database } from "jsr:@db/sqlite@^0.12";
import { initializeSchema } from "./schema.ts";

const dbPath = "/var/tmp/git-analytics.db";

export const db = new Database(dbPath);

initializeSchema(db);

console.log(`Database initialized at: ${dbPath}`);
