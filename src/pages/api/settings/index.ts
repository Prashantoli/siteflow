import { z } from "zod";
import { ok, bad, handler, parseBody, apiAdmin, apiManagement, sameOrigin } from "@/lib/api";
import { getSettings, setSettings, SETTING_KEYS, SMTP_KEYS, SMTP_MASK } from "@/lib/settings";
import { getSmtpConfig, maskSmtp } from "@/lib/mail";

const schema = z.object(
  Object.fromEntries(SETTING_KEYS.map((k) => [k, z.string().max(300).optional()])) as Record<string, z.ZodOptional<z.ZodString>>
);

export default handler(async (req, res) => {
  if (req.method === "GET") {
    const me = await apiManagement(req, res);
    if (!me) return bad(res, "Forbidden", 403);

    const settings = await getSettings();
    // never leak the SMTP password to the client
    if (settings["smtp.pass"]) settings["smtp.pass"] = SMTP_MASK;
    // surface effective SMTP status for the UI
    const cfg = await getSmtpConfig();
    return ok(res, { settings, smtp: maskSmtp(cfg) });
  }

  if (req.method === "PUT") {
    const admin = await apiAdmin(req, res);
    if (!admin) return bad(res, "Forbidden", 403);
    if (!sameOrigin(req)) return bad(res, "Bad origin", 403);
    const data = await parseBody(req, schema);

    const entries: Record<string, string> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      // ignore masked password coming back from the client
      if (k === "smtp.pass" && (!v || v === SMTP_MASK)) continue;
      entries[k] = v;
    }
    await setSettings(entries);

    const settings = await getSettings();
    if (settings["smtp.pass"]) settings["smtp.pass"] = SMTP_MASK;
    const cfg = await getSmtpConfig();
    return ok(res, { settings, smtp: maskSmtp(cfg) });
  }

  return bad(res, "Method not allowed", 405);
});
