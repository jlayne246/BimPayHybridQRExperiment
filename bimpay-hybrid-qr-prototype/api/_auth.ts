import { createHmac, timingSafeEqual } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const DEFAULT_PASSWORD = "bimpay-demo-123";
const SESSION_COOKIE = "bimpay_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

function getPassword(): string {
  return process.env.SITE_PASSWORD || DEFAULT_PASSWORD;
}

function getSessionSecret(): string {
  return process.env.SESSION_SECRET || `${getPassword()}:bimpay-session`;
}

function expectedSessionToken(): string {
  return createHmac("sha256", getSessionSecret())
    .update(`authenticated:${getPassword()}`)
    .digest("hex");
}

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

export function passwordIsValid(password: string): boolean {
  return constantTimeEqual(password, getPassword());
}

export function requestIsAuthenticated(req: VercelRequest): boolean {
  return constantTimeEqual(
    readCookie(req, SESSION_COOKIE),
    expectedSessionToken()
  );
}

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

export function setSessionCookie(res: VercelResponse): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";

  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${expectedSessionToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}${secure}`
  );
}

export function clearSessionCookie(res: VercelResponse): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";

  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`
  );
}
