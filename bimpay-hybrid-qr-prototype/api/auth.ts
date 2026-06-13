import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
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
    const password =
      typeof req.body?.password === "string" ? req.body.password : "";

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
