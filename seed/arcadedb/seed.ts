import "dotenv/config";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const ARCADEDB_URL      = process.env.ARCADEDB_URL      ?? "http://localhost:2480";
const ARCADEDB_USER     = process.env.ARCADEDB_USER     ?? "root";
const ARCADEDB_PASSWORD = process.env.ARCADEDB_PASSWORD ?? "changeme";
const DATABASE          = process.env.ARCADEDB_DATABASE ?? "exobrain";

const auth = Buffer.from(`${ARCADEDB_USER}:${ARCADEDB_PASSWORD}`).toString("base64");

async function arcadePost(path: string, body: unknown) {
  const res = await fetch(`${ARCADEDB_URL}${path}`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ArcadeDB ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

async function createDatabase() {
  try {
    await arcadePost(`/api/v1/database/${DATABASE}`, {});
    console.log(`✓ Database '${DATABASE}' created`);
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("already exists")) {
      console.log(`  Database '${DATABASE}' already exists — skipping`);
    } else {
      throw e;
    }
  }
}

async function runCypher(statement: string) {
  return arcadePost(`/api/v1/command/${DATABASE}`, {
    language: "cypher",
    command: statement.trim(),
  });
}

async function main() {
  console.log(`\nExoBrain TF3 Seed — ArcadeDB`);
  console.log(`Target: ${ARCADEDB_URL} / ${DATABASE}\n`);

  // Wait for ArcadeDB to be ready
  for (let i = 0; i < 10; i++) {
    try {
      const res = await fetch(`${ARCADEDB_URL}/api/v1/ready`);
      if (res.ok) break;
    } catch {
      console.log(`  Waiting for ArcadeDB... (${i + 1}/10)`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  await createDatabase();

  // Parse and execute each statement from the Cypher file
  const cypher = readFileSync(join(__dirname, "tf3_seed.cypher"), "utf-8");
  const statements = cypher
    .split(/;\s*\n/)
    .map(s => s.replace(/\/\/[^\n]*/g, "").trim())  // strip comments
    .filter(s => s.length > 0);

  console.log(`Executing ${statements.length} statements...\n`);

  let ok = 0;
  let failed = 0;
  for (const stmt of statements) {
    try {
      await runCypher(stmt);
      ok++;
    } catch (e: unknown) {
      console.error(`✗ Failed: ${stmt.slice(0, 80)}...`);
      console.error(`  ${e instanceof Error ? e.message : e}`);
      failed++;
    }
  }

  console.log(`\n✓ ${ok} statements succeeded`);
  if (failed > 0) console.error(`✗ ${failed} statements failed`);

  // Verify node count
  const result = await runCypher("MATCH (n) RETURN count(n) AS total") as { result: { total: number }[] };
  const total = result?.result?.[0]?.total ?? "?";
  console.log(`\nGraph node count: ${total} (expected 16)`);

  if (total !== 16) {
    console.warn("⚠  Node count mismatch — check for errors above");
    process.exit(1);
  }

  console.log("\n✓ TF3 seed complete. Geometric integrity: OK\n");
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
