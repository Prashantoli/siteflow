import { NextApiRequest, NextApiResponse } from "next";
import { getCsrfToken } from "next-auth/react";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = await getCsrfToken({ req: { headers: req.headers } as any });
  res.status(200).json({ csrfToken: token });
}
