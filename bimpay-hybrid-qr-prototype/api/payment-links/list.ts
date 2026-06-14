import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuthentication } from "../_auth.js";
import { getRedisClient } from "../_redis.js";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (!requireAuthentication(req, res)) {
    return;
  }

  try {
    const redis = await getRedisClient();

    const keys = await redis.keys("payment-link:*");

    const results = [];

    for (const key of keys) {
      const value = await redis.get(key);

      results.push({
        key,
        value: value ? JSON.parse(String(value)) : null,
      });
    }

    return res.status(200).json(results);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Could not list payment links.",
    });
  }
}
