#!/usr/bin/env tsx
/**
 * ExoBrain pre-flight port check
 * Run before `docker compose up` to catch conflicts early.
 *
 * Usage:
 *   npm run check:ports
 *   tsx scripts/check-ports.ts
 */

import "dotenv/config";
import net from "node:net";

interface PortSpec {
  port: number;
  service: string;
  required: boolean;
  envOverride?: string;  // env var that can remap this port
}

// Derive ports from env where possible
const mcpPort   = parseInt(process.env.PORT         ?? "3000", 10);
const pgUrl     = process.env.POSTGRES_URL           ?? "";
const pgPort    = parseInt(pgUrl.match(/:(\d+)\//)?.[1] ?? "5433", 10);
const arcadeUrl = process.env.ARCADEDB_URL            ?? "http://localhost:2480";
const arcadePort = parseInt(arcadeUrl.match(/:(\d+)/)?.[1] ?? "2480", 10);

const PORTS: PortSpec[] = [
  { port: arcadePort, service: "ArcadeDB HTTP",    required: true,  envOverride: "ARCADEDB_URL" },
  { port: pgPort,     service: "PostgreSQL",        required: process.env.DB_BACKEND !== "sqlite", envOverride: "POSTGRES_URL" },
  { port: mcpPort,    service: "ExoBrain MCP server", required: true, envOverride: "PORT" },
];

function checkPort(port: number): Promise<"free" | "in-use"> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once("error", () => resolve("in-use"));
    server.once("listening", () => {
      server.close(() => resolve("free"));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function main() {
  console.log("\nExoBrain pre-flight port check\n");

  let allGood = true;

  for (const spec of PORTS) {
    if (!spec.required) {
      console.log(`  ⤷ ${spec.service} (port ${spec.port}) — skipped (not required for current config)`);
      continue;
    }

    const status = await checkPort(spec.port);
    if (status === "free") {
      console.log(`  ✓ ${spec.service} port ${spec.port} — free`);
    } else {
      allGood = false;
      const hint = spec.envOverride
        ? `  → Set ${spec.envOverride} in .env to use a different port`
        : "";
      console.error(`  ✗ ${spec.service} port ${spec.port} — IN USE`);
      if (hint) console.error(hint);
    }
  }

  if (allGood) {
    console.log("\n✓ All ports available — ready to start\n");
    process.exit(0);
  } else {
    console.error("\n✗ Port conflict(s) detected — resolve before running docker compose up\n");
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
