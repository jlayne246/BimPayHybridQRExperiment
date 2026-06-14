import { createHmac, timingSafeEqual } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const DEFAULT_PASSWORD = "BiMPay-demo-123";
const SESSION_COOKIE = "bimpay_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

/**
 * Production fails closed unless both secrets exist. Development keeps a
 * deterministic fallback so the local prototype remains easy to start.
 */
export function authenticationIsConfigured(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    Boolean(process.env.SITE_PASSWORD && process.env.SESSION_SECRET)
  );
}

function getPassword(): string {
  return process.env.SITE_PASSWORD || (process.env.NODE_ENV !== "production" ? DEFAULT_PASSWORD : "");
}

function getSessionSecret(): string {
  return (
    process.env.SESSION_SECRET ||
    (process.env.NODE_ENV !== "production" ? `${getPassword()}:bimpay-session` : "")
  );
}

/** Derives a stable opaque token without placing the password in the cookie. */
function expectedSessionToken(): string {
  return createHmac("sha256", getSessionSecret())
    .update(`authenticated:${getPassword()}`)
    .digest("hex");
}

/** Avoids timing differences when comparing passwords and session tokens. */
function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function readCookie(req: VercelRequest, name: string): string {
  const cookieHeader = req.headers.cookie ?? "";

  for (const cookie of cookieHeader.split(";")) {
    const [cookieName, ...valueParts] = cookie.trim().split("=");

    if (cookieName === name) {
      return decodeURIComponent(valueParts.join("="));
    }
  }

  return "";
}

/** Validates the submitted private-site password. */
export function passwordIsValid(password: string): boolean {
  return authenticationIsConfigured() && constantTimeEqual(password, getPassword());
}

/** Checks the HTTP-only site cookie independently of Supabase collaboration auth. */
export function requestIsAuthenticated(req: VercelRequest): boolean {
  if (!authenticationIsConfigured()) {
    return false;
  }

  return constantTimeEqual(
    readCookie(req, SESSION_COOKIE),
    expectedSessionToken()
  );
}

/** Guards an API handler and writes a standard 401 response on failure. */
export function requireAuthentication(
  req: VercelRequest,
  res: VercelResponse
): boolean {
  if (requestIsAuthenticated(req)) {
    return true;
  }

  res.status(401).json({ error: "Authentication required." });
  return false;
}

/** Issues the eight-hour private-site session cookie. */
export function setSessionCookie(res: VercelResponse): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";

  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${expectedSessionToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}${secure}`
  );
}

/** Expires the private-site session cookie immediately. */
export function clearSessionCookie(res: VercelResponse): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";

  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`
  );
}
