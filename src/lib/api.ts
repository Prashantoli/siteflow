import { NextApiRequest, NextApiResponse } from "next";
import { ZodError, ZodSchema } from "zod";
import { getSessionUser, isManagement, SessionUser } from "@/lib/rbac";

export function ok(res: NextApiResponse, data: unknown, status = 200) {
  return res.status(status).json(data);
}

export function bad(res: NextApiResponse, message: string, status = 400, extra?: unknown) {
  return res.status(status).json({ error: message, ...(extra ? { details: extra } : {}) });
}

/** Wraps a handler with try/catch and zod error mapping. */
export function handler(
  fn: (req: NextApiRequest, res: NextApiResponse) => Promise<void>
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      await fn(req, res);
    } catch (e) {
      if (e instanceof ZodError) {
        return bad(res, "Validation failed", 422, e.flatten());
      }
      console.error("[api]", e);
      return bad(res, "Internal server error", 500);
    }
  };
}

export async function parseBody<T>(req: NextApiRequest, schema: { parse: (data: unknown) => T }): Promise<T> {
  return schema.parse(req.body);
}

export function parseId(req: NextApiRequest): string | null {
  const id = req.query.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/** Auth guards for API routes. Always pass req/res. */
export async function apiUser(req: NextApiRequest, res: NextApiResponse): Promise<SessionUser | null> {
  return getSessionUser(req, res);
}

export async function apiManagement(req: NextApiRequest, res: NextApiResponse): Promise<SessionUser | null> {
  const u = await getSessionUser(req, res);
  return isManagement(u) ? u : null;
}

export async function apiAdmin(req: NextApiRequest, res: NextApiResponse): Promise<SessionUser | null> {
  const u = await getSessionUser(req, res);
  return u?.role === "ADMIN" ? u : null;
}

/** Cross-site request forgery-ish sanity check: require same-origin for mutations. */
export function sameOrigin(req: NextApiRequest): boolean {
  const origin = req.headers.origin;
  if (!origin) return true; // non-browser client
  const host = req.headers.host;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
