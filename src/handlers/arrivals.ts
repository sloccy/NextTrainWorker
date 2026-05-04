import type { Env, ArrivalsBlob, Direction } from "../types.js";
import { getArrivals } from "../r2.js";
import { json } from "./response.js";

const VALID_DIRS = new Set<Direction>(["N", "S", "E", "W"]);
const MAX_ARRIVALS = 10;

type MergedEntry = { r: string; t: string; l?: string; eff: number };

export async function handleArrivals(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const station = url.searchParams.get("s");
  const routesParam = url.searchParams.get("r");

  if (!station || !routesParam) {
    return json({ error: 'Missing required params: s and r (e.g. s=union&r=A:E,B:N)' }, 400);
  }

  const routePairs: { route: string; dir: Direction }[] = [];
  for (const pair of routesParam.split(",")) {
    const [route, dir] = pair.trim().split(":");
    if (!route || !dir) {
      return json({ error: `Invalid routes format. Each entry must be route:dir (e.g. A:E). Got: "${pair}"` }, 400);
    }
    if (!VALID_DIRS.has(dir as Direction)) {
      return json({ error: `Invalid direction "${dir}". Must be N, S, E, or W.` }, 400);
    }
    routePairs.push({ route, dir: dir as Direction });
  }

  const blob = await getArrivals(env);
  if (!blob) {
    return json({ error: "Arrivals data not yet available. Cron may not have run yet." }, 503);
  }

  const stationInfo = blob.stations?.[station];
  if (!stationInfo) {
    return json({ error: `Station "${station}" not found. Check the station slug.` }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  const merged: MergedEntry[] = [];

  for (const { route, dir } of routePairs) {
    for (const stopId of stationInfo.stop_ids) {
      const key = `${route}:${stopId}:${dir}`;
      const entry = blob.data[key];
      if (!entry) continue;

      for (const a of entry.a) {
        if (a.e < now - 60) continue;
        merged.push({ r: route, t: a.t, l: a.l, eff: a.e });
      }
    }
  }

  if (merged.length === 0) {
    return json({ error: "No data found for the requested station/route/direction combinations." }, 404);
  }

  merged.sort((a, b) => a.eff - b.eff);
  const a = merged.slice(0, MAX_ARRIVALS).map(({ r, t, l }) => l !== undefined ? { r, t, l } : { r, t });

  // Never tell the client to refresh in the past. Cron is every minute, so
  // generated_at + 65 is the *intended* next-refresh hint — but if cron lagged
  // or the request lands after that point, clamp to "30 s from now" so the
  // client doesn't see a stale timestamp and tight-loop.
  const n = Math.max(blob.generated_at + 65, now + 30);
  return json({ n, a }, 200, "public, max-age=20");
}
