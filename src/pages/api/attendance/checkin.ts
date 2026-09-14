import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, bad, handler, parseBody, apiUser, sameOrigin } from "@/lib/api";
import { isWithinGeofence } from "@/lib/geo";

const checkinSchema = z.object({
  siteId: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  taskId: z.string().optional().nullable(),
  force: z.boolean().optional(),
});

export default handler(async (req, res) => {
  const me = await apiUser(req, res);
  if (!me) return bad(res, "Unauthorized", 401);
  if (req.method !== "POST") return bad(res, "Method not allowed", 405);
  if (!sameOrigin(req)) return bad(res, "Bad origin", 403);

  const data = await parseBody(req, checkinSchema);
  const site = await prisma.site.findUnique({ where: { id: data.siteId } });
  if (!site) return bad(res, "Site not found", 404);

  const open = await prisma.attendance.findFirst({
    where: { userId: me.id, checkOutAt: null },
  });
  if (open) return bad(res, "You already have an open shift. Check out first.", 409);

  const within = isWithinGeofence(data.lat, data.lng, site);
  if (!within && !data.force) {
    return bad(res, "You are not within the site geofence", 403, { withinGeofence: false });
  }

  const now = new Date();
  // Late if checked in after 08:15
  const late = now.getHours() > 8 || (now.getHours() === 8 && now.getMinutes() > 15);
  const attendance = await prisma.attendance.create({
    data: {
      userId: me.id,
      siteId: site.id,
      checkInAt: now,
      checkInLat: data.lat,
      checkInLng: data.lng,
      withinGeofence: within,
      status: late ? "LATE" : "PRESENT",
      note: data.taskId ? `Task check-in` : null,
    },
  });

  // start deployment + update live location
  await prisma.deployment.updateMany({ where: { userId: me.id, endedAt: null }, data: { endedAt: now } });
  await prisma.deployment.create({
    data: { userId: me.id, siteId: site.id, taskId: data.taskId ?? null, startedAt: now },
  });
  await prisma.user.update({
    where: { id: me.id },
    data: { lastLat: data.lat, lastLng: data.lng, lastSeenAt: now },
  });

  return ok(res, { attendance, withinGeofence: within }, 201);
});
