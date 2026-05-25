import type { Env } from "../types.js";
import { fetchVehiclePositions } from "../live/vehicles-fetch.js";
import { recordOtpObservations, rollupOtpDaily } from "../live/otp-record.js";

export async function handleRefreshOtp(env: Env, ctx: ExecutionContext): Promise<void> {
  let events;
  let fresh;
  try {
    ({ events, fresh } = await fetchVehiclePositions());
  } catch (err) {
    console.error("[refresh-otp] fetch failed:", err);
    return;
  }
  if (fresh && events.length > 0) {
    ctx.waitUntil(recordOtpObservations(env, events));
  }
}

export async function handleOtpRollup(env: Env): Promise<void> {
  try {
    await rollupOtpDaily(env);
    console.log("[otp-rollup] done");
  } catch (err) {
    console.error("[otp-rollup] failed:", err);
  }
}
