import type { Env } from "./types.js";

export async function getArrivalsBin(env: Env): Promise<Uint8Array | null> {
  const obj = await env.ARRIVALS_R2.get("arrivals/current.bin");
  if (!obj) return null;
  return new Uint8Array(await obj.arrayBuffer());
}

export async function writeArrivalsBin(env: Env, buf: Uint8Array): Promise<void> {
  await env.ARRIVALS_R2.put("arrivals/current.bin", buf, {
    httpMetadata: { contentType: "application/octet-stream" },
  });
}

export async function getStationsBin(env: Env): Promise<Uint8Array | null> {
  const obj = await env.ARRIVALS_R2.get("arrivals/stations.bin");
  if (!obj) return null;
  return new Uint8Array(await obj.arrayBuffer());
}

