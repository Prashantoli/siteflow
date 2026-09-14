import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, bad, handler, parseBody, apiUser } from "@/lib/api";

const schema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/** Live location ping from the mobile/portal client. */
export default handler(async (req, res) => {
  const me = await apiUser(req, res);
  if (!me) return bad(res, "Unauthorized", 401);
  if (req.method !== "POST") return bad(res, "Method not allowed", 405);

  const data = await parseBody(req, schema);
  // Guard against a stale session whose user record no longer exists (P2025).
  const exists = await prisma.user.findUnique({ where: { id: me.id }, select: { id: true } });
  if (!exists) return bad(res, "Account not found — please sign in again", 401);
  const user = await prisma.user.update({
    where: { id: me.id },
    data: { lastLat: data.lat, lastLng: data.lng, lastSeenAt: new Date() },
    select: { id: true, lastLat: true, lastLng: true, lastSeenAt: true },
  });
  return ok(res, { user });
});
