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
    if (decoded.tripStatus.size === 0 && cachedLive && Date.now() - cachedAt < STALE_MS) {
      console.warn("[tripupdate] empty decode, reusing cache");
      return cachedLive;
    }
    // Merge: if we have a warm cache, backfill trips the new payload dropped.
    // New payload always wins for trips it contains; cache fills gaps.
    if (cachedLive && Date.now() - cachedAt < STALE_MS) {
      for (const [k, v] of cachedLive.tripStatus) {
        if (!decoded.tripStatus.has(k)) decoded.tripStatus.set(k, v);
      }
      for (const [k, v] of cachedLive.stopOverrides) {
        if (!decoded.stopOverrides.has(k)) decoded.stopOverrides.set(k, v);
      }
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
