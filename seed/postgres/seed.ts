import "dotenv/config";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));

const POSTGRES_URL = process.env.POSTGRES_URL
  ?? "postgresql://exobrain:changeme@localhost:5432/exobrain";

async function main() {
  console.log(`\nExoBrain Postgres Schema Seed`);
  console.log(`Target: ${POSTGRES_URL.replace(/:\/\/.*@/, "://<credentials>@")}\n`);

  const client = new pg.Client({ connectionString: POSTGRES_URL });
  await client.connect();
  console.log("✓ Connected to PostgreSQL\n");

  try {
    const sql = readFileSync(join(__dirname, "schema.sql"), "utf-8");
    await client.query(sql);
    console.log("✓ Schema applied\n");

    // Verify
    const res = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
    );
    console.log("Tables created:");
    res.rows.forEach(r => console.log(`  • ${r.table_name}`));

    const spaces = await client.query("SELECT space_id, space_type FROM spaces ORDER BY space_id");
    console.log("\nDefault spaces:");
    spaces.rows.forEach(r => console.log(`  • ${r.space_id} (${r.space_type})`));

    console.log("\n✓ Postgres seed complete\n");
  } finally {
    await client.end();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
