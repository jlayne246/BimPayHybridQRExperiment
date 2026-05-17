import type { VercelRequest, VercelResponse } from "@vercel/node";
import { nanoid } from "nanoid";
import { getRedisClient } from "./_redis.js";

type PaymentLinkRecord = {
  token: string;
  emvPayload: string;
  createdAt: string;
  expiresAt: string;
  isActive: boolean;
};

const TTL_SECONDS = 60 * 15;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "POST") {
    return createPaymentLink(req, res);
  }

  if (req.method === "GET") {
    return getPaymentLink(req, res);
  }

  return res.status(405).json({ error: "Method not allowed." });
}

async function createPaymentLink(req: VercelRequest, res: VercelResponse) {
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

  const redis = await getRedisClient();

  await redis.setEx(
    `payment-link:${token}`,
    TTL_SECONDS,
    JSON.stringify(record)
  );

  return res.status(201).json(record);
}

async function getPaymentLink(req: VercelRequest, res: VercelResponse) {
  console.log("GET payment link query:", req.query);
  
  const token = String(req.query.token ?? req.query.t ?? "").trim();

  if (!token) {
    return res.status(400).json({ error: "token is required." });
  }

  console.log("Resolved token:", token);

    const redis = await getRedisClient();
    const raw = await redis.get(`payment-link:${token}`);

    console.log("Redis raw value:", raw);

  if (!raw) {
    return res.status(404).json({ error: "Payment link not found or expired." });
  }

  const record = JSON.parse(raw) as PaymentLinkRecord;

  if (!record.isActive) {
    return res.status(404).json({ error: "Payment link is inactive." });
  }

  return res.status(200).json(record);
}