import type { IncomingMessage, ServerResponse } from "node:http";
import { jsonResponse } from "./middleware.js";

type Params = Record<string, string>;
type Handler = (req: IncomingMessage, res: ServerResponse, params: Params) => Promise<void>;

interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: Handler;
}

function compilePath(path: string): { pattern: RegExp; paramNames: string[] } {
  const paramNames: string[] = [];
  const regexStr = path
    .replace(/:([^/]+)/g, (_, name: string) => {
      paramNames.push(name);
      return "([^/]+)";
    })
    .replace(/\//g, "\\/");
  return { pattern: new RegExp(`^${regexStr}$`), paramNames };
}

export class ApiRouter {
  private routes: Route[] = [];

  register(method: string, path: string, handler: Handler): void {
    const { pattern, paramNames } = compilePath(path);
    this.routes.push({ method: method.toUpperCase(), pattern, paramNames, handler });
  }

  async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? "/", "http://x");
    const pathname = url.pathname;
    const method = req.method?.toUpperCase() ?? "GET";

    for (const route of this.routes) {
      if (route.method !== method) continue;
      const match = route.pattern.exec(pathname);
      if (!match) continue;

      const params: Params = {};
      route.paramNames.forEach((name, i) => {
        params[name] = decodeURIComponent(match[i + 1] ?? "");
      });

      try {
        await route.handler(req, res, params);
      } catch (err) {
        console.error("API handler error:", err);
        if (!res.headersSent) jsonResponse(res, 500, { error: "Internal server error" });
      }
      return true;
    }
    return false;
  }
}
