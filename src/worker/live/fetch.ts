import { decodeFeedMessage, type LiveData } from "./decode.js";

const TRIPUPDATE_URL = "https://open-data.rtd-denver.com/files/gtfs-rt/rtd/TripUpdate.pb";

const EMPTY: LiveData = { tripStatus: new Map(), stopOverrides: new Map(), entitySeen: 0, entityMissed: 0, missedSamples: new Set() };
const STALE_MS = 60 * 60_000;

// Conditional GET cache — persists across warm isolate ticks
let cachedEtag: string | null = null;
let cachedLastMod: string | null = null;
let cachedLive: LiveData | null = null;
let cachedAt = 0;

export interface FetchResult {
  data: LiveData;
  fresh: boolean;
  decodeMs: number;
}

export async function fetchTripUpdates(): Promise<FetchResult> {
  try {
    const headers: Record<string, string> = { "Accept-Encoding": "gzip" };
    if (cachedEtag) headers["If-None-Match"] = cachedEtag;
    else if (cachedLastMod) headers["If-Modified-Since"] = cachedLastMod;

    const resp = await fetch(TRIPUPDATE_URL, { headers });

    if (resp.status === 304) {
      return { data: cachedLive ?? EMPTY, fresh: false, decodeMs: 0 };
    }

    if (!resp.ok) throw new Error(`TripUpdate fetch failed: ${resp.status} ${resp.statusText}`);

    const etag = resp.headers.get("ETag");
    const lastMod = resp.headers.get("Last-Modified");
    if (etag) cachedEtag = etag;
    else if (lastMod) cachedLastMod = lastMod;

    const buf = new Uint8Array(await resp.arrayBuffer());
    const t0 = Date.now();
    const decoded = decodeFeedMessage(buf);
    const decodeMs = Date.now() - t0;

    const prev = cachedLive;
    const prevAt = cachedAt;
    cachedLive = decoded;
    cachedAt = Date.now();

    if (prev && Date.now() - prevAt < STALE_MS &&
        decoded.tripStatus.size < prev.tripStatus.size * 0.5) {
      for (const [k, v] of prev.tripStatus) {
        if (!decoded.tripStatus.has(k)) decoded.tripStatus.set(k, v);
      }
      for (const [k, v] of prev.stopOverrides) {
        if (!decoded.stopOverrides.has(k)) decoded.stopOverrides.set(k, v);
      }
    }

    return { data: decoded, fresh: true, decodeMs };
  } catch (err) {
    if (cachedLive && Date.now() - cachedAt < STALE_MS) {
      console.warn("[fetch] failed, using stale:", err);
      return { data: cachedLive, fresh: false, decodeMs: 0 };
    }
    console.error("[fetch] failed, no cache:", err);
    return { data: EMPTY, fresh: false, decodeMs: 0 };
  }
}
