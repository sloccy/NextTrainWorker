import type { Env } from "./worker/types.js";
import { handleArrivals } from "./worker/handlers/arrivals.js";
import { handleStations } from "./worker/handlers/stations.js";
import { handleConfig } from "./worker/handlers/config.js";
import { handleRefreshLive } from "./worker/handlers/refresh-live.js";
import { handleAlerts } from "./worker/handlers/alerts.js";
import { handleRefreshAlerts } from "./worker/handlers/refresh-alerts.js";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/a") return handleArrivals(request, env, ctx);
    if (pathname === "/s") return handleStations();
    if (pathname === "/al") return handleAlerts(request, env);
    if (pathname === "/config.html") return handleConfig();
    return new Response("Not found", { status: 404 });
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    if (event.cron === "* * * * *") {
      await handleRefreshLive(env, ctx);
      await handleRefreshAlerts(env, ctx);
    }
  },
};
