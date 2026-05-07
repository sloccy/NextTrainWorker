import { decodeFeedMessage, type LiveData } from "./proto-decode.js";

const TRIPUPDATE_URL = "https://open-data.rtd-denver.com/files/gtfs-rt/rtd/TripUpdate.pb";
const EMPTY: LiveData = { tripStatus: new Map(), stopOverrides: new Map() };

let cachedLive: LiveData | null = null;
let cachedAt = 0;
const STALE_MS = 5 * 60_000;

export async function fetchTripUpdates(): Promise<LiveData> {
  try {
    const resp = await fetch(TRIPUPDATE_URL, { headers: { "Accept-Encoding": "gzip" } });
    if (!resp.ok) throw new Error(`TripUpdate fetch failed: ${resp.status} ${resp.statusText}`);
    const buf = new Uint8Array(await resp.arrayBuffer());
    const decoded = decodeFeedMessage(buf);
    // Treat sparse payloads (< 50% of cached size) the same as empty — RTD sometimes
    // publishes bus-only snapshots mid-cycle that would wipe all rail status.
    const sparse = cachedLive && Date.now() - cachedAt < STALE_MS &&
      decoded.tripStatus.size < cachedLive.tripStatus.size * 0.5;
    if ((decoded.tripStatus.size === 0 || sparse) && cachedLive) {
      console.warn(`[tripupdate] sparse/empty decode (${decoded.tripStatus.size} vs cached ${cachedLive.tripStatus.size}), reusing cache`);
      return cachedLive;
    }
    cachedLive = decoded;
    cachedAt = Date.now();
    return decoded;
  } catch (err) {
    if (cachedLive && Date.now() - cachedAt < STALE_MS) {
      console.warn("[tripupdate] fetch/decode failed, using cached:", err);
      return cachedLive;
    }
    console.error("[tripupdate] fetch/decode failed and no cache:", err);
    return EMPTY;
  }
}
