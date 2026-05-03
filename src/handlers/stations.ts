import type { Env, ArrivalsBlob } from "../types.js";
import { json } from "./response.js";

export async function handleStations(env: Env): Promise<Response> {
  const blob = await env.ARRIVALS_KV.get<ArrivalsBlob>("arrivals:current", "json");
  if (!blob) {
    return json({ error: "Schedule data not yet available. Cron may not have run yet." }, 503);
  }

  const stopToStation = new Map<string, string>(); // stop_id → station slug
  for (const [slug, info] of Object.entries(blob.stations ?? {})) {
    for (const stopId of info.stop_ids) {
      stopToStation.set(stopId, slug);
    }
  }

  // Deduplicated (route, dir) combos per station — keyed by "route:dir"
  const stationRoutes = new Map<string, Map<string, { r: string; c: string | null; d: string; h: string }>>();

  for (const [key, keyEntry] of Object.entries(blob.data)) {
    const [route, stopId, dir] = key.split(":");
    const stationSlug = stopToStation.get(stopId);
    if (!stationSlug) continue;
    if (!keyEntry.arrivals.length) continue;

    if (!stationRoutes.has(stationSlug)) {
      stationRoutes.set(stationSlug, new Map());
    }

    const comboKey = `${route}:${dir}`;
    if (!stationRoutes.get(stationSlug)!.has(comboKey)) {
      stationRoutes.get(stationSlug)!.set(comboKey, {
        r: route,
        c: keyEntry.route_color,
        d: dir,
        h: keyEntry.headsign,
      });
    }
  }

  const s = Object.keys(blob.stations ?? {})
    .map((slug) => ({
      k: slug,
      r: [...(stationRoutes.get(slug)?.values() ?? [])].sort(
        (a, b) => a.r.localeCompare(b.r) || a.d.localeCompare(b.d),
      ),
    }))
    .filter(s => s.r.length > 0)
    .sort((a, b) => a.k.localeCompare(b.k));

  return json({ g: blob.generated_at, s }, 200, "public, max-age=3600");
}
