import { NextApiRequest, NextApiResponse } from "next";
import { ok } from "@/lib/api";
import { getCompany } from "@/lib/settings";

/**
 * GET /api/settings/public — company profile + default currency.
 * Safe for any signed-in user (used by client money formatters). Contains no secrets.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return ok(res, {}, 405);
  const company = await getCompany();
  return ok(res, { name: company.name, email: company.email, phone: company.phone, address: company.address, currency: company.currency });
}
