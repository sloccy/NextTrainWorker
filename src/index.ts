import type { Env } from "./types.js";
import { handleArrivals } from "./handlers/arrivals.js";
import { handleStations } from "./handlers/stations.js";
import { handleRefreshLive } from "./handlers/refresh-live.js";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/arrivals") return handleArrivals(request, env);
    if (url.pathname === "/stations") return handleStations(env);

    return new Response("Not found", { status: 404 });
  },

  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    if (event.cron === "* * * * *") await handleRefreshLive(env);
  },
};
