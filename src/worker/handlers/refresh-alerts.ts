import type { Env } from "../types.js";
import type { FetchedResult } from "../live/conditional-fetch.js";
import type { ParsedAlert } from "../live/alerts-decode.js";
import { buildAlertsBin } from "../binary/alerts.js";
import { writeAlertsBin } from "../binary/r2.js";
import { fingerprint } from "../binary/fingerprint.js";
import { setCachedBin } from "../binary/module-cache.js";
import { putAlertsBinInCache } from "../binary/cache.js";

let lastFingerprint = -1;

export async function handleRefreshAlerts(env: Env, ctx: ExecutionContext, result: FetchedResult<ParsedAlert[]>): Promise<void> {
  if (!result.fresh) return;

  const tBuild = Date.now();
  const generatedAt = Math.floor(Date.now() / 1000);
  const bin = buildAlertsBin(result.value, generatedAt);
  const buildMs = Date.now() - tBuild;

  const fp = fingerprint(bin);
  const changed = fp !== lastFingerprint;
  lastFingerprint = fp;

  console.log(
    `[refresh-alerts] alerts=${result.value.length} fetch=${result.decodeMs + 0}ms decode=${result.decodeMs}ms build=${buildMs}ms bytes=${bin.length} changed=${changed}`,
  );

  if (changed) {
    setCachedBin("alerts", bin);
    putAlertsBinInCache(ctx, bin);
    ctx.waitUntil(
      writeAlertsBin(env, bin).catch((err: unknown) => {
        console.error("[refresh-alerts] R2 write failed:", err);
        lastFingerprint = -1;
      }),
    );
  }
}
