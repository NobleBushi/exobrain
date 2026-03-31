#!/usr/bin/env tsx
import "dotenv/config";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const dbBackend = process.env.DB_BACKEND ?? "postgres";
const backupRoot = resolve(process.env.BACKUP_DIR ?? "./backups");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function fail(message: string): never {
  console.error(`Backup failed: ${message}`);
  process.exit(1);
}

function backupSqlite(): void {
  const sqlitePath = resolve(process.env.SQLITE_PATH ?? "./data/exobrain.db");
  if (!existsSync(sqlitePath)) {
    fail(`SQLite database not found at ${sqlitePath}`);
  }

  ensureDir(backupRoot);
  const target = resolve(backupRoot, `${timestamp}-${basename(sqlitePath)}`);
  copyFileSync(sqlitePath, target);
  console.log(`SQLite backup written to ${target}`);
}

function backupPostgres(): void {
  const postgresUrl = process.env.POSTGRES_URL;
  if (!postgresUrl) {
    fail("POSTGRES_URL is not configured");
  }

  ensureDir(backupRoot);
  const target = resolve(backupRoot, `${timestamp}-exobrain-postgres.dump`);
  const result = spawnSync("pg_dump", ["--format=custom", "--file", target, postgresUrl], {
    stdio: "inherit",
  });

  if (result.error) {
    fail(`Unable to start pg_dump: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(`pg_dump exited with status ${result.status ?? "unknown"}`);
  }

  console.log(`Postgres backup written to ${target}`);
}

if (dbBackend === "sqlite") {
  backupSqlite();
} else if (dbBackend === "postgres") {
  backupPostgres();
} else {
  fail(`Unsupported DB_BACKEND '${dbBackend}'`);
}
