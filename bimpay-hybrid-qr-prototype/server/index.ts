import express from "express";
import cors from "cors";
import { nanoid } from "nanoid";

const app = express();
const port = 5050;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

type PaymentLinkRecord = {
  token: string;
  emvPayload: string;
  createdAt: string;
  isActive: boolean;
};

const paymentLinks = new Map<string, PaymentLinkRecord>();

app.post("/api/payment-links", (req, res) => {
  const { emvPayload } = req.body as { emvPayload?: string };

  if (!emvPayload) {
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

  return res.json(record);
});

app.get("/api/payment-links/:token", (req, res) => {
  const record = paymentLinks.get(req.params.token);

  if (!record || !record.isActive) {
    return res.status(404).json({ error: "Payment link not found." });
  }

  return res.json(record);
});

app.listen(port, () => {
  console.log(`Payment link API running on http://localhost:${port}`);
});