import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  authenticationIsConfigured,
  clearSessionCookie,
  passwordIsValid,
  requestIsAuthenticated,
  setSessionCookie,
} from "./_auth.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    return res.status(200).json({
      authenticated: requestIsAuthenticated(req),
    });
  }

  if (req.method === "POST") {
    if (!authenticationIsConfigured()) {
      return res.status(503).json({
        error: "Authentication is not configured for this deployment.",
      });
    }

    const password =
      typeof req.body?.password === "string" ? req.body.password : "";
    const acceptedTerms = req.body?.acceptedTerms === true;

    if (!acceptedTerms) {
      return res.status(400).json({ error: "Acceptance of the experimental-use terms is required." });
    }

    if (!passwordIsValid(password)) {
      return res.status(401).json({ error: "Incorrect password." });
    }

    setSessionCookie(res);
    return res.status(200).json({ authenticated: true });
  }

  if (req.method === "DELETE") {
    clearSessionCookie(res);
    return res.status(200).json({ authenticated: false });
  }

  return res.status(405).json({ error: "Method not allowed." });
}
