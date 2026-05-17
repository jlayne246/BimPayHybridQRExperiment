import { createClient } from "redis";

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  throw new Error("REDIS_URL is not configured.");
}

const globalForRedis = globalThis as typeof globalThis & {
  redisClient?: ReturnType<typeof createClient>;
  redisClientPromise?: Promise<ReturnType<typeof createClient>>;
};

export function getRedisClient() {
  if (!globalForRedis.redisClient) {
    globalForRedis.redisClient = createClient({
      url: redisUrl,
    });

    globalForRedis.redisClient.on("error", (error) => {
      console.error("Redis Client Error", error);
    });
  }

  if (!globalForRedis.redisClient.isOpen) {
    globalForRedis.redisClientPromise = globalForRedis.redisClient.connect();
  }

  return globalForRedis.redisClientPromise ?? Promise.resolve(globalForRedis.redisClient);
}