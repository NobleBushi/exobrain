import type { IncomingMessage, ServerResponse } from "node:http";
import { verifyRequest } from "../auth.js";
import type { Principal } from "../context.js";

export function jsonResponse(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(json);
}

export async function readBody<T = Record<string, unknown>>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8")) as T);
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

export async function requireAuth(
  req: IncomingMessage,
  res: ServerResponse
): Promise<Principal | false> {
  const principal = await verifyRequest(req.headers.authorization);
  if (!principal) {
    jsonResponse(res, 401, { error: "Unauthorized — provide a valid Bearer token" });
    return false;
  }
  return principal;
}

export async function requireOwner(
  req: IncomingMessage,
  res: ServerResponse
): Promise<Principal | false> {
  const principal = await requireAuth(req, res);
  if (!principal) return false;
  if (principal.principalType !== "owner") {
    jsonResponse(res, 403, { error: "Owner access required" });
    return false;
  }
  return principal;
}
