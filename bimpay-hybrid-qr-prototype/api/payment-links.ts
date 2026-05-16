import type { VercelRequest, VercelResponse } from "@vercel/node";
import { nanoid } from "nanoid";

type PaymentLinkRecord = {
  token: string;
  emvPayload: string;
  createdAt: string;
  isActive: boolean;
};

const globalStore = globalThis as typeof globalThis & {
  paymentLinks?: Map<string, PaymentLinkRecord>;
};

const paymentLinks =
  globalStore.paymentLinks ?? new Map<string, PaymentLinkRecord>();

globalStore.paymentLinks = paymentLinks;

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

  paymentLinks.set(token, record);

  return res.status(201).json(record);
}