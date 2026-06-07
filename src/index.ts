import type { Env } from "./worker/types.js";
import { handleArrivals } from "./worker/handlers/arrivals.js";
import { handleStations } from "./worker/handlers/stations.js";
import { handleConfig } from "./worker/handlers/config.js";
import { handleRefreshLive } from "./worker/handlers/refresh-live.js";
import { handleAlerts } from "./worker/handlers/alerts.js";
import { handleRefreshAlerts } from "./worker/handlers/refresh-alerts.js";
import { fetchTripUpdates } from "./worker/live/fetch.js";
import { fetchAlerts } from "./worker/live/alerts-fetch.js";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/a") return handleArrivals(request, env, ctx);
    if (pathname === "/s") return handleStations();
    if (pathname === "/al") return handleAlerts(request, env, ctx);
    if (pathname === "/config.html") return handleConfig();
    return new Response("Not found", { status: 404 });
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    if (event.cron === "*/2 * * * *") {
      // Alerts-only tick every 2 minutes — transit alerts change infrequently.
      const alertsResult = await fetchAlerts();
      await handleRefreshAlerts(env, ctx, alertsResult);
      return;
    }

    // Per-minute tick: live arrivals
    const tStart = Date.now();
    const tripResult = await fetchTripUpdates();
    const tFetched = Date.now();
    await handleRefreshLive(env, ctx, tripResult);
    console.log(`[cron] fetch=${tFetched - tStart}ms live=${Date.now() - tFetched}ms total=${Date.now() - tStart}ms`);
  },
};
