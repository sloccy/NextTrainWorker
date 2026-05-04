import type { Env, ArrivalsBlob } from "./types.js";

const ARRIVALS_KEY = "arrivals/current.json";

export async function getArrivals(env: Env): Promise<ArrivalsBlob | null> {
  const obj = await env.ARRIVALS_R2.get(ARRIVALS_KEY);
  if (!obj) return null;
  return obj.json<ArrivalsBlob>();
}

export async function writeArrivals(env: Env, json: string): Promise<void> {
  await env.ARRIVALS_R2.put(ARRIVALS_KEY, json, {
    httpMetadata: {
      contentType: "application/json",
      cacheControl: "public, max-age=20",
    },
  });
}
