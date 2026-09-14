import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, bad, handler, parseBody, apiUser, sameOrigin } from "@/lib/api";
import { isWithinGeofence } from "@/lib/geo";

const schema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  force: z.boolean().optional(),
});

export default handler(async (req, res) => {
  const me = await apiUser(req, res);
  if (!me) return bad(res, "Unauthorized", 401);
  if (req.method !== "POST") return bad(res, "Method not allowed", 405);
  if (!sameOrigin(req)) return bad(res, "Bad origin", 403);

  const data = await parseBody(req, schema);
  const open = await prisma.attendance.findFirst({
    where: { userId: me.id, checkOutAt: null },
    include: { site: true },
    orderBy: { checkInAt: "desc" },
  });
  if (!open) return bad(res, "No open shift found", 404);

  const within = isWithinGeofence(data.lat, data.lng, open.site);
  if (!within && !data.force) {
    return bad(res, "You are not within the site geofence", 403, { withinGeofence: false });
  }

  const now = new Date();
  const workedMinutes = Math.max(1, Math.round((now.getTime() - open.checkInAt.getTime()) / 60000));
  let status = open.status;
  if (workedMinutes < 240) status = "HALF_DAY";

  const attendance = await prisma.attendance.update({
    where: { id: open.id },
    data: {
      checkOutAt: now,
      checkOutLat: data.lat,
      checkOutLng: data.lng,
      workedMinutes,
      status,
      withinGeofence: open.withinGeofence && within,
    },
  });

  await prisma.deployment.updateMany({ where: { userId: me.id, endedAt: null }, data: { endedAt: now } });
  await prisma.user.update({
    where: { id: me.id },
    data: { lastLat: data.lat, lastLng: data.lng, lastSeenAt: now },
  });

  return ok(res, { attendance, workedMinutes, withinGeofence: within });
});
