import { NextApiRequest, NextApiResponse } from "next";
import { ok, bad } from "@/lib/api";
import { getWorkforceBoard } from "@/lib/workforce";
import { apiManagement } from "@/lib/api";

/** GET /api/workforce — live free/busy board (managers only). */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const me = await apiManagement(req, res);
    if (!me) return bad(res, "Forbidden", 403);
    const board = await getWorkforceBoard();
    return ok(res, board);
  } catch (e) {
    console.error("[workforce]", e);
    return bad(res, "Internal server error", 500);
  }
}
