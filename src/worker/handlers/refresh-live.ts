import type { Env } from "../types.js";
import { getArrivalsBin, writeArrivalsBin } from "../binary/r2.js";
import { putArrivalsBinInCache } from "../binary/cache.js";
import { getCachedOutput, setCachedOutput } from "../binary/module-cache.js";
import { fetchTripUpdates } from "../live/fetch.js";
import { patchLive } from "../live/patch.js";

let lastFingerprint = -1;

function fingerprint(buf: Uint8Array): number {
  let h = 0;
  // skip timestamp bytes 0..3
  const u32 = new Uint32Array(buf.buffer, buf.byteOffset + 4, (buf.byteLength - 4) >>> 2);
  for (let i = 0; i < u32.length; i++) h = (h ^ u32[i]) >>> 0;
  return h;
}

export async function handleRefreshLive(env: Env, ctx: ExecutionContext): Promise<void> {
  const tStart = Date.now();
  const [result, previous] = await Promise.all([
    fetchTripUpdates(),
    getCachedOutput()
      ? Promise.resolve(getCachedOutput())
      : getArrivalsBin(env).catch((err: unknown) => {
          console.error("[refresh] R2 read failed:", err);
          return null;
        }),
  ]);
  const tFetched = Date.now();

  if (!result.fresh) {
    console.log("[refresh] 304 or stale, skipped");
    return;
  }

  const { tripStatus, stopOverrides } = result.data;
  const out = patchLive(tripStatus, stopOverrides, previous);
  setCachedOutput(out);
  const tPatched = Date.now();

  let stopsCount = 0;
  for (const m of stopOverrides.values()) stopsCount += m.size;

  const fp = fingerprint(out);
  const changed = fp !== lastFingerprint;
  lastFingerprint = fp;

  console.log(
    `[refresh] trips=${tripStatus.size} stops=${stopsCount} fetch=${tFetched - tStart}ms decode=${result.decodeMs}ms patch=${tPatched - tFetched}ms changed=${changed}`,
  );

  if (changed) {
    ctx.waitUntil(writeArrivalsBin(env, out));
    putArrivalsBinInCache(ctx, out);
  }
}
