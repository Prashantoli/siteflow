import { z } from "zod";
import { ok, bad, handler, parseBody, apiAdmin, sameOrigin } from "@/lib/api";
import { sendMail, emailHtml } from "@/lib/mail";

const schema = z.object({ to: z.string().email() });

/** POST /api/settings/smtp/test — sends a branded test email. */
export default handler(async (req, res) => {
  const admin = await apiAdmin(req, res);
  if (!admin) return bad(res, "Forbidden", 403);
  if (req.method !== "POST") return bad(res, "Method not allowed", 405);
  if (!sameOrigin(req)) return bad(res, "Bad origin", 403);

  const { to } = await parseBody(req, schema);
  const result = await sendMail({
    to,
    subject: "SiteFlow SMTP test",
    text: "This is a test email from SiteFlow. If you can read this, email delivery is working.",
    html: emailHtml(
      "SMTP test successful",
      "This is a test email from SiteFlow. If you can read this, email delivery is working.",
      "/"
    ),
  });

  return ok(res, result, result.status === "sent" ? 200 : 400);
});
