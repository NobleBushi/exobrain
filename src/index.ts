import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "node:http";

const PORT = parseInt(process.env.PORT ?? "3000", 10);

const server = new McpServer({
  name: "exobrain",
  version: "0.1.0",
});

// Phase 2: register tools here
// import { registerKgTools } from "./tools/kg.js";
// import { registerSpaceTools } from "./tools/spaces.js";
// import { registerDbTools } from "./tools/db.js";
// import { registerKeyTools } from "./tools/keys.js";
// registerKgTools(server);
// registerSpaceTools(server);
// registerDbTools(server);
// registerKeyTools(server);

const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

const httpServer = createServer(async (req, res) => {
  await transport.handleRequest(req, res);
});

httpServer.listen(PORT, () => {
  console.log(`ExoBrain MCP server listening on port ${PORT}`);
  console.log(`Graph backend:    ${process.env.GRAPH_BACKEND ?? "arcadedb"}`);
  console.log(`Database backend: ${process.env.DB_BACKEND ?? "postgres"}`);
});

await server.connect(transport);
