import type { Env } from "./worker/types.js";
import { handleArrivals } from "./worker/handlers/arrivals.js";
import { handleStations } from "./worker/handlers/stations.js";
import { handleConfig } from "./worker/handlers/config.js";
import { handleRefreshLive } from "./worker/handlers/refresh-live.js";
import { handleAlerts } from "./worker/handlers/alerts.js";
import { handleRefreshAlerts } from "./worker/handlers/refresh-alerts.js";
import { handleOtp } from "./worker/handlers/otp.js";
import { handleRefreshOtp, handleOtpRollup } from "./worker/handlers/refresh-otp.js";

async function timed(_label: string, fn: () => Promise<void>): Promise<number> {
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
    if (event.cron === "* * * * *") {
      const tStart = Date.now();
      const [liveMs, alertsMs, otpMs] = await Promise.all([
        timed("live", () => handleRefreshLive(env, ctx)),
        timed("alerts", () => handleRefreshAlerts(env, ctx)),
        timed("otp", () => handleRefreshOtp(env, ctx)),
      ]);
      console.log(`[cron] live=${liveMs}ms alerts=${alertsMs}ms otp=${otpMs}ms total=${Date.now() - tStart}ms`);
    } else if (event.cron === "0 10 * * *") {
      await handleOtpRollup(env);
    }
  },
};
