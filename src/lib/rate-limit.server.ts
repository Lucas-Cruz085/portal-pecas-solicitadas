import { getRequest } from "@tanstack/react-start/server";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function prune(now: number) {
  if (buckets.size < 5000) return;
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}

export function clientAddress() {
  const request = getRequest();
  const forwarded = request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request?.headers.get("x-real-ip") || "local";
}

export function assertRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  prune(now);
  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > limit) throw new Error("Muitas tentativas. Aguarde alguns minutos.");
}
