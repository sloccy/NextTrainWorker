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
