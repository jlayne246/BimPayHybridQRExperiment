import type { VercelRequest, VercelResponse } from "@vercel/node";

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
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const token = String(req.query.token ?? "");

  const record = paymentLinks.get(token);

  if (!record || !record.isActive) {
    return res.status(404).json({ error: "Payment link not found." });
  }

  return res.status(200).json(record);
}