import type { Env } from "./worker/types.js";
import { handleArrivals } from "./worker/handlers/arrivals.js";
import { handleStations } from "./worker/handlers/stations.js";
import { handleConfig } from "./worker/handlers/config.js";
import { handleRefreshLive } from "./worker/handlers/refresh-live.js";
import { handleAlerts } from "./worker/handlers/alerts.js";
import { handleRefreshAlerts } from "./worker/handlers/refresh-alerts.js";
import { handleOtp } from "./worker/handlers/otp.js";
import { handleRefreshOtp, handleOtpRollup } from "./worker/handlers/refresh-otp.js";
import { fetchTripUpdates } from "./worker/live/fetch.js";
import { fetchVehiclePositions } from "./worker/live/vehicles-fetch.js";
import { fetchAlerts } from "./worker/live/alerts-fetch.js";

async function timed(fn: () => Promise<void>): Promise<number> {
  const t = Date.now();
  await fn();
  return Date.now() - t;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/a") return handleArrivals(request, env, ctx);
    if (pathname === "/s") return handleStations();
    if (pathname === "/al") return handleAlerts(request, env, ctx);
    if (pathname === "/otp") return handleOtp(request, env);
    if (pathname === "/config.html") return handleConfig();
    return new Response("Not found", { status: 404 });
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    if (event.cron === "0 10 * * *") {
      await handleOtpRollup(env);
      return;
    }

    if (event.cron === "*/2 * * * *") {
      // OTP-only tick every 2 minutes — keeps per-minute CPU under 10ms free-tier budget.
      const vpResult = await fetchVehiclePositions();
      await handleRefreshOtp(env, ctx, vpResult);
      return;
    }

    // Per-minute tick: live arrivals + alerts
    const tStart = Date.now();
    const [tripResult, vpResult, alertsResult] = await Promise.all([
      fetchTripUpdates(),
      fetchVehiclePositions(),
      fetchAlerts(),
    ]);
    const tFetched = Date.now();
    const [liveMs, alertsMs] = await Promise.all([
      timed(() => handleRefreshLive(env, ctx, tripResult, vpResult)),
      timed(() => handleRefreshAlerts(env, ctx, alertsResult)),
    ]);
    console.log(`[cron] fetch=${tFetched - tStart}ms live=${liveMs}ms alerts=${alertsMs}ms total=${Date.now() - tStart}ms`);
  },
};
