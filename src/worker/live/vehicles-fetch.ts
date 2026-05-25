import { decodeVehiclePositions, type VehicleEvent } from "./vehicles-decode.js";

const VP_URL = "https://www.rtd-denver.com/files/gtfs-rt/VehiclePosition.pb";

let cachedEtag: string | null = null;
let cachedLastModified: string | null = null;
let cachedEvents: VehicleEvent[] = [];

export async function fetchVehiclePositions(): Promise<{ events: VehicleEvent[]; fresh: boolean }> {
  const headers: Record<string, string> = { "Accept-Encoding": "gzip" };
  if (cachedEtag) headers["If-None-Match"] = cachedEtag;
  if (cachedLastModified) headers["If-Modified-Since"] = cachedLastModified;

  const resp = await fetch(VP_URL, { headers });

  if (resp.status === 304) return { events: cachedEvents, fresh: false };
  if (!resp.ok) throw new Error(`VehiclePosition fetch failed: ${resp.status} ${resp.statusText}`);

  const buffer = await resp.arrayBuffer();
  cachedEvents = decodeVehiclePositions(new Uint8Array(buffer));
  cachedEtag = resp.headers.get("etag");
  cachedLastModified = resp.headers.get("last-modified");

  return { events: cachedEvents, fresh: true };
}
