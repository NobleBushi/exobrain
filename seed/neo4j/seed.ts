import "dotenv/config";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import neo4j from "neo4j-driver";

const __dirname = dirname(fileURLToPath(import.meta.url));

const NEO4J_URI      = process.env.NEO4J_URI      ?? "bolt://localhost:7687";
const NEO4J_USER     = process.env.NEO4J_USER     ?? "neo4j";
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD ?? "changeme";

async function main() {
  console.log(`\nExoBrain TF3 Seed — Neo4j`);
  console.log(`Target: ${NEO4J_URI}\n`);

  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  const session = driver.session();

  try {
    // Verify connectivity
    await driver.verifyConnectivity();
    console.log("✓ Connected to Neo4j\n");

    const cypher = readFileSync(join(__dirname, "tf3_seed.cypher"), "utf-8");
    const statements = cypher
      .split(/;\s*\n/)
      .map(s => s.replace(/\/\/[^\n]*/g, "").trim())
      .filter(s => s.length > 0);

    console.log(`Executing ${statements.length} statements...\n`);

    let ok = 0;
    let failed = 0;
    for (const stmt of statements) {
      try {
        await session.run(stmt);
        ok++;
      } catch (e: unknown) {
        console.error(`✗ Failed: ${stmt.slice(0, 80)}...`);
        console.error(`  ${e instanceof Error ? e.message : e}`);
        failed++;
      }
    }

    console.log(`\n✓ ${ok} statements succeeded`);
    if (failed > 0) console.error(`✗ ${failed} statements failed`);

    const result = await session.run("MATCH (n) RETURN count(n) AS total");
    const total = result.records[0]?.get("total")?.toNumber() ?? "?";
    console.log(`\nGraph node count: ${total} (expected 16)`);

    if (total !== 16) {
      console.warn("⚠  Node count mismatch — check for errors above");
      process.exit(1);
    }

    console.log("\n✓ TF3 seed complete. Geometric integrity: OK\n");

  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
