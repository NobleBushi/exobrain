import type { IncomingMessage, ServerResponse } from "node:http";
import { probeEmbeddingHealth } from "../embedding.js";
import { jsonResponse, requireAuth } from "./middleware.js";
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

  register("GET", "/api/status/detail", async (req, res) => {
    const principal = await requireAuth(req, res);
    if (!principal) return;

    const initialized = await db.hasOwner();
    const record = initialized
      ? await db.getPrincipal(principal.principalId)
      : null;
    const embedding = await probeEmbeddingHealth();

    jsonResponse(res, 200, {
      initialized,
      version,
      security: {
        registrationSecretConfigured: !!(
          process.env.REGISTRATION_SECRET &&
          process.env.REGISTRATION_SECRET !== "changeme-replace-with-random-secret"
        ),
        passwordLoginAvailable: !!record?.passwordHash,
        sessionTtlHours: 24,
        ssoConfigured: false,
      },
      embedding,
    });
  });
}
