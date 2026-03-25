import type { IncomingMessage, ServerResponse } from "node:http";
import { jsonResponse, requireAuth } from "./middleware.js";
import type { DbAdapter } from "../adapters/db/types.js";

export function registerPrincipalRoutes(
  register: (method: string, path: string, handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>) => void,
  db: DbAdapter
): void {
  register("GET", "/api/principals", async (req, res) => {
    const principal = await requireAuth(req, res);
    if (!principal) return;

    const principals = await db.listPrincipals(principal.principalId);
    const safe = principals.map(({ passwordHash: _pw, ...p }) => p);
    jsonResponse(res, 200, safe);
  });
}
