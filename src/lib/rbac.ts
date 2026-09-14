import { getServerSession } from "next-auth";
import type { NextApiRequest, NextApiResponse } from "next";
import { authOptions } from "@/lib/auth";

export type SessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role: "ADMIN" | "MANAGER" | "EMPLOYEE";
};

/** Pass req/res when calling from a Pages Router API route. */
export async function getSessionUser(
  req?: NextApiRequest,
  res?: NextApiResponse
): Promise<SessionUser | null> {
  const session =
    req && res
      ? await getServerSession(req, res, authOptions)
      : await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role: session.user.role,
  };
}

/** Admin + Manager are "management" roles. */
export function isManagement(user: SessionUser | null) {
  return !!user && (user.role === "ADMIN" || user.role === "MANAGER");
}

export async function requireManagement() {
  const user = await getSessionUser();
  if (!user || !isManagement(user)) return null;
  return user;
}

export async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return null;
  return user;
}

export async function requireUser() {
  const user = await getSessionUser();
  return user; // any authenticated user
}

/** Landing page per role after login. */
export function homeFor(role: string) {
  if (role === "EMPLOYEE") return "/portal/my-day";
  return "/portal/dashboard";
}
