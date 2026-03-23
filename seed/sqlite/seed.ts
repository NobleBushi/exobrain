import "dotenv/config";
import { readFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SQLITE_PATH = process.env.SQLITE_PATH ?? "./data/exobrain.db";

async function main() {
  console.log(`\nExoBrain SQLite Schema Seed`);
  console.log(`Target: ${SQLITE_PATH}\n`);

  // Ensure data directory exists
  const dir = SQLITE_PATH.split("/").slice(0, -1).join("/");
  if (dir) mkdirSync(dir, { recursive: true });

  const db = new Database(SQLITE_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const sql = readFileSync(join(__dirname, "schema.sql"), "utf-8");
  db.exec(sql);
  console.log("✓ Schema applied\n");

  // Verify
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all() as { name: string }[];
  console.log("Tables created:");
  tables.forEach(t => console.log(`  • ${t.name}`));

  const spaces = db
    .prepare("SELECT space_id, space_type FROM spaces ORDER BY space_id")
    .all() as { space_id: string; space_type: string }[];
  console.log("\nDefault spaces:");
  spaces.forEach(s => console.log(`  • ${s.space_id} (${s.space_type})`));

  db.close();
  console.log("\n✓ SQLite seed complete\n");
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
