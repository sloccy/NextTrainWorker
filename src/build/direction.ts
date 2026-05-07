import type { Direction } from "../types.js";

interface LatLon { lat: number; lon: number }

function bearing(a: LatLon, b: LatLon): number {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const x = Math.sin(dLon) * Math.cos(lat2);
  const y = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
}

function bearingToCompass(deg: number): Direction {
  if (deg >= 315 || deg < 45) return "N";
  if (deg < 135) return "E";
  if (deg < 225) return "S";
  return "W";
}

export function inferDirections(
  railTrips: Map<string, { route_id: string; direction_id: number; headsign: string }>,
  stopCoords: Map<string, LatLon>,
  tripStops: Map<string, Array<{ stop_id: string; stop_sequence: number }>>,
): Map<string, Direction> {
  const seen = new Set<string>();
  const result = new Map<string, Direction>();

  for (const [tripId, trip] of railTrips) {
    const key = `${trip.route_id}:${trip.direction_id}`;
    if (seen.has(key)) continue;

    const stops = tripStops.get(tripId);
    if (!stops || stops.length < 2) continue;

    const sorted = [...stops].sort((a, b) => a.stop_sequence - b.stop_sequence);
    const first = stopCoords.get(sorted[0].stop_id);
    const last = stopCoords.get(sorted[sorted.length - 1].stop_id);
    if (!first || !last) continue;

    const dir = bearingToCompass(bearing(first, last));
    result.set(key, dir);
    seen.add(key);

    const h = trip.headsign.toLowerCase();
    const hintMap: Record<string, Direction> = {
      "\\bnorth\\b": "N", "\\bnorthbound\\b": "N",
      "\\bsouth\\b": "S", "\\bsouthbound\\b": "S",
      "\\beast\\b": "E", "\\beastbound\\b": "E",
      "\\bwest\\b": "W", "\\bwestbound\\b": "W",
    };
    for (const [pattern, hintDir] of Object.entries(hintMap)) {
      if (new RegExp(pattern).test(h) && hintDir !== dir) {
        console.warn(
          `[direction] ${key} headsign "${trip.headsign}" suggests ${hintDir} but geometry says ${dir}`,
        );
        break;
      }
    }
  }

  return result;
}
