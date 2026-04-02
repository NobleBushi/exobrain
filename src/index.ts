import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createReadStream, statSync, readdirSync, readFileSync as readFile } from "node:fs";
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
import { registerAuthRoutes } from "./api/auth.js";
import { readFileSync } from "node:fs";

const PORT = parseInt(process.env.PORT ?? "3000", 10);

// ── Initialize adapters ────────────────────────────────────────────────────

const graphBackend = process.env.GRAPH_BACKEND ?? "arcadedb";
const dbBackend    = process.env.DB_BACKEND    ?? "postgres";

let graph: GraphAdapter;
if (graphBackend === "arcadedb") {
  graph = createArcadeDbAdapter();
} else if (graphBackend === "neo4j") {
  throw new Error("GRAPH_BACKEND=neo4j is not yet implemented. Use arcadedb.");
} else {
  throw new Error(`Unknown GRAPH_BACKEND: ${graphBackend}. Supported: arcadedb`);
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
registerAuthRoutes(apiRouter.register.bind(apiRouter), db);

// ── Static file serving ────────────────────────────────────────────────────

const PUBLIC_DIR = resolve(fileURLToPath(new URL(".", import.meta.url)), "../public");
const DOCS_DIR   = resolve(fileURLToPath(new URL(".", import.meta.url)), "../docs");
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

// ── Docs serving ─────────────────────────────────────────────────────────

function listDocFiles(dir: string, prefix: string): Array<{ path: string; name: string }> {
  const out: Array<{ path: string; name: string }> = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) out.push(...listDocFiles(join(dir, entry.name), rel));
      else if (entry.name.endsWith(".md")) out.push({ path: rel, name: entry.name.replace(/\.md$/, "") });
    }
  } catch { /* ignore */ }
  return out;
}

function serveDocs(req: IncomingMessage, res: ServerResponse, pathname: string): boolean {
  if (req.method !== "GET") return false;
  if (pathname === "/api/docs") {
    const files = listDocFiles(DOCS_DIR, "");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(files));
    return true;
  }
  if (pathname.startsWith("/api/docs/")) {
    const sub = decodeURIComponent(pathname.slice("/api/docs/".length));
    const full = resolve(join(DOCS_DIR, sub));
    if (!full.startsWith(DOCS_DIR)) { res.writeHead(403); res.end(); return true; }
    try {
      const content = readFile(full, "utf-8");
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end();
    }
    return true;
  }
  return false;
}

// ── MCP session store (StreamableHTTP) ────────────────────────────────────

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

// ── SSE session store ──────────────────────────────────────────────────────

interface SseSession {
  transport: SSEServerTransport;
  principal: Principal;
}

const sseSessions = new Map<string, SseSession>();

async function handleSseConnect(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const principal = await verifyRequest(req.headers.authorization);
  if (!principal) {
    reject(res, 401, "Unauthorized — provide a valid Bearer token");
    return;
  }

  const transport = new SSEServerTransport("/message", res);
  const mcpServer = new McpServer({ name: "exobrain", version: VERSION });
  registerKgTools(mcpServer, graph, db);
  registerSpaceTools(mcpServer, db);
  registerDbTools(mcpServer, db);
  registerKeyTools(mcpServer, db);

  sseSessions.set(transport.sessionId, { transport, principal });

  transport.onclose = () => {
    sseSessions.delete(transport.sessionId);
  };

  await mcpServer.connect(transport);
  await transport.start();
}

async function handleSseMessage(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://x");
  const sessionId = url.searchParams.get("sessionId");
  if (!sessionId) {
    reject(res, 400, "sessionId query parameter required");
    return;
  }
  const session = sseSessions.get(sessionId);
  if (!session) {
    reject(res, 404, "SSE session not found or expired");
    return;
  }
  requestContext.run({ principal: session.principal }, async () => {
    await session.transport.handlePostMessage(req, res);
  });
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

    // Docs (public, no auth required)
    if (pathname === "/api/docs" || pathname.startsWith("/api/docs/")) {
      serveDocs(req, res, pathname);
      return;
    }

    // REST API routes (handle their own auth)
    if (pathname.startsWith("/api/")) {
      const handled = await apiRouter.handle(req, res);
      if (!handled) reject(res, 404, "API route not found");
      return;
    }

    // SSE transport (Claude Desktop and other SSE-only clients)
    if (pathname === "/sse" && req.method === "GET") {
      await handleSseConnect(req, res);
      return;
    }
    if (pathname === "/message" && req.method === "POST") {
      await handleSseMessage(req, res);
      return;
    }

    // Static files (GET only)
    if (req.method === "GET") {
      if (serveStatic(req, res)) return;
    }

    // MCP protocol (StreamableHTTP — Claude Code and MCP-compliant clients)
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
