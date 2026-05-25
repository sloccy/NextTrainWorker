import type { Env } from "../types.js";
import { fetchVehiclePositions } from "../live/vehicles-fetch.js";
import type { FetchedResult } from "../live/conditional-fetch.js";
import type { VehicleEvent } from "../live/vehicles-decode.js";
import { recordOtpObservations, rollupOtpDaily } from "../live/otp-record.js";

export async function handleRefreshOtp(env: Env, ctx: ExecutionContext): Promise<void> {
  let result: FetchedResult<VehicleEvent[]>;
  try {
    result = await fetchVehiclePositions();
  } catch (err) {
    console.error("[refresh-otp] fetch failed:", err);
    return;
  }

  const stoppedCount = result.value.filter(e => e.status === 1).length;

  if (result.fresh && result.value.length > 0) {
    ctx.waitUntil(
      recordOtpObservations(env, result.value).then(({ inserted, batches }) => {
        console.log(
          `[refresh-otp] events=${result.value.length} stopped=${stoppedCount} fetch=0ms decode=${result.decodeMs}ms d1Batches=${batches} inserted=${inserted}`,
        );
      }),
    );
  }
}

export async function handleOtpRollup(env: Env): Promise<void> {
  const t0 = Date.now();
  try {
    const { inserted, deleted } = await rollupOtpDaily(env);
    console.log(`[otp-rollup] inserted=${inserted} deleted=${deleted} ms=${Date.now() - t0}`);
  } catch (err) {
    console.error("[otp-rollup] failed:", err);
  }
}
