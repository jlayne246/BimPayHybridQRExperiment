import type { VercelRequest, VercelResponse } from "@vercel/node";
import { nanoid } from "nanoid";
import { requireAuthentication } from "./_auth.js";
import { getRedisClient } from "./_redis.js";

type PaymentLinkRecord = {
  token: string;
  emvPayload: string;
  createdAt: string;
  expiresAt: string;
  updatedAt: string;
  isActive: boolean;
  status: PaymentSessionStatus;
  payerName: string;
  recipientName: string;
  reference: string;
  requestedAmount: string;
  amountMode: "fixed" | "variable";
  authorizedAmount: string;
  events: PaymentSessionEvent[];
};

type PaymentSessionStatus =
  | "created"
  | "scanned"
  | "authorized"
  | "declined"
  | "expired"
  | "cancelled"
  | "refunded";

type PaymentSessionEvent = {
  status: PaymentSessionStatus;
  actor: string;
  timestamp: string;
};

const TTL_SECONDS = 60 * 15;
const SESSION_STATUSES = new Set<PaymentSessionStatus>([
  "created",
  "scanned",
  "authorized",
  "declined",
  "expired",
  "cancelled",
  "refunded",
]);

/**
 * Rejects arbitrary production-looking payloads before they enter Redis.
 * This is a safety marker check, not a complete EMV validation routine.
 */
function isSandboxPayload(payload: string): boolean {
  return (
    payload.includes("bb.org.cb.mpqr") &&
    payload.includes("QRBB") &&
    payload.includes("TEST") &&
    /040633333[12]/.test(payload)
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  if (!requireAuthentication(req, res)) {
    return;
  }

  try {
    if (req.method === "POST") return await createPaymentLink(req, res);
    if (req.method === "GET") return await getPaymentLink(req, res);
    if (req.method === "PATCH") return await updatePaymentLink(req, res);
    return res.status(405).json({ error: "Method not allowed." });
  } catch (error) {
    console.error("Payment session API error", error);
    return res.status(500).json({ error: "The payment session service failed." });
  }
}

async function createPaymentLink(req: VercelRequest, res: VercelResponse) {
  const {
    emvPayload,
    payerName = "",
    recipientName = "",
    reference = "",
    requestedAmount = "",
    amountMode = "fixed",
  } = req.body as {
    emvPayload?: string;
    payerName?: string;
    recipientName?: string;
    reference?: string;
    requestedAmount?: string;
    amountMode?: "fixed" | "variable";
  };

  if (!emvPayload?.trim()) {
    return res.status(400).json({ error: "emvPayload is required." });
  }

  if (!isSandboxPayload(emvPayload)) {
    return res.status(400).json({
      error: "Only clearly marked test-only sandbox payloads may be stored.",
    });
  }

  const token = nanoid(12);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TTL_SECONDS * 1000).toISOString();

  const record: PaymentLinkRecord = {
    token,
    emvPayload,
    createdAt: now.toISOString(),
    expiresAt,
    updatedAt: now.toISOString(),
    isActive: true,
    status: "created",
    payerName: payerName.slice(0, 60),
    recipientName: recipientName.slice(0, 60),
    reference: reference.slice(0, 100),
    requestedAmount,
    amountMode: amountMode === "variable" ? "variable" : "fixed",
    authorizedAmount: "",
    events: [{ status: "created", actor: "creator", timestamp: now.toISOString() }],
  };

  const redis = await getRedisClient();

  // Redis owns expiry so stale sessions disappear without a cleanup worker.
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

  const record = normalizePaymentLinkRecord(
    JSON.parse(redisText(raw)) as Partial<PaymentLinkRecord>
  );

  if (!record.isActive) {
    return res.status(404).json({ error: "Payment link is inactive." });
  }

  return res.status(200).json(record);
}

async function updatePaymentLink(req: VercelRequest, res: VercelResponse) {
  const token = String(req.query.token ?? req.query.t ?? "").trim();
  const { status, actor = "participant", authorizedAmount = "" } = req.body as {
    status?: PaymentSessionStatus;
    actor?: string;
    authorizedAmount?: string;
  };

  if (!token || !status || !SESSION_STATUSES.has(status)) {
    return res.status(400).json({ error: "A valid token and status are required." });
  }

  const redis = await getRedisClient();
  const key = `payment-link:${token}`;
  const raw = await redis.get(key);
  if (!raw) return res.status(404).json({ error: "Payment session not found or expired." });

  const record = normalizePaymentLinkRecord(
    JSON.parse(redisText(raw)) as Partial<PaymentLinkRecord>
  );
  if (
    status === "authorized" &&
    record.amountMode === "variable" &&
    !/^\d+(\.\d{2})$/.test(authorizedAmount)
  ) {
    return res.status(400).json({ error: "A valid authorized amount is required." });
  }

  const now = new Date().toISOString();
  const updated: PaymentLinkRecord = {
    ...record,
    status,
    updatedAt: now,
    authorizedAmount:
      status === "authorized"
        ? record.amountMode === "variable"
          ? authorizedAmount
          : record.requestedAmount
        : record.authorizedAmount,
    events: [...(record.events ?? []), { status, actor: actor.slice(0, 60), timestamp: now }],
  };
  // Preserve the original remaining lifetime instead of extending every update.
  const ttl = Number(await redis.ttl(key));
  await redis.setEx(key, ttl > 0 ? ttl : TTL_SECONDS, JSON.stringify(updated));
  return res.status(200).json(updated);
}

function redisText(value: string | Buffer): string {
  return typeof value === "string" ? value : value.toString("utf8");
}

function normalizePaymentLinkRecord(
  record: Partial<PaymentLinkRecord>
): PaymentLinkRecord {
  const createdAt = record.createdAt ?? new Date().toISOString();

  return {
    token: record.token ?? "",
    emvPayload: record.emvPayload ?? "",
    createdAt,
    expiresAt:
      record.expiresAt ??
      new Date(new Date(createdAt).getTime() + TTL_SECONDS * 1000).toISOString(),
    updatedAt: record.updatedAt ?? createdAt,
    isActive: record.isActive !== false,
    status: record.status ?? "created",
    payerName: record.payerName ?? "",
    recipientName: record.recipientName ?? "",
    reference: record.reference ?? "",
    requestedAmount: record.requestedAmount ?? "",
    amountMode: record.amountMode === "variable" ? "variable" : "fixed",
    authorizedAmount: record.authorizedAmount ?? "",
    events:
      record.events ??
      [{ status: "created", actor: "creator", timestamp: createdAt }],
  };
}
