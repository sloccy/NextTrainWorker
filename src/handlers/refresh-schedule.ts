import type { Env } from "../types.js";
import { buildSchedule } from "../gtfs/schedule-build.js";
import { writeSchedule } from "../kv.js";

export async function handleRefreshSchedule(env: Env): Promise<void> {
  console.log("[refresh-schedule] starting GTFS build");
  const schedule = await buildSchedule();
  await writeSchedule(env, schedule);
  const keyCount = Object.keys(schedule.by_key).length;
  console.log(`[refresh-schedule] done — ${keyCount} (route,stop,dir) keys written`);
}
