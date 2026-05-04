import type { Env, ScheduleBlob } from "./types.js";

export async function getSchedule(env: Env): Promise<ScheduleBlob | null> {
  return env.SCHEDULE_KV.get<ScheduleBlob>("schedule:current", "json");
}

export async function getScheduleVersion(env: Env): Promise<string | null> {
  return env.SCHEDULE_KV.get("schedule:version");
}

export async function writeSchedule(env: Env, blob: ScheduleBlob): Promise<void> {
  await env.SCHEDULE_KV.put("schedule:current", JSON.stringify(blob));
}
