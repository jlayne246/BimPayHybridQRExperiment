import express from "express";
import cors from "cors";
import { createHmac, timingSafeEqual } from "node:crypto";
import { nanoid } from "nanoid";

const app = express();
const port = 5050;

const defaultPassword = "BiMPay-demo-123";
const sitePassword = process.env.SITE_PASSWORD || defaultPassword;
const sessionSecret =
  process.env.SESSION_SECRET || `${sitePassword}:bimpay-session`;
const sessionCookie = "bimpay_session";
const sessionToken = createHmac("sha256", sessionSecret)
  .update(`authenticated:${sitePassword}`)
  .digest("hex");

app.use(cors({ credentials: true, origin: true }));
app.use(express.json({ limit: "1mb" }));

type PaymentLinkRecord = {
  token: string;
  emvPayload: string;
  createdAt: string;
  isActive: boolean;
};

const paymentLinks = new Map<string, PaymentLinkRecord>();

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function readSessionCookie(cookieHeader = ""): string {
  for (const cookie of cookieHeader.split(";")) {
    const [name, ...valueParts] = cookie.trim().split("=");

    if (name === sessionCookie) {
      return decodeURIComponent(valueParts.join("="));
    }
  }

  return "";
}

function isAuthenticated(req: express.Request): boolean {
  return constantTimeEqual(
    readSessionCookie(req.headers.cookie),
    sessionToken
  );
}

app.get("/api/auth", (req, res) => {
  return res.json({ authenticated: isAuthenticated(req) });
});

app.post("/api/auth", (req, res) => {
  const password =
    typeof req.body?.password === "string" ? req.body.password : "";

  if (!constantTimeEqual(password, sitePassword)) {
    return res.status(401).json({ error: "Incorrect password." });
  }

  res.setHeader(
    "Set-Cookie",
    `${sessionCookie}=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 8}`
  );
  return res.json({ authenticated: true });
});

app.delete("/api/auth", (_req, res) => {
  res.setHeader(
    "Set-Cookie",
    `${sessionCookie}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
  return res.json({ authenticated: false });
});

app.use("/api/payment-links", (req, res, next) => {
  if (!isAuthenticated(req)) {
    return res.status(401).json({ error: "Authentication required." });
  }

  next();
});

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
