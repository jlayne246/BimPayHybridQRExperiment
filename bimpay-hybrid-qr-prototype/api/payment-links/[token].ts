import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getRedisClient } from "../_redis";

type PaymentLinkRecord = {
  token: string;
  emvPayload: string;
  createdAt: string;
  expiresAt: string;
  isActive: boolean;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const token = String(req.query.token ?? "").trim();

  if (!token) {
    return res.status(400).json({ error: "token is required." });
  }

  console.log("Resolving token:", token);

  const redis = await getRedisClient();
  const raw = await redis.get(`payment-link:${token}`);

  if (!raw) {
    return res.status(404).json({ error: "Payment link not found or expired." });
  }

  const record = JSON.parse(raw) as PaymentLinkRecord;

  if (!record.isActive) {
    return res.status(404).json({ error: "Payment link is inactive." });
  }

  return res.status(200).json(record);
}