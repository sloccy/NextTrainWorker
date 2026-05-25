import type { Env } from "../types.js";
import { fetchAlerts } from "../live/alerts-fetch.js";
import { buildAlertsBin } from "../binary/alerts.js";
import { writeAlertsBin } from "../binary/r2.js";

export async function handleRefreshAlerts(env: Env, ctx: ExecutionContext): Promise<void> {
  let alerts;
  let fresh;
  try {
    ({ alerts, fresh } = await fetchAlerts());
  } catch (err) {
    console.error("[refresh-alerts] fetch failed:", err);
    return;
  }
  if (fresh) {
    const generatedAt = Math.floor(Date.now() / 1000);
    ctx.waitUntil(writeAlertsBin(env, buildAlertsBin(alerts, generatedAt)));
  }
}
