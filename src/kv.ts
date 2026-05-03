import type { Env, ArrivalsBlob, ScheduleBlob } from "./types.js";

export async function getSchedule(env: Env): Promise<ScheduleBlob | null> {
  return env.SCHEDULE_KV.get<ScheduleBlob>("schedule:current", "json");
}

export async function getArrivals(env: Env): Promise<ArrivalsBlob | null> {
  return env.ARRIVALS_KV.get<ArrivalsBlob>("arrivals:current", "json");
}

// Writes blob only when its content has changed (FNV-1a hash comparison).
// Keeps writes well under the KV free-tier limit of 1,000/day.
export async function writeArrivalsIfChanged(env: Env, blob: ArrivalsBlob): Promise<boolean> {
  const serialized = JSON.stringify(blob);
  const newHash = fnv1a(serialized);
  const oldHash = await env.ARRIVALS_KV.get("arrivals:hash");
  if (oldHash === newHash) return false;

  await Promise.all([
    env.ARRIVALS_KV.put("arrivals:current", serialized),
    env.ARRIVALS_KV.put("arrivals:hash", newHash),
  ]);
  return true;
}

export async function writeSchedule(env: Env, blob: ScheduleBlob): Promise<void> {
  await env.SCHEDULE_KV.put("schedule:current", JSON.stringify(blob));
}

// FNV-1a 32-bit — fast, good distribution, no crypto overhead
function fnv1a(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16);
}
