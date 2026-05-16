import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

type PaymentLinkRecord = {
  token: string;
  emvPayload: string;
  createdAt: string;
  isActive: boolean;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const token = String(req.query.token ?? "");

  const record = await redis.get<PaymentLinkRecord>(`payment-link:${token}`);

  if (!record || !record.isActive) {
    return res.status(404).json({ error: "Payment link not found." });
  }

  return res.status(200).json(record);
}