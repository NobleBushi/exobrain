import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
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

// ── Session store ──────────────────────────────────────────────────────────

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

  const mcpServer = new McpServer({ name: "exobrain", version: "0.1.0" });
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

// ── HTTP server ────────────────────────────────────────────────────────────

function reject(res: ServerResponse, status: number, message: string) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: message }));
}

const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  try {
    // Auth on every request
    const principal = await verifyRequest(req.headers.authorization);
    if (!principal) {
      reject(res, 401, "Unauthorized — provide a valid Bearer token");
      return;
    }

    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (req.method === "DELETE") {
      // Session teardown
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
      // SSE stream for existing session
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

    // POST — new or existing session
    if (sessionId) {
      const session = sessions.get(sessionId);
      if (!session) { reject(res, 404, "Session not found or expired"); return; }
      requestContext.run({ principal: session.principal }, () => {
        session.transport.handleRequest(req, res).catch(console.error);
      });
    } else {
      // New session — principal bound at creation time
      const { transport } = createSession(principal);
      requestContext.run({ principal }, () => {
        transport.handleRequest(req, res).catch(console.error);
      });
    }
  } catch (err) {
    console.error("HTTP handler error:", err);
    if (!res.headersSent) reject(res, 500, "Internal server error");
  }
});

// ── Graceful shutdown ──────────────────────────────────────────────────────

async function shutdown() {
  console.log("Shutting down...");
  await graph.disconnect();
  await db.disconnect();
  httpServer.close(() => process.exit(0));
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

httpServer.listen(PORT, () => {
  console.log(`ExoBrain MCP server listening on port ${PORT}`);
  console.log(`Graph backend:    ${graphBackend}`);
  console.log(`Database backend: ${dbBackend}`);
});
