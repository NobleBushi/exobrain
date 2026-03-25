import type { IncomingMessage, ServerResponse } from "node:http";
import { jsonResponse, requireAuth } from "./middleware.js";
import type { DbAdapter } from "../adapters/db/types.js";

export function registerSpaceRoutes(
  register: (method: string, path: string, handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>) => void,
  db: DbAdapter
): void {
  register("GET", "/api/spaces", async (req, res) => {
    const principal = await requireAuth(req, res);
    if (!principal) return;

    const spaces = await db.listSpaces(principal.principalId);
    jsonResponse(res, 200, spaces);
  });
}
