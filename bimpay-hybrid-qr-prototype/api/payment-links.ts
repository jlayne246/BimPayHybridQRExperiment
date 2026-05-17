import type { VercelRequest, VercelResponse } from "@vercel/node";
import { nanoid } from "nanoid";
import { getRedisClient } from "./_redis";

type PaymentLinkRecord = {
  token: string;
  emvPayload: string;
  createdAt: string;
  expiresAt: string;
  isActive: boolean;
};

const TTL_SECONDS = 60 * 15; // 15 minutes

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const { emvPayload } = req.body as { emvPayload?: string };

  if (!emvPayload?.trim()) {
    return res.status(400).json({ error: "emvPayload is required." });
  }

  const token = nanoid(12);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TTL_SECONDS * 1000).toISOString();

  const record: PaymentLinkRecord = {
    token,
    emvPayload,
    createdAt: now.toISOString(),
    expiresAt,
    isActive: true,
  };

  console.log("Saving token:", token);
  console.log("Redis key:", `payment-link:${token}`);

  const redis = await getRedisClient();

  await redis.setEx(
    `payment-link:${token}`,
    TTL_SECONDS,
    JSON.stringify(record)
  );

  return res.status(201).json(record);
}