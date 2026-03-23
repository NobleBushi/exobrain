import { AsyncLocalStorage } from "node:async_hooks";

export interface Principal {
  principalId: string;
  principalType: "owner" | "user" | "agent" | "group";
  name: string;
  allowedSpaces: string[];   // space IDs this principal can access
  permissions: string[];     // global permissions (from API key or OAuth scopes)
}

export interface RequestContext {
  principal: Principal;
  scopedSpaceId?: string;    // active space set by db_scope tool
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function getContext(): RequestContext {
  const ctx = requestContext.getStore();
  if (!ctx) throw new Error("No request context");
  return ctx;
}

export function getPrincipal(): Principal {
  return getContext().principal;
}
