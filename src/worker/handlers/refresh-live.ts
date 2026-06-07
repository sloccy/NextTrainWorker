import type { Env } from "../types.js";
import { getArrivalsBin, writeArrivalsBin } from "../binary/r2.js";
import { putArrivalsBinInCache } from "../binary/cache.js";
import { getCachedOutput, setCachedOutput } from "../binary/module-cache.js";
import type { FetchResult } from "../live/fetch.js";
import { patchLive } from "../live/patch.js";
import { fingerprint } from "../binary/fingerprint.js";
import { TEMPLATE_BYTES } from "../generated/offsets.js";
import { BASE_MIDNIGHT_UTC } from "../util/base-time.js";

const TEMPLATE_LEN = TEMPLATE_BYTES.length;

let lastFingerprint = -1;

export async function handleRefreshLive(env: Env, ctx: ExecutionContext, tripResult: FetchResult): Promise<void> {
  const tStart = Date.now();
  const storedFull = getCachedOutput();

  if (!tripResult.fresh && storedFull) {
    console.log("[refresh] 304, skipped");
    return;
  }

  const fromR2 = storedFull
    ? null
    : await getArrivalsBin(env).catch((err: unknown) => {
        console.error("[refresh] R2 read failed:", err);
        return null;
      });

  const tFetched = Date.now();

  const previousFull = storedFull ?? fromR2;
  const previous = previousFull ? previousFull.subarray(0, TEMPLATE_LEN) : null;

  const { tripStatus, stopOverrides } = tripResult.data;
  const out = patchLive(tripStatus, stopOverrides, previous);
  setCachedOutput(out);
  const tPatched = Date.now();

  let stopsCount = 0;
  for (const m of stopOverrides.values()) stopsCount += m.size;

  const fp = fingerprint(out);
  const changed = fp !== lastFingerprint;
  lastFingerprint = fp;

  const scheduleAgeHours = (Date.now() / 1000 - BASE_MIDNIGHT_UTC) / 3600;
  if (scheduleAgeHours > 26) console.warn(`[refresh] STALE SCHEDULE: ${scheduleAgeHours.toFixed(1)}h old (baseMidnight=${new Date(BASE_MIDNIGHT_UTC * 1000).toISOString()})`);

  const { entitySeen, entityMissed, missedSamples } = tripResult.data;
  const missInfo = entityMissed > 0
    ? ` missed=${entityMissed}/${entitySeen} samples=${[...missedSamples].join("|")}`
    : ` matched=${entitySeen - entityMissed}/${entitySeen}`;
  console.log(
    `[refresh] trips=${tripStatus.size} stops=${stopsCount}${missInfo} fetch=${tFetched - tStart}ms decode=${tripResult.decodeMs}ms patch=${tPatched - tFetched}ms changed=${changed}`,
  );

  if (changed) {
    putArrivalsBinInCache(ctx, out);
    ctx.waitUntil(
      writeArrivalsBin(env, out).catch((err: unknown) => {
        console.error("[refresh] R2 write failed:", err);
        lastFingerprint = -1;
      }),
    );
  }
}
