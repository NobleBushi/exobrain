import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { join, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { requestContext } from "./context.js";
import { verifyRequest, setDbResolver } from "./auth.js";
import { registerKgTools } from "./tools/kg.js";
import { registerSpaceTools } from "./tools/spaces.js";
import { registerDbTools } from "./tools/db.js";
import { registerKeyTools } from "./tools/keys.js";
import { createArcadeDbAdapter } from "./adapters/graph/arcadedb.js";
import { createPostgresAdapter } from "./adapters/db/postgres.js";
import { createSqliteAdapter } from "./adapters/db/sqlite.js";
import type { GraphAdapter } from "./adapters/graph/types.js";
import type { DbAdapter } from "./adapters/db/types.js";
import type { Principal } from "./context.js";
import { startMaintenance } from "./maintenance.js";
import { ApiRouter } from "./api/router.js";
import { registerStatusRoutes } from "./api/status.js";
import { registerSetupRoutes } from "./api/setup.js";
import { registerKeyRoutes } from "./api/keys.js";
import { registerSpaceRoutes } from "./api/spaces.js";
import { registerPrincipalRoutes } from "./api/principals.js";
import { readFileSync } from "node:fs";

const PORT = parseInt(process.env.PORT ?? "3000", 10);

// ── Initialize adapters ────────────────────────────────────────────────────

const graphBackend = process.env.GRAPH_BACKEND ?? "arcadedb";
const dbBackend    = process.env.DB_BACKEND    ?? "postgres";

let graph: GraphAdapter;
if (graphBackend === "arcadedb" || graphBackend === "neo4j") {
  graph = createArcadeDbAdapter();
} else {
  throw new Error(`Unknown GRAPH_BACKEND: ${graphBackend}. Supported: arcadedb, neo4j`);
}

let db: DbAdapter;
if (dbBackend === "postgres") {
  db = createPostgresAdapter();
} else if (dbBackend === "sqlite") {
  db = createSqliteAdapter();
} else {
  throw new Error(`Unknown DB_BACKEND: ${dbBackend}. Supported: postgres, sqlite`);
}

await graph.connect();
await db.connect();
setDbResolver(() => db);

// ── Package version ────────────────────────────────────────────────────────

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8")) as { version: string };
const VERSION = pkg.version;

// ── REST API router ────────────────────────────────────────────────────────

const apiRouter = new ApiRouter();
registerStatusRoutes(apiRouter.register.bind(apiRouter), db, VERSION);
registerSetupRoutes(apiRouter.register.bind(apiRouter), db);
registerKeyRoutes(apiRouter.register.bind(apiRouter), db);
registerSpaceRoutes(apiRouter.register.bind(apiRouter), db);
registerPrincipalRoutes(apiRouter.register.bind(apiRouter), db);

// ── Static file serving ────────────────────────────────────────────────────

const PUBLIC_DIR = resolve(fileURLToPath(new URL(".", import.meta.url)), "../public");
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".ico":  "image/x-icon",
};

function serveStatic(req: IncomingMessage, res: ServerResponse): boolean {
  const url = new URL(req.url ?? "/", "http://x");
  let pathname = url.pathname;

  if (pathname === "/")       pathname = "/index.html";
  else if (pathname === "/setup") pathname = "/setup.html";
  else if (pathname === "/admin") pathname = "/admin.html";

  const ext = extname(pathname);
  const mime = MIME[ext];
  if (!mime) return false;

  const fullPath = resolve(join(PUBLIC_DIR, pathname));
  // Path traversal guard
  if (!fullPath.startsWith(PUBLIC_DIR)) return false;

  try {
    statSync(fullPath);
  } catch {
    return false;
  }

  res.writeHead(200, { "Content-Type": mime });
  createReadStream(fullPath).pipe(res);
  return true;
}

// ── MCP session store ──────────────────────────────────────────────────────

interface Session {
  transport: StreamableHTTPServerTransport;
  principal: Principal;
}

const sessions = new Map<string, Session>();

function createSession(principal: Principal): { sessionId: string; transport: StreamableHTTPServerTransport } {
  const sessionId = randomUUID();

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => sessionId,
    onsessioninitialized: (sid) => {
      sessions.set(sid, { transport, principal });
    },
  });

  const mcpServer = new McpServer({ name: "exobrain", version: VERSION });
  registerKgTools(mcpServer, graph, db);
  registerSpaceTools(mcpServer, db);
  registerDbTools(mcpServer, db);
  registerKeyTools(mcpServer, db);

  mcpServer.connect(transport).catch(console.error);

  transport.onclose = () => {
    sessions.delete(sessionId);
  };

  return { sessionId, transport };
}

// ── Request discriminator ──────────────────────────────────────────────────

function isMcpRequest(req: IncomingMessage): boolean {
  if (req.headers["mcp-session-id"]) return true;
  if (req.method === "POST") {
    const ct = req.headers["content-type"] ?? "";
    return ct.includes("application/json");
  }
  return false;
}

// ── HTTP helpers ───────────────────────────────────────────────────────────

function reject(res: ServerResponse, status: number, message: string) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: message }));
}

// ── MCP request handler ────────────────────────────────────────────────────

async function handleMcp(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const principal = await verifyRequest(req.headers.authorization);
  if (!principal) {
    reject(res, 401, "Unauthorized — provide a valid Bearer token");
    return;
  }

  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (req.method === "DELETE") {
    if (sessionId) {
      const session = sessions.get(sessionId);
      await session?.transport.handleRequest(req, res);
      sessions.delete(sessionId);
    } else {
      reject(res, 400, "mcp-session-id header required for DELETE");
    }
    return;
  }

  if (req.method === "GET") {
    if (!sessionId) { reject(res, 400, "mcp-session-id header required for GET"); return; }
    const session = sessions.get(sessionId);
    if (!session) { reject(res, 404, "Session not found"); return; }
    requestContext.run({ principal: session.principal }, () => {
      session.transport.handleRequest(req, res).catch(console.error);
    });
    return;
  }

  if (req.method !== "POST") {
    reject(res, 405, "Method not allowed");
    return;
  }

  if (sessionId) {
    const session = sessions.get(sessionId);
    if (!session) { reject(res, 404, "Session not found or expired"); return; }
    requestContext.run({ principal: session.principal }, () => {
      session.transport.handleRequest(req, res).catch(console.error);
    });
  } else {
    const { transport } = createSession(principal);
    requestContext.run({ principal }, () => {
      transport.handleRequest(req, res).catch(console.error);
    });
  }
}

// ── HTTP server ────────────────────────────────────────────────────────────

const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  try {
    const url = new URL(req.url ?? "/", "http://x");
    const pathname = url.pathname;

    // REST API routes (handle their own auth)
    if (pathname.startsWith("/api/")) {
      const handled = await apiRouter.handle(req, res);
      if (!handled) reject(res, 404, "API route not found");
      return;
    }

    // Static files (GET only)
    if (req.method === "GET") {
      if (serveStatic(req, res)) return;
    }

    // MCP protocol
    if (isMcpRequest(req)) {
      await handleMcp(req, res);
      return;
    }

    reject(res, 404, "Not found");
  } catch (err) {
    console.error("HTTP handler error:", err);
    if (!res.headersSent) reject(res, 500, "Internal server error");
  }
});

// ── Background maintenance ─────────────────────────────────────────────────

const MAINTENANCE_INTERVAL = parseInt(process.env.MAINTENANCE_INTERVAL_MS ?? String(5 * 60 * 1000), 10);
const stopMaintenance = startMaintenance(graph, db, () => sessions, MAINTENANCE_INTERVAL);

// ── Graceful shutdown ──────────────────────────────────────────────────────

async function shutdown() {
  console.log("Shutting down...");
  stopMaintenance();
  await graph.disconnect();
  await db.disconnect();
  httpServer.close(() => process.exit(0));
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

httpServer.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n✗ Port ${PORT} is already in use.`);
    console.error(`  Set PORT=<number> in .env to use a different port.`);
    console.error(`  Run: npm run check:ports  to check all required ports.\n`);
  } else {
    console.error("HTTP server error:", err);
  }
  process.exit(1);
});

httpServer.listen(PORT, () => {
  console.log(`ExoBrain MCP server listening on port ${PORT}`);
  console.log(`Graph backend:    ${graphBackend}`);
  console.log(`Database backend: ${dbBackend}`);
});
