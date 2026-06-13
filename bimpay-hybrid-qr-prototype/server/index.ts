import express from "express";
import cors from "cors";
import { createHmac, timingSafeEqual } from "node:crypto";
import { nanoid } from "nanoid";

const app = express();
const port = 5050;

const defaultPassword = "BiMPay-demo-123";
const productionAuthenticationConfigured = Boolean(
  process.env.SITE_PASSWORD && process.env.SESSION_SECRET
);
const authenticationConfigured =
  process.env.NODE_ENV !== "production" || productionAuthenticationConfigured;
const sitePassword =
  process.env.SITE_PASSWORD ||
  (process.env.NODE_ENV !== "production" ? defaultPassword : "");
const sessionSecret =
  process.env.SESSION_SECRET ||
  (process.env.NODE_ENV !== "production" ? `${sitePassword}:bimpay-session` : "");
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

function isSandboxPayload(payload: string): boolean {
  return (
    payload.includes("bb.org.cb.mpqr") &&
    payload.includes("QRBB") &&
    payload.includes("TEST") &&
    /040633333[12]/.test(payload)
  );
}

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
  if (!authenticationConfigured) {
    return false;
  }

  return constantTimeEqual(
    readSessionCookie(req.headers.cookie),
    sessionToken
  );
}

app.get("/api/auth", (req, res) => {
  return res.json({ authenticated: isAuthenticated(req) });
});

app.post("/api/auth", (req, res) => {
  if (!authenticationConfigured) {
    return res.status(503).json({
      error: "Authentication is not configured for this deployment.",
    });
  }

  const password =
    typeof req.body?.password === "string" ? req.body.password : "";
  const acceptedTerms = req.body?.acceptedTerms === true;

  if (!acceptedTerms) {
    return res.status(400).json({
      error: "Acceptance of the experimental-use terms is required.",
    });
  }

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

  if (!isSandboxPayload(emvPayload)) {
    return res.status(400).json({
      error: "Only clearly marked test-only sandbox payloads may be stored.",
    });
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
