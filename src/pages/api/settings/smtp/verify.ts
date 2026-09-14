import { ok, bad, handler, apiAdmin } from "@/lib/api";
import { verifySmtp } from "@/lib/mail";

/** POST /api/settings/smtp/verify — validates SMTP host/auth without sending. */
export default handler(async (req, res) => {
  const admin = await apiAdmin(req, res);
  if (!admin) return bad(res, "Forbidden", 403);
  if (req.method !== "POST") return bad(res, "Method not allowed", 405);

  const result = await verifySmtp();
  return ok(res, result, result.ok ? 200 : 400);
});
