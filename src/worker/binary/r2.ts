import type { Env } from "../types.js";
import {
  getArrivalsBinFromCache,
  putArrivalsBinInCache,
  readGeneratedAt,
  currentTickBoundary,
} from "./cache.js";
import { getCachedOutput } from "./module-cache.js";

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

export async function getArrivalsBinTiered(
  env: Env,
  ctx: ExecutionContext,
): Promise<Uint8Array | null> {
  const boundary = currentTickBoundary();

  const live = getCachedOutput();
  if (live && readGeneratedAt(live) >= boundary) return live;

  const cached = await getArrivalsBinFromCache();
  if (cached && readGeneratedAt(cached) >= boundary) return cached;

  const fromR2 = await getArrivalsBin(env);
  if (fromR2) {
    putArrivalsBinInCache(ctx, fromR2);
    return fromR2;
  }

  return cached ?? live ?? null;
}
