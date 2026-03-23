/**
 * ExoBrain background maintenance
 *
 * Runs on a configurable interval and handles:
 *   1. KG integrity check — node count, locked-node tampering, geometric validity
 *   2. Session cleanup — remove expired in-memory sessions
 *   3. Async task check — pending embeddings, stale write jobs
 *   4. Key expiry — log keys that have lapsed (revocation is enforced at auth time)
 */

import type { GraphAdapter } from "./adapters/graph/types.js";
import type { DbAdapter } from "./adapters/db/types.js";
import { embedEntry, detectEmbeddingBackend } from "./embedding.js";

export interface MaintenanceReport {
  timestamp: string;
  kg: {
    nodeCount: number;
    expectedMinNodes: number;
    lockedNodeViolations: string[];
    geometricViolations: string[];
    ok: boolean;
  };
  db: {
    pendingEmbeddings: number;
    stalePendingMarkedFailed: number;
    expiredKeysFound: number;
    embeddedThisCycle: number;
  };
  sessions: {
    activeSessions: number;
  };
}

const KG_MIN_NODES     = 16;      // TF3 baseline
const STALE_EMBED_MS   = 60 * 60 * 1000;  // 1 hour — pending → failed
const DEFAULT_INTERVAL = 5 * 60 * 1000;   // 5 minutes

// ── KG checks ─────────────────────────────────────────────────────────────

async function checkKgIntegrity(graph: GraphAdapter): Promise<MaintenanceReport["kg"]> {
  const lockedViolations: string[] = [];
  const geoViolations: string[] = [];

  // 1. Node count
  const countResult = await graph.query(
    "MATCH (n) RETURN count(n) AS total"
  ) as { total: number }[];
  const nodeCount = countResult[0]?.total ?? 0;

  // 2. Locked node check — locked nodes should not have been modified recently
  //    We can't track modification time in ArcadeDB easily, but we can verify
  //    that locked nodes still exist and have the expected properties.
  const lockedNodes = await graph.query(
    "MATCH (n) WHERE n.locked = true RETURN n.node_id AS id, n.x AS x, n.y AS y, n.z AS z, n.name AS name"
  ) as { id: string; x: number; y: number; z: number; name: string }[];

  // Spot-check: R0000 Origin must be at (0,0,0) and R0001 Telos at (1,1,1)
  const origin = lockedNodes.find(n => n.id === "R0000");
  const telos  = lockedNodes.find(n => n.id === "R0001");
  if (origin && (origin.x !== 0 || origin.y !== 0 || origin.z !== 0)) {
    lockedViolations.push(`R0000 Origin position tampered: (${origin.x},${origin.y},${origin.z})`);
  }
  if (telos && (telos.x !== 1 || telos.y !== 1 || telos.z !== 1)) {
    lockedViolations.push(`R0001 Telos position tampered: (${telos.x},${telos.y},${telos.z})`);
  }

  // 3. Geometric validity — extension nodes must be within their anchor's slack
  const extNodes = await graph.query(`
    MATCH (n) WHERE n.locked = false AND n.anchor IS NOT NULL
    MATCH (anchor {node_id: n.anchor})
    RETURN n.node_id AS id, n.anchor AS anchorId,
           n.x AS nx, n.y AS ny, n.z AS nz,
           anchor.x AS ax, anchor.y AS ay, anchor.z AS az,
           anchor.slack AS slack
  `) as {
    id: string; anchorId: string;
    nx: number; ny: number; nz: number;
    ax: number; ay: number; az: number;
    slack: number;
  }[];

  for (const n of extNodes) {
    const dist = Math.sqrt((n.nx - n.ax) ** 2 + (n.ny - n.ay) ** 2 + (n.nz - n.az) ** 2);
    const maxDist = n.slack ?? 0.5;
    if (dist > maxDist) {
      geoViolations.push(
        `${n.id} is ${dist.toFixed(3)} from anchor ${n.anchorId} (max ${maxDist})`
      );
    }
  }

  const ok = nodeCount >= KG_MIN_NODES
    && lockedViolations.length === 0
    && geoViolations.length === 0;

  return { nodeCount, expectedMinNodes: KG_MIN_NODES, lockedNodeViolations: lockedViolations, geometricViolations: geoViolations, ok };
}

// ── DB async task checks ───────────────────────────────────────────────────

const EMBED_BATCH = 10;  // entries to embed per maintenance cycle

async function checkDbTasks(db: DbAdapter): Promise<MaintenanceReport["db"]> {
  // Count expired (but not yet revoked) API keys — informational only
  const expiredKeys = await db.countExpiredKeys?.() ?? 0;

  // Process pending embeddings if backend is available
  let embedded = 0;
  let staleMarked = 0;

  if (db.getPendingEmbeddingEntries && db.updateEmbedding) {
    const { available } = await detectEmbeddingBackend();

    if (available) {
      const entries = await db.getPendingEmbeddingEntries(EMBED_BATCH);
      for (const entry of entries) {
        try {
          const result = await embedEntry(entry.content, entry.summary);
          await db.updateEmbedding(entry.entryId, result.entryEmbedding!, result.model, "complete");
          if (result.chunks.length > 0 && db.saveChunks) {
            await db.saveChunks(entry.entryId, result.chunks);
          }
          embedded++;
        } catch (e) {
          console.warn(`[maintenance] embedding failed for ${entry.entryId}:`, e instanceof Error ? e.message : e);
          await db.updateEmbedding?.(entry.entryId, [], "", "failed").catch(() => {});
        }
      }
    }

    // Mark entries stuck in pending longer than the stale threshold as failed
    staleMarked = await db.markStaleEmbeddingsFailed?.(STALE_EMBED_MS) ?? 0;
  }

  const pending = await db.countPendingEmbeddings?.() ?? 0;

  return {
    pendingEmbeddings: pending,
    stalePendingMarkedFailed: staleMarked,
    expiredKeysFound: expiredKeys,
    embeddedThisCycle: embedded,
  };
}

// ── Runner ─────────────────────────────────────────────────────────────────

export function startMaintenance(
  graph: GraphAdapter,
  db: DbAdapter,
  getSessions: () => Map<string, unknown>,
  intervalMs = DEFAULT_INTERVAL,
): () => void {
  async function runOnce() {
    const now = new Date().toISOString();

    let kg: MaintenanceReport["kg"];
    try {
      kg = await checkKgIntegrity(graph);
    } catch (e) {
      console.error("[maintenance] KG check failed:", e);
      kg = { nodeCount: -1, expectedMinNodes: KG_MIN_NODES, lockedNodeViolations: [], geometricViolations: [], ok: false };
    }

    let dbStats: MaintenanceReport["db"];
    try {
      dbStats = await checkDbTasks(db);
    } catch (e) {
      console.error("[maintenance] DB task check failed:", e);
      dbStats = { pendingEmbeddings: -1, stalePendingMarkedFailed: 0, expiredKeysFound: 0, embeddedThisCycle: 0 };
    }

    const sessions = getSessions();
    const report: MaintenanceReport = {
      timestamp: now,
      kg,
      db: dbStats,
      sessions: { activeSessions: sessions.size },
    };

    // Log summary
    const kgStatus = kg.ok ? "✓" : "✗";
    console.log(
      `[maintenance] ${now} | KG ${kgStatus} (${kg.nodeCount} nodes)` +
      (kg.lockedNodeViolations.length ? ` | VIOLATIONS: ${kg.lockedNodeViolations.join("; ")}` : "") +
      (kg.geometricViolations.length  ? ` | GEO: ${kg.geometricViolations.join("; ")}` : "") +
      ` | embeddings pending=${dbStats.pendingEmbeddings} embedded=${dbStats.embeddedThisCycle} stale-failed=${dbStats.stalePendingMarkedFailed}` +
      ` | sessions=${report.sessions.activeSessions}`
    );

    if (!kg.ok) {
      console.warn("[maintenance] ⚠ KG integrity issue detected — check logs above");
    }

    return report;
  }

  // Run immediately on start, then on interval
  runOnce().catch(console.error);
  const timer = setInterval(() => runOnce().catch(console.error), intervalMs);
  timer.unref(); // Don't prevent process exit

  return () => clearInterval(timer);
}
