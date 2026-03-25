import type { IncomingMessage, ServerResponse } from "node:http";
import { jsonResponse } from "./middleware.js";
import type { DbAdapter } from "../adapters/db/types.js";

export function registerStatusRoutes(
  register: (method: string, path: string, handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>) => void,
  db: DbAdapter,
  version: string
): void {
  register("GET", "/api/status", async (_req, res) => {
    const initialized = await db.hasOwner();
    jsonResponse(res, 200, { initialized, version });
  });
}
