import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";
import { nanoid } from "nanoid";

const redis = Redis.fromEnv();

type PaymentLinkRecord = {
  token: string;
  emvPayload: string;
  createdAt: string;
  isActive: boolean;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const { emvPayload } = req.body as { emvPayload?: string };

  if (!emvPayload?.trim()) {
    return res.status(400).json({ error: "emvPayload is required." });
  }

  const token = nanoid(10);

  const record: PaymentLinkRecord = {
    token,
    emvPayload,
    createdAt: new Date().toISOString(),
    isActive: true,
  };

  await redis.set(`payment-link:${token}`, record, {
    ex: 60 * 60 * 24 * 30,
  });

  return res.status(201).json(record);
}