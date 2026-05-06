import { decodeFeedMessage } from "./proto-decode.js";

const TRIPUPDATE_URL = "https://open-data.rtd-denver.com/files/gtfs-rt/rtd/TripUpdate.pb";

/** Map<tripIdHash, tripRelationship> where 3 = CANCELED. */
export type LiveByTripIdHash = Map<number, number>;

// Module-level cache for conditional GET. Survives across warm invocations.
let cachedEtag: string | null = null;
let cachedLastModified: string | null = null;
let cachedLive: LiveByTripIdHash = new Map();

/** Returns { live, fresh: false } on 304 — caller should skip R2 write. */
export async function fetchTripUpdates(): Promise<{ live: LiveByTripIdHash; fresh: boolean }> {
  const headers: Record<string, string> = { "Accept-Encoding": "gzip" };
  if (cachedEtag) headers["If-None-Match"] = cachedEtag;
  if (cachedLastModified) headers["If-Modified-Since"] = cachedLastModified;

  const resp = await fetch(TRIPUPDATE_URL, { headers });

  if (resp.status === 304) return { live: cachedLive, fresh: false };

  if (!resp.ok) {
    throw new Error(`TripUpdate fetch failed: ${resp.status} ${resp.statusText}`);
  }

  const buffer = await resp.arrayBuffer();
  cachedLive = decodeFeedMessage(new Uint8Array(buffer));
  cachedEtag = resp.headers.get("etag");
  cachedLastModified = resp.headers.get("last-modified");

  return { live: cachedLive, fresh: true };
}
