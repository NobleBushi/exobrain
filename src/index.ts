import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
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

// Connect adapters
await graph.connect();
await db.connect();

// Wire auth → db
setDbResolver(() => db);

// ── MCP server + tools ─────────────────────────────────────────────────────

const server = new McpServer({
  name: "exobrain",
  version: "0.1.0",
});

registerKgTools(server, graph, db);
registerSpaceTools(server, db);
registerDbTools(server, db);
registerKeyTools(server, db);

// ── HTTP transport with auth middleware ────────────────────────────────────

const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

await server.connect(transport);

const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const principal = await verifyRequest(req.headers.authorization);

  if (!principal) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized — provide a valid Bearer token" }));
    return;
  }

  // Run the MCP request inside the auth context
  requestContext.run({ principal }, () => {
    transport.handleRequest(req, res).catch((err: unknown) => {
      console.error("Transport error:", err);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end("Internal server error");
      }
    });
  });
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received — shutting down");
  await graph.disconnect();
  await db.disconnect();
  httpServer.close(() => process.exit(0));
});

process.on("SIGINT", async () => {
  console.log("SIGINT received — shutting down");
  await graph.disconnect();
  await db.disconnect();
  httpServer.close(() => process.exit(0));
});

httpServer.listen(PORT, () => {
  console.log(`ExoBrain MCP server listening on port ${PORT}`);
  console.log(`Graph backend:    ${graphBackend}`);
  console.log(`Database backend: ${dbBackend}`);
});
