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
  events: Array<{ status: PaymentSessionStatus; actor: string; timestamp: string }>;
};

type PaymentSessionStatus =
  | "created"
  | "scanned"
  | "authorized"
  | "declined"
  | "expired"
  | "cancelled"
  | "refunded";

const paymentLinks = new Map<string, PaymentLinkRecord>();
const SESSION_STATUSES = new Set<PaymentSessionStatus>([
  "created", "scanned", "authorized", "declined", "expired", "cancelled", "refunded",
]);

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

  if (!emvPayload) {
    return res.status(400).json({ error: "emvPayload is required." });
  }

  if (!isSandboxPayload(emvPayload)) {
    return res.status(400).json({
      error: "Only clearly marked test-only sandbox payloads may be stored.",
    });
  }

  const token = nanoid(10);

  const now = new Date();
  const record: PaymentLinkRecord = {
    token,
    emvPayload,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
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

  paymentLinks.set(token, record);

  return res.json(record);
});

app.get("/api/payment-links", (req, res) => {
  const token = String(req.query.token ?? req.query.t ?? "").trim();
  const record = paymentLinks.get(token);

  if (!record || !record.isActive) {
    return res.status(404).json({ error: "Payment link not found." });
  }

  return res.json(record);
});

app.patch("/api/payment-links", (req, res) => {
  const token = String(req.query.token ?? req.query.t ?? "").trim();
  const { status, actor = "participant", authorizedAmount = "" } = req.body as {
    status?: PaymentSessionStatus;
    actor?: string;
    authorizedAmount?: string;
  };
  const record = paymentLinks.get(token);

  if (!record || !record.isActive) {
    return res.status(404).json({ error: "Payment session not found." });
  }
  if (!status || !SESSION_STATUSES.has(status)) {
    return res.status(400).json({ error: "A valid status is required." });
  }
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
    events: [...record.events, { status, actor: actor.slice(0, 60), timestamp: now }],
  };
  paymentLinks.set(token, updated);
  return res.json(updated);
});

app.listen(port, () => {
  console.log(`Payment link API running on http://localhost:${port}`);
});
